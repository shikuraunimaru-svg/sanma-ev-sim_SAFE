import { toNormalFive, toSanmaTile, TILES, tileToString } from '../core/tile';
import type { Tile } from '../core/tile';
import { getShantenBreakdown, calculateShanten as calculateShantenCore } from '../core/shanten';

import * as Engine from './engine';
const { runSinglePath, evaluateWinningHand, getInitialCounts, TILE_TYPES, findBestDiscard27, getUkeireCount27, getWinningTiles, initShantenCache, clearShantenCache, getShantenMemoized, shuffleInPlace, resetDebugCounters, getShantenBreakdown27, simpleHash } = Engine;

import type { SimulationConfig, Action, DiscardResult, SimulationSummary } from './engine';

const calculateShanten = (hand: Tile[] | Int8Array, fixedCount: number) => {
    if (hand instanceof Int8Array) return getShantenMemoized(hand, fixedCount);
    return calculateShantenCore(hand, fixedCount);
};

function removeOneTile(hand: Tile[], tile: Tile): Tile[] {
    const copy = [...hand];
    const index = copy.indexOf(tile);
    if (index !== -1) {
        copy.splice(index, 1);
    }
    return copy;
}

const LOOKAHEAD_ENABLED = true;

if (typeof self !== 'undefined') {
    self.onmessage = (e: MessageEvent) => {
        try {
            const { type, config } = e.data;
            if (type === 'START_SIMULATION') {
                runBatchSimulations(config);
            }
        } catch (error: any) {
            console.error("Worker Error:", error);
            self.postMessage({ type: 'error', error: error.message });
        }
    };
}

