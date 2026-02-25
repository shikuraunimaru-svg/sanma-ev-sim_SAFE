console.log("Worker file loaded");
import { runSinglePath, evaluateWinningHand, countDora } from './engine';
import type { SimulationConfig, Action, DiscardResult, SimulationSummary } from './engine';
import type { Tile, Mentsu } from '../core/shanten';
import { calculateShanten, getShantenBreakdown } from '../core/shanten';

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
    const batchSize = config.trials;
    const { myHand, fixedMentsu, kitaCount, doraIndicators, currentTurn, isDealer } = config;
    console.log("Worker started");
    console.log("Original batchSize:", batchSize);

    // List of all visible tiles (Hand + Discards + Melds + Dora)
    const visible: Tile[] = [
        ...config.myHand,
        ...config.myDiscards,
        ...config.doraIndicators
    ];
    for (const m of config.fixedMentsu) {
        visible.push(...m.tiles);
    }

    const results: any[] = [];
    const possibleActions = getPossibleActions(config);
    console.log("Possible actions count:", possibleActions.length);

    for (const action of possibleActions) {
        console.log("Running action:", action.type);
        let wins = 0;
        let totalScore = 0;
        let tenpaiCount = 0;
        let ronCount = 0;

        let firstPathInitialTotal = 108;
        for (let i = 0; i < batchSize; i++) {
            const result = runSinglePath(
                myHand,
                fixedMentsu,
                action,
                visible,
                kitaCount,
                doraIndicators,
                currentTurn,
                isDealer
            );

            if (i === 0) firstPathInitialTotal = result.initialRemainingTiles;

            if (result.type === 'win') {
                wins++;
                totalScore += result.point;
            }
            if (result.isTenpai) {
                tenpaiCount++;
            }
        }

        const before = calculateShanten(myHand, fixedMentsu.length);
        let afterHand;
        if (action.type === 'discard') {
            afterHand = removeOneTile(myHand, action.tile);
        } else {
            afterHand = myHand;
        }
        const after = calculateShanten(afterHand, fixedMentsu.length);

        console.log("Action:", action);
        console.log("Before shanten:", before);
        console.log("After shanten:", after);
        console.log("Hand after discard:", afterHand);

        results.push({
            action,
            winRate: wins / batchSize,
            avgScore: wins > 0 ? totalScore / wins : 0,
            ev: totalScore / batchSize,
            tenpaiRate: tenpaiCount / batchSize,
            ronRate: ronCount / batchSize, // Placeholder for now
            shantenBefore: before,
            shantenAfter: after,
            initialRemainingTiles: firstPathInitialTotal
        });
    }

    const summary = createSummary(config, results.length > 0 ? results[0].initialRemainingTiles : 108);
    self.postMessage({ type: 'PROGRESS', results, summary });
    self.postMessage({ type: 'RESULT', results, summary });
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
    if (hand.includes(34 as any)) { // NORTH
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

