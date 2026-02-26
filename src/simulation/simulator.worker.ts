import { runSinglePath, evaluateWinningHand, countDora, getWinningTiles } from './engine';
import type { SimulationConfig, Action, DiscardResult, SimulationSummary } from './engine';
import type { Tile, Mentsu } from '../core/shanten';
import { calculateShanten, getShantenBreakdown } from '../core/shanten';
import { toNormalFive } from '../core/tile';

function removeOneTile(hand: Tile[], tile: Tile): Tile[] {
    const copy = [...hand];
    const index = copy.indexOf(tile);
    if (index !== -1) {
        copy.splice(index, 1);
    }
    return copy;
}

self.onmessage = (e: MessageEvent) => {
    console.log("Worker received message:", e.data);
    try {
        const { type, config } = e.data;

        if (type === 'START_SIMULATION') {
            runBatchSimulations(config);
        } else {
            console.log("Unknown message type:", type);
        }
    } catch (error: any) {
        console.error("Worker Error:", error);
        self.postMessage({ type: 'error', error: error.message });
    }
};

function runBatchSimulations(
    config: SimulationConfig
) {
    const maxTrials = config.trials || 5000;
    const initialBatchSize = 1000;
    const additionalBatchSize = 500;
    const convergenceThreshold = 0.005; // 0.5%
    const stabilityRequired = 2;

    const { myHand, fixedMentsu, myKita, otherKita, doraIndicators, currentTurn, isDealer } = config;

    // Safety Check: If already Agari
    const initialShanten = calculateShanten(myHand, fixedMentsu.length);
    if (initialShanten === -1) {
        const winResult = evaluateWinningHand(myHand, config);
        if (winResult) {
            const summary = createSummary(config, 108); // Mock remaining tiles
            self.postMessage({ type: 'WIN', winResult, summary });
            return;
        }
    }

    // List of all visible tiles
    const visible: Tile[] = [
        ...config.myHand,
        ...config.myDiscards,
        ...config.doraIndicators
    ];
    for (const m of config.fixedMentsu) {
        visible.push(...m.tiles);
    }

    const possibleActions = getPossibleActions(config);
    let results: DiscardResult[] = possibleActions.map(action => {
        const before = calculateShanten(myHand, fixedMentsu.length);
        let afterHand;
        if (action.type === 'discard') {
            afterHand = removeOneTile(myHand, action.tile);
        } else {
            afterHand = myHand;
        }
        const after = calculateShanten(afterHand, fixedMentsu.length);

        return {
            action,
            winRate: 0,
            avgScore: 0,
            ev: 0,
            ronRate: 0,
            tenpaiRate: 0,
            shantenBefore: before,
            shantenAfter: after,
            trialCount: 0,
            previousMeanEV: 0,
            stableCount: 0,
            converged: false,
            totalScore: 0, // EV sum (includes draw points)
            totalWinPoints: 0, // Win points only for avgScore
            wins: 0,       // Temp field
            tenpaiCount: 0 // Temp field
        } as any;
    });

    const runTrialsForAction = (res: any, count: number) => {
        for (let i = 0; i < count; i++) {
            const result = runSinglePath(
                myHand,
                fixedMentsu,
                res.action,
                visible,
                myKita,
                otherKita,
                doraIndicators,
                currentTurn,
                isDealer
            );

            if (res.trialCount === 0 && i === 0) res.initialRemainingTiles = result.initialRemainingTiles;

            // Always add to totalScore (includes +1000/-1000 for draws)
            res.totalScore += result.point;

            if (result.type === 'win') {
                res.wins++;
                res.totalWinPoints += result.point;
            }
            if (result.isTenpai) {
                res.tenpaiCount++;
            }
            res.trialCount++;
        }
        res.winRate = res.wins / res.trialCount;
        res.avgScore = res.wins > 0 ? res.totalWinPoints / res.wins : 0;
        res.ev = res.totalScore / res.trialCount;
        res.tenpaiRate = res.tenpaiCount / res.trialCount;
    };

    // Phase 1: Rough Search (1000 trials)
    for (const res of results) {
        runTrialsForAction(res, initialBatchSize);
    }

    // Phase 2: Selection
    const maxEV = Math.max(...results.map(r => r.ev));
    const candidates = results
        .filter(r => r.ev >= maxEV * 0.95)
        .sort((a, b) => b.ev - a.ev)
        .slice(0, 3);

    // Phase 3: Focused Search & Convergence
    for (const res of candidates) {
        while (res.trialCount < maxTrials && !res.converged) {
            res.previousMeanEV = res.ev;
            runTrialsForAction(res, additionalBatchSize);

            const percentDiff = Math.abs(res.ev - res.previousMeanEV) / Math.max(Math.abs(res.previousMeanEV), 1);
            if (percentDiff < convergenceThreshold) {
                res.stableCount++;
            } else {
                res.stableCount = 0;
            }

            if (res.stableCount >= stabilityRequired) {
                res.converged = true;
            }
        }
    }

    // Final Logging
    let totalTrialsOverall = 0;
    for (const res of results) {
        const actionDesc = res.action.type === 'discard' || res.action.type === 'ankan' || res.action.type === 'kakan'
            ? `${res.action.type} ${res.action.tile}`
            : res.action.type;
        console.log(`Action: ${actionDesc}`);
        console.log(`  Total Trials: ${res.trialCount}`);
        console.log(`  Converged: ${res.converged}`);
        console.log(`  Final EV: ${Math.round(res.ev)}`);
        totalTrialsOverall += res.trialCount;
    }
    console.log(`Total simulation trials overall: ${totalTrialsOverall}`);

    const summary = createSummary(config, (results.length > 0 && results[0].initialRemainingTiles !== undefined) ? results[0].initialRemainingTiles : 108);
    // Cleanup temp fields before sending back
    const finalResults = results.map(({ totalScore, wins, tenpaiCount, ...rest }: any) => {
        // Calculate Ukeire (Effective Tiles)
        const handAfter = rest.action.type === 'discard' ? removeOneTile(myHand, rest.action.tile) : myHand;
        rest.effectiveTiles = calculateEffectiveTiles(handAfter, fixedMentsu.length, visible, myKita, otherKita);
        return rest;
    });

    self.postMessage({ type: 'PROGRESS', results: finalResults, summary });
    self.postMessage({ type: 'RESULT', results: finalResults, summary });
}