export function runBatchSimulations(config: SimulationConfig) {
    const startTime = performance.now();
    initShantenCache();
    resetDebugCounters();

    // Successive Elimination Constants
    const LOOKAHEAD_ENABLED = true;
    const TOP_K = 3;

    const { myHand, fixedMentsu, myKita, otherKita, doraIndicators, currentTurn, isDealer } = config;

    const initialShanten = calculateShanten(myHand, fixedMentsu.length);
    if (initialShanten === -1) {
        const winResult = evaluateWinningHand(myHand, config);
        if (winResult) {
            const summary = createSummary(config, 108);
            self.postMessage({ type: 'WIN', winResult, summary });
            return;
        }
    }

    const possibleActions = getPossibleActions(config);

    console.log("=== CANDIDATES GENERATED ===");
    console.table(possibleActions.map(a => ({
        type: a.type,
        tileInd: (a as any).tile,
        tileName: a.type === 'discard' ? tileToString((a as any).tile) : undefined
    })));

    const visible: Tile[] = [
        ...config.myHand,
        ...config.myDiscards,
        ...config.doraIndicators
    ];
    for (const m of config.fixedMentsu) visible.push(...m.tiles);

    const templateCounts = getInitialCounts();
    for (const t of visible) {
        const idx = TILE_TYPES.indexOf(t);
        if (idx !== -1 && templateCounts[idx] > 0) templateCounts[idx]--;
    }
    const northIdx = TILE_TYPES.indexOf(Engine.TILES.z4);
    templateCounts[northIdx] = Math.max(0, templateCounts[northIdx] - (myKita + otherKita));

    const templateMountain = new Uint8Array(136);
    let mIdx = 0;
    for (let i = 0; i < 29; i++) {
        const c = templateCounts[i];
        for (let j = 0; j < c; j++) templateMountain[mIdx++] = i;
    }
    const templateLen = mIdx;

    const TOTAL_TILES = 108;
    const playerHandCount = 14;
    const otherHandsCount = 26;
    const deadWallCount = 14;
    const totalNukiCount = myKita + otherKita;

    const expectedMountainSize = TOTAL_TILES - playerHandCount - otherHandsCount - deadWallCount - totalNukiCount;
    // The usable mountain size (live wall)
    const mountainSize = expectedMountainSize;

    if (mountainSize !== expectedMountainSize) {
        console.error("MOUNTAIN SIZE MISMATCH", mountainSize, expectedMountainSize);
        throw new Error("Mountain size mismatch");
    }



    let results: DiscardResult[] = possibleActions.map(action => {
        const afterHand = action.type === 'discard' ? removeOneTile(myHand, (action as any).tile) : myHand;
        const workHand = new Int8Array(27);
        for (const t of afterHand) {
            const s = toSanmaTile(toNormalFive(t));
            if (s !== -1) workHand[s]++;
        }
        const bd = getShantenBreakdown27(workHand as any, fixedMentsu.length);
        const normalShanten = bd.normal;
        const chiitoiShanten = bd.chiitoi;
        const minShanten = Math.min(normalShanten, chiitoiShanten, bd.kokushi);
        const actionTile = (action as any).tile;
        const tile = actionTile !== undefined ? tileToString(actionTile) : action.type;

        if (tile === "6s") {
            console.log("DEBUG_6s_SHANTEN",
                normalShanten,
                chiitoiShanten,
                minShanten
            );
        }

        let logTile = tile;
        if (tile === "5z") logTile = "白";
        else if (tile === "6z") logTile = "發";
        else if (tile === "7z") logTile = "中";

        if (["1m", "9m", "白", "發", "中"].includes(logTile)) {
            console.log("SYMMETRY_SHANTEN_CHECK", logTile, {
                normal: normalShanten,
                chiitoi: chiitoiShanten
            });
            const effectiveTiles = calculateEffectiveTiles(afterHand, fixedMentsu.length, visible, myKita, otherKita);
            const totalUkeire = effectiveTiles.reduce((acc, curr) => acc + curr.count, 0);
            console.log("SYMMETRY_EFFECTIVE_TILES", logTile, effectiveTiles);
            console.log("SYMMETRY_UKEIRE_COUNT", logTile, totalUkeire);
        }

        return {
            action,
            winRate: 0, avgScore: 0, ev: 0, evMean: 0, ronRate: 0, tenpaiRate: 0,
            shantenBefore: initialShanten,
            shantenAfter: minShanten,
            trialCount: 0, previousMeanEV: 0, stableCount: 0, converged: false,
            totalScore: 0, totalScore2: 0, totalWinPoints: 0, wins: 0, tenpaiCount: 0,
            layerA_totalScore: 0, layerB_totalScore: 0, layerA_trials: 0, layerB_trials: 0,
            stdError: 0, confidence95: 0, m2: 0, ciLower: 0, ciUpper: 0
        } as any;
    });

    // Explicitly log Lookahead trigger condition for all arms
    results.forEach(res => {
        const actionTile = (res.action as any).tile;
        const tile = actionTile !== undefined ? tileToString(actionTile) : res.action.type;
        const workHand = new Int8Array(27);
        const afterHand = res.action.type === 'discard' ? removeOneTile(myHand, actionTile) : myHand;
        for (const t of afterHand) {
            const s = toSanmaTile(toNormalFive(t));
            if (s !== -1) workHand[s]++;
        }
        const bd = getShantenBreakdown27(workHand as any, fixedMentsu.length);
        const normalShanten = bd.normal;
        const chiitoiShanten = bd.chiitoi;
        const minShanten = Math.min(normalShanten, chiitoiShanten, bd.kokushi);

        const twoStepCondition = (LOOKAHEAD_ENABLED && initialShanten === 1);

        if (tile === "6s") {
            console.log("DEBUG_6s_CONDITION",
                normalShanten,
                chiitoiShanten,
                minShanten,
                twoStepCondition
            );
        }
    });

    const updateStats = (res: any, point: number) => {
        res.trialCount++;
        const delta = point - res.ev;
        res.ev += delta / res.trialCount;
        const delta2 = point - res.ev;
        res.m2 += delta * delta2;

        res.evMean = res.ev;
        if (res.trialCount > 1) {
            const variance = Math.max(1e-9, res.m2 / (res.trialCount - 1));
            res.stdError = Math.sqrt(variance / res.trialCount);
        } else {
            res.stdError = Infinity;
        }
    };

    const mountainBuffer = new Uint8Array(136);
    const workTrialCounts = new Int8Array(29);
    const workHand27 = new Int8Array(27);
    const workUraCounts = new Int8Array(29);

    const runSingleTrialForAction = (res: any, mountainArr: Uint8Array) => {
        const afterHand = res.action.type === 'discard' ? removeOneTile(myHand, res.action.tile) : myHand;

        const mHashStr = simpleHash(mountainArr, templateLen);
        const mHash = parseInt(mHashStr, 16) || 0;
        const seed = (mHash + res.trialCount) >>> 0;

        const result = runSinglePath(
            afterHand, fixedMentsu, res.action, myKita, otherKita, doraIndicators,
            currentTurn, isDealer, mountainArr, templateLen,
            templateCounts as any, workTrialCounts, workHand27, workUraCounts,
            seed, 0 // Start with tenpaiDepth 0
        );
        if (res.trialCount === 0) res.initialRemainingTiles = result.initialRemainingTiles;

        updateStats(res, result.point);
        if (result.type === 'win') {
            res.wins++;
            res.totalWinPoints += result.point;
        }
        if (result.isTenpai) res.tenpaiCount++;

        res.winRate = res.wins / res.trialCount;
        res.avgScore = res.wins > 0 ? res.totalWinPoints / res.wins : 0;
        res.tenpaiRate = res.tenpaiCount / res.trialCount;
        res.agariCount = res.wins;
        res.agariRate = res.winRate;
    };

    // Ultimate Successive Elimination
    const allCandidates = results.map(r => ({ ...r, m2: 0, ev: 0, trialCount: 0 }));
    let activeCandidates = [...allCandidates];
    let totalTrialsSoFar = 0;
    const minSamples = 200;

    // Config based on hand state
    const isTenpai = (initialShanten === 0);
    const epsilon = isTenpai ? 0.008 : 0.015;
    const hardLimitPerCandidate = isTenpai ? 60000 : 30000;
    const globalHardLimit = hardLimitPerCandidate * activeCandidates.length;

    console.log(`Ultimate SE Config: state=${isTenpai ? 'Tenpai' : 'Ishanten'}, epsilon=${epsilon}, hardLimit=${globalHardLimit}`);

    const getZ = (n: number) => 1.96 + 0.1 * Math.log2(n || 1);

    let stopReason = "unknown";

    console.log(`[Trial Start] mountainSize: ${mountainSize} (Total Nuki: ${totalNukiCount})`);

    // Phase 0: Initial uniform sampling
    for (const candidate of activeCandidates) {
        for (let i = 0; i < minSamples; i++) {
            for (let j = 0; j < templateLen; j++) mountainBuffer[j] = templateMountain[j];
            shuffleInPlace(mountainBuffer, templateLen);
            runSingleTrialForAction(candidate, mountainBuffer);
            totalTrialsSoFar++;
        }
    }

    while (totalTrialsSoFar < globalHardLimit && activeCandidates.length > 0) {
        // 1. Sampling: Priority to max SE. Tenpai maintaining gets 1.2x weight.
        let target = activeCandidates[0];
        let maxWeightedSe = -1;
        for (const c of activeCandidates) {
            let weight = 1.0;
            if (isTenpai && c.shantenAfter === 0) weight = 1.2;
            const wSe = c.stdError * weight;
            if (wSe > maxWeightedSe) {
                maxWeightedSe = wSe;
                target = c;
            }
        }

        // Run trial
        for (let j = 0; j < templateLen; j++) mountainBuffer[j] = templateMountain[j];
        shuffleInPlace(mountainBuffer, templateLen);
        runSingleTrialForAction(target, mountainBuffer);
        totalTrialsSoFar++;

        // Sync CI
        const currentZ = getZ(activeCandidates.length);
        for (const c of activeCandidates) {
            c.ciLower = c.ev - currentZ * c.stdError;
            c.ciUpper = c.ev + currentZ * c.stdError;
        }

        if (totalTrialsSoFar % 100 === 0) {
            console.log("active:", activeCandidates.length, "trials:", totalTrialsSoFar);
        }

        if (activeCandidates.length <= 1) continue;

        // 2. Evaluation
        activeCandidates.sort((a, b) => b.ev - a.ev);
        const best = activeCandidates[0];
        const second = activeCandidates[1];

        // Elimination Check
        for (let i = activeCandidates.length - 1; i >= 1; i--) {
            const c = activeCandidates[i];
            if (isTenpai && c.shantenAfter > 0) {
                // テンパイ崩しは保留
                if (c.trialCount > 2 * minSamples && c.ciUpper < best.ciLower) {
                    activeCandidates.splice(i, 1);
                }
            } else {
                // 通常排除
                if (c.trialCount > minSamples && c.ciUpper < best.ciLower) {
                    activeCandidates.splice(i, 1);
                }
            }
        }

        if (best.trialCount > minSamples && second.trialCount > minSamples) {
            const diff = best.ev - second.ev;

            // Cond A: Separation
            const combinedSE = Math.sqrt(best.stdError ** 2 + second.stdError ** 2);
            let separated = false;
            if (combinedSE < 1e-9) {
                separated = diff > 0;
            } else {
                separated = diff > currentZ * combinedSE;
            }

            if (separated) {
                stopReason = "CI_SEPARATED";
                break;
            }

            // Cond B: Relative Epsilon
            const scale = Math.max(Math.abs(best.ev), Math.abs(second.ev), 1000);
            const relativeDiff = Math.abs(diff) / scale;
            if (relativeDiff < epsilon) {
                stopReason = "RELATIVE_EPSILON";
                break;
            }
        }

        if (activeCandidates.length === 1) {
            stopReason = "SINGLE_ARM";
            break;
        }
    }

    if (totalTrialsSoFar >= globalHardLimit) {
        stopReason = "HARD_LIMIT";
        console.log(`=== HARD LIMIT REACHED ===`);
    }

    // Result Determination: Calculate final bounds
    const finalZ = getZ(activeCandidates.length);
    for (const c of allCandidates) {
        c.lcb = c.ev - finalZ * c.stdError;
        c.confidence95 = finalZ * c.stdError; // Final CI delta for UI
        c.ciLower = c.ev - finalZ * c.stdError;
        c.ciUpper = c.ev + finalZ * c.stdError;
    }

    const finalSorted = [...allCandidates].sort((a, b) => {
        if (stopReason === "HARD_LIMIT") return (b.lcb ?? -999999) - (a.lcb ?? -999999);
        return b.ev - a.ev;
    });

    const winner = finalSorted[0];
    const runnerUp = finalSorted[1];

    console.log(`=== UNIFIED SE END: ${stopReason} ===`);
    console.log(`State: ${isTenpai ? 'Tenpai' : 'Ishanten'}`);
    console.log(`Trials: ${totalTrialsSoFar}`);
    console.log(`Best: ${winner.ev.toFixed(1)} (LCB: ${(winner.lcb ?? 0).toFixed(1)}, n=${winner.trialCount})`);
    if (runnerUp) console.log(`Second: ${runnerUp.ev.toFixed(1)} (LCB: ${(runnerUp.lcb ?? 0).toFixed(1)}, n=${runnerUp.trialCount})`);

    const endTime = performance.now();
    const summary = createSummary(config, winner.initialRemainingTiles, endTime - startTime);

    const processedResults = allCandidates.map((r: any) => {
        const handAfter = r.action.type === 'discard' ? removeOneTile(myHand, r.action.tile) : myHand;
        return {
            ...r,
            effectiveTiles: calculateEffectiveTiles(handAfter, fixedMentsu.length, visible, myKita, otherKita),
            evMean: r.ev,
            confidence95: r.confidence95,
            agariCount: r.wins,
            agariRate: r.trialCount > 0 ? (r.wins / r.trialCount) : 0
        };
    });

    self.postMessage({ type: 'RESULT', results: processedResults, summary });
    clearShantenCache();
}

function calculateEffectiveTiles(hand: Tile[], fixedMentsuCount: number, visible: Tile[], myKita: number, otherKita: number): { tile: Tile; count: number }[] {
    const currentShanten = calculateShanten(hand, fixedMentsuCount);
    const results: { tile: Tile; count: number }[] = [];
    const remaining = new Array(34).fill(4);
    for (let i = 1; i <= 7; i++) remaining[i] = 0;
    for (const t of visible) {
        const n = toNormalFive(t);
        if (n >= 0 && n < 34) remaining[n]--;
    }
    remaining[30] -= (myKita + otherKita);
    if (currentShanten === 0) {
        for (const t of getWinningTiles(hand, fixedMentsuCount)) {
            const c = Math.max(0, remaining[toNormalFive(t)]);
            if (c > 0) results.push({ tile: t, count: c });
        }
    } else {
        for (let t = 0; t < 34; t++) {
            if (remaining[t] > 0 && calculateShanten([...hand, t as Tile], fixedMentsuCount) < currentShanten) {
                results.push({ tile: t as Tile, count: remaining[t] });
            }
        }
    }
    return results.sort((a, b) => a.tile - b.tile);
}

function getPossibleActions(config: SimulationConfig): Action[] {
    const actions: Action[] = [];
    const hand = config.myHand;
    if (hand.length % 3 === 2 && calculateShanten(hand, config.fixedMentsu.length) === -1) actions.push({ type: 'tsumo' });
    for (const tile of Array.from(new Set(hand))) {
        actions.push({ type: 'discard', tile });
        if (config.fixedMentsu.length === 0 && calculateShanten(removeOneTile(hand, tile), 0) === 0) actions.push({ type: 'discard', tile, riichi: true });
    }
    if (hand.includes(TILES.z4 as any)) actions.push({ type: 'kita' });
    return actions;
}

function createSummary(config: SimulationConfig, remainingTiles: number, totalTimeMs?: number): SimulationSummary {
    const b = getShantenBreakdown(config.myHand, config.fixedMentsu.length);
    return { remainingTiles, shanten: { normal: b.normal, chiitoi: b.chiitoi, kokushi: b.kokushi }, totalTimeMs };
}