function calculateEffectiveTiles(
    hand: Tile[],
    fixedMentsuCount: number,
    visible: Tile[],
    myKita: number,
    otherKita: number
): { tile: Tile; count: number }[] {
    const currentShanten = calculateShanten(hand, fixedMentsuCount);
    const results: { tile: Tile; count: number }[] = [];

    // Calculate remaining counts
    const remaining = new Array(34).fill(4);
    // Sanma specific: 2m-8m are not used
    for (let i = 1; i <= 7; i++) remaining[i] = 0;

    for (const t of visible) {
        const norm = toNormalFive(t);
        if (norm >= 0 && norm < 34) remaining[norm]--;
    }
    // North tiles
    const TILES_NORTH = 30;
    remaining[TILES_NORTH] -= (myKita + otherKita);

    // If Tenpai (0), use getWinningTiles logic
    if (currentShanten === 0) {
        const winningTiles = getWinningTiles(hand, fixedMentsuCount);
        for (const t of winningTiles) {
            const norm = toNormalFive(t);
            const count = Math.max(0, remaining[norm]);
            if (count > 0) {
                results.push({ tile: t, count });
            }
        }
    } else {
        // Iterate over all valid tiles
        for (let t = 0; t < 34; t++) {
            if (remaining[t] <= 0) continue;

            // Try adding tile
            const newHand = [...hand, t as Tile];
            const newShanten = calculateShanten(newHand, fixedMentsuCount);

            if (newShanten < currentShanten) {
                results.push({ tile: t as Tile, count: remaining[t] });
            }
        }
    }

    // Sort: Type order (m, p, s, z) then number
    return results.sort((a, b) => a.tile - b.tile);
}

function getPossibleActions(config: SimulationConfig): Action[] {
    const actions: Action[] = [];
    const hand = config.myHand;

    // 1. Initial Tsumo check (if hand is 14 tiles)
    if (hand.length % 3 === 2) {
        const shanten = calculateShanten(hand, config.fixedMentsu.length);
        if (shanten === -1) {
            actions.push({ type: 'tsumo' });
        }
    }

    // 2. Discards
    const uniqueTiles = Array.from(new Set(hand));
    for (const tile of uniqueTiles) {
        actions.push({ type: 'discard', tile });
        // Riichi if Tenpai
        const tempHand = removeOneTile(hand, tile);
        if (config.fixedMentsu.length === 0 && calculateShanten(tempHand, 0) === 0) {
            actions.push({ type: 'discard', tile, riichi: true });
        }
    }

    // 3. Kita
    const TILES_NORTH = 30;
    if (hand.includes(TILES_NORTH as any)) {
        actions.push({ type: 'kita' });
    }

    return actions;
}

function createSummary(config: SimulationConfig, remainingTiles: number): SimulationSummary {
    const breakdown = getShantenBreakdown(config.myHand, config.fixedMentsu.length);
    return {
        remainingTiles: remainingTiles,
        shanten: {
            normal: breakdown.normal,
            chiitoi: breakdown.chiitoi,
            kokushi: breakdown.kokushi
        }
    };
}

