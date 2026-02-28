import { toNormalFive, toSanmaTile, toStandardTile, TILES, tileToString } from '../core/tile';
import type { Tile } from '../core/tile';
import { getShantenBreakdown, calculateShanten as calculateShantenCore } from '../core/shanten';

import * as Engine from './engine';
const { runSinglePath, evaluateWinningHand, getInitialCounts, TILE_TYPES, findBestDiscard27, getUkeireCount27, getWinningTiles, initShantenCache, clearShantenCache, getShantenMemoized, shuffleInPlace } = Engine;

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
    const initialBatchSize = 500;
    const additionalChunkSize = 100;
    const currentMaxTrials = 3000;

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

    let results: DiscardResult[] = possibleActions.map(action => {
        const afterHand = action.type === 'discard' ? removeOneTile(myHand, (action as any).tile) : myHand;
        return {
            action,
            winRate: 0, avgScore: 0, ev: 0, evMean: 0, ronRate: 0, tenpaiRate: 0,
            shantenBefore: initialShanten,
            shantenAfter: calculateShanten(afterHand, fixedMentsu.length),
            trialCount: 0, previousMeanEV: 0, stableCount: 0, converged: false,
            totalScore: 0, totalScore2: 0, totalWinPoints: 0, wins: 0, tenpaiCount: 0,
            layerA_totalScore: 0, layerB_totalScore: 0, layerA_trials: 0, layerB_trials: 0,
            stdError: 0, confidence95: 0
        } as any;
    });

    const mountainBuffer = new Uint8Array(136);
    const workTrialCounts = new Int8Array(29);
    const workHand27 = new Int8Array(27);
    const workUraCounts = new Int8Array(29);

    const runSingleTrialForAction = (res: any, mountainToUse: Uint8Array, layer?: 'A' | 'B') => {
        const result = runSinglePath(
            myHand, fixedMentsu, res.action, myKita, myKita + otherKita,
            doraIndicators, currentTurn, isDealer, mountainToUse, templateLen,
            templateCounts, workTrialCounts, workHand27, workUraCounts
        );
        if (res.trialCount === 0) res.initialRemainingTiles = result.initialRemainingTiles;

        if (layer === 'A') {
            res.layerA_totalScore += result.point;
            res.layerA_trials++;
        } else if (layer === 'B') {
            res.layerB_totalScore += result.point;
            res.layerB_trials++;
        }

        res.totalScore += result.point;
        res.totalScore2 += result.point * result.point;
        if (result.type === 'win') {
            res.wins++;
            res.totalWinPoints += result.point;
        }
        if (result.isTenpai) res.tenpaiCount++;
        res.trialCount++;

        // Final EV calculation: if stratified, use simple average of layer means
        if (res.layerA_trials > 0 && res.layerB_trials > 0) {
            res.ev = (res.layerA_totalScore / res.layerA_trials + res.layerB_totalScore / res.layerB_trials) / 2;
        } else {
            res.ev = res.totalScore / res.trialCount;
        }

        res.winRate = res.wins / res.trialCount;
        res.avgScore = res.wins > 0 ? res.totalWinPoints / res.wins : 0;
        res.tenpaiRate = res.tenpaiCount / res.trialCount;
    };

    // Stratification: Identify Effective Tiles of the current hand
    const initialEffectiveTiles = calculateEffectiveTiles(myHand, fixedMentsu.length, visible, myKita, otherKita);
    const isLayerA = (mountain: Uint8Array): boolean => {
        // Simple heuristic: Does the top 14 tiles contain more than average effective tiles?
        let count = 0;
        for (let i = 0; i < 14; i++) {
            const t = toStandardTile(mountain[i]);
            if (initialEffectiveTiles.some(et => et.tile === t)) count++;
        }
        return count >= 1; // Layer A if at least one effective tile is in the immediate draw range
    };

    // Phase 1: Rough Search (Stratified)
    for (let i = 0; i < initialBatchSize; i++) {
        for (let j = 0; j < templateLen; j++) mountainBuffer[j] = templateMountain[j];

        // We need to sample a mountain that matches the required layer (A or B)
        const targetLayer: 'A' | 'B' = (i % 2 === 0) ? 'A' : 'B';

        // In Stratified Sampling, we sample until we get a mountain of the target layer.
        let shuffleCount = 0;
        do {
            shuffleInPlace(mountainBuffer, templateLen);
            shuffleCount++;
        } while (isLayerA(mountainBuffer) !== (targetLayer === 'A') && shuffleCount < 10);

        for (const res of results) runSingleTrialForAction(res, mountainBuffer.slice(), targetLayer);
    }

    console.log({
        layerA_trials: results[0].layerA_trials,
        layerB_trials: results[0].layerB_trials
    });

    // Two-Step Lookahead
    if (LOOKAHEAD_ENABLED && initialShanten === 1) {
        const totalInvisible = (templateCounts as any).slice(0, 27).reduce((acc: number, val: number) => acc + val, 0);
        if (totalInvisible > 0) {
            const topCandidates = [...results].sort((a, b) => b.ev - a.ev).slice(0, 2);
            if (topCandidates.length >= 2) {
                const EV1 = topCandidates[0].ev;
                const EV2 = topCandidates[1].ev;
                const scale = Math.max(Math.abs(EV1), Math.abs(EV2), 1000);
                if (Math.abs(EV1 - EV2) / scale < 0.02 && EV1 > 0 && EV2 > 0) {
                    evaluateLookaheadForAction(topCandidates[0], config, templateCounts as any, totalInvisible, initialBatchSize, templateMountain, templateLen, workTrialCounts, workHand27, workUraCounts);
                    evaluateLookaheadForAction(topCandidates[1], config, templateCounts as any, totalInvisible, initialBatchSize, templateMountain, templateLen, workTrialCounts, workHand27, workUraCounts);
                }
            }
        }
    }

    // Phase 2: Selection
    const maxEV = Math.max(...results.map(r => r.ev));
    const candidates = results.filter(r => r.ev >= maxEV * 0.95).sort((a, b) => b.ev - a.ev).slice(0, 3);

    // Phase 3: Focused Search
    let stopReason = "";
    let focusedTrialCount = initialBatchSize;
    while (candidates.some(c => c.trialCount < currentMaxTrials && !c.converged)) {
        for (let i = 0; i < additionalChunkSize; i++) {
            for (let j = 0; j < templateLen; j++) mountainBuffer[j] = templateMountain[j];
            const targetLayer: 'A' | 'B' = (focusedTrialCount % 2 === 0) ? 'A' : 'B';

            let shuffleCount = 0;
            do {
                shuffleInPlace(mountainBuffer, templateLen);
                shuffleCount++;
            } while (isLayerA(mountainBuffer) !== (targetLayer === 'A') && shuffleCount < 10);

            for (const res of candidates) {
                if (res.trialCount >= currentMaxTrials || res.converged) continue;
                runSingleTrialForAction(res, mountainBuffer.slice(), targetLayer);
            }
            focusedTrialCount++;
        }

        console.log({
            layerA_trials: candidates[0].layerA_trials,
            layerB_trials: candidates[0].layerB_trials
        });

        // Standard Error Convergence Check
        const sorted = [...candidates].sort((a, b) => b.ev - a.ev);
        if (sorted.length >= 2) {
            const r1 = sorted[0];
            const r2 = sorted[1];

            const mean1 = r1.totalScore / r1.trialCount;
            const var1 = (r1.totalScore2 / r1.trialCount) - (mean1 * mean1);
            const se1 = Math.sqrt(Math.max(0, var1) / r1.trialCount);

            const mean2 = r2.totalScore / r2.trialCount;
            const var2 = (r2.totalScore2 / r2.trialCount) - (mean2 * mean2);
            const se2 = Math.sqrt(Math.max(0, var2) / r2.trialCount);

            const diff = Math.abs(mean1 - mean2);
            const combinedSe = Math.sqrt(se1 * se1 + se2 * se2);

            console.log({
                trials: r1.trialCount,
                diff: diff.toFixed(2),
                combinedStdError: combinedSe.toFixed(2),
                significanceRatio: (diff / (combinedSe || 1)).toFixed(4)
            });

            if (diff > 2 * combinedSe && r1.trialCount >= 200) {
                stopReason = "significant";
                console.log("=== SIGNIFICANCE STOP TRIGGERED ===", {
                    reason: stopReason,
                    trials: r1.trialCount,
                    diff: diff.toFixed(2),
                    combinedStdError: combinedSe.toFixed(2),
                    ratio: (diff / (combinedSe || 1)).toFixed(4)
                });
                for (const c of candidates) c.converged = true;
                break;
            }
        }

        if (candidates.every(c => c.trialCount >= currentMaxTrials)) {
            stopReason = "maxTrialsReached";
            console.log("=== MAX TRIALS REACHED ===", {
                reason: stopReason,
                trials: candidates[0].trialCount
            });
            break;
        }
    }

    const endTime = performance.now();
    const summary = createSummary(config, results[0].initialRemainingTiles, endTime - startTime);
    const finalResults = results.map(({ totalScore, wins, tenpaiCount, ...rest }: any) => {
        const handAfter = rest.action.type === 'discard' ? removeOneTile(myHand, rest.action.tile) : myHand;
        rest.effectiveTiles = calculateEffectiveTiles(handAfter, fixedMentsu.length, visible, myKita, otherKita);

        // Confidence Interval Calculation
        const mean = rest.ev;
        rest.evMean = mean;
        const variance = Math.max(0, (rest.totalScore2 / rest.trialCount) - (mean * mean));
        rest.stdError = Math.sqrt(variance / rest.trialCount);
        rest.confidence95 = 1.96 * rest.stdError;

        return rest;
    });

    // CRN Verification: Console Output
    const sorted = [...finalResults].sort((a, b) => b.ev - a.ev);
    console.log("=== FINAL EV RANKING ===");
    sorted.forEach((r, i) => {
        const actionStr = r.action.type === 'discard' ? `discard ${tileToString(r.action.tile)}` : r.action.type;
        console.log(`Rank ${i + 1}: ${actionStr} → EV: ${r.ev.toFixed(2)} ± ${r.confidence95.toFixed(2)} (n=${r.trialCount})`);
    });

    if (sorted.length >= 2) {
        const EV1 = sorted[0].ev;
        const EV2 = sorted[1].ev;
        const relDiff = Math.abs(EV1 - EV2) / Math.max(Math.abs(EV1), 1);
        console.log(`Final relativeDiff (Top1 vs Top2): ${relDiff.toFixed(4)}`);
    }

    self.postMessage({ type: 'RESULT', results: finalResults, summary });
    clearShantenCache();
}

const evaluateLookaheadForAction = (res: any, config: SimulationConfig, invCounts29: number[], totalInvisible: number, roughTrials: number, templateMountain: Uint8Array, templateLen: number, workTrialCounts: Int8Array, workHand27: Int8Array, workUraCounts: Int8Array) => {
    const { myHand, fixedMentsu, myKita, otherKita, doraIndicators, currentTurn, isDealer } = config;
    const hand27 = new Int8Array(27);
    for (const t of myHand) {
        const s = toSanmaTile(toNormalFive(t));
        if (s !== -1) hand27[s]++;
    }
    if (res.action.type === 'discard') {
        const sArr = toSanmaTile(toNormalFive(res.action.tile));
        if (sArr !== -1) hand27[sArr]--;
    } else return;

    const U_current = getUkeireCount27(hand27 as any, fixedMentsu.length, invCounts29 as any);
    const branches: any[] = [];
    for (let t = 0; t < 27; t++) {
        const count = invCounts29[t];
        if (count <= 0) continue;
        hand27[t]++;
        const s = getShantenMemoized(hand27, fixedMentsu.length);
        if (s === 0) branches.push({ t, prob: count / totalInvisible });
        else if (s === 1) {
            const bd = findBestDiscard27(hand27, fixedMentsu.length, invCounts29);
            if (bd !== -1) {
                hand27[bd]--;
                if (getUkeireCount27(hand27 as any, fixedMentsu.length, invCounts29) > U_current) branches.push({ t, prob: count / totalInvisible });
                hand27[bd]++;
            }
        }
        hand27[t]--;
    }
    const selected = branches.sort((a, b) => b.prob - a.prob).slice(0, 5);
    if (selected.length === 0) return;

    const trials = Math.max(200, Math.floor(roughTrials / 5));
    let integratedEV = 0;
    const branchMountain = new Uint8Array(136);

    for (let i = 0; i < trials; i++) {
        for (let j = 0; j < templateLen; j++) branchMountain[j] = templateMountain[j];
        shuffleInPlace(branchMountain, templateLen);
        let probSumSlice = 0;
        for (const b of selected) {
            const bh = [...myHand];
            const di = bh.indexOf(res.action.tile);
            if (di !== -1) bh.splice(di, 1);
            bh.push(TILE_TYPES[b.t]);
            const path = runSinglePath(bh, fixedMentsu, { type: 'tsumo' } as Action, myKita, myKita + otherKita, doraIndicators, currentTurn + 1, isDealer, branchMountain.slice(), templateLen, invCounts29 as any, workTrialCounts, workHand27, workUraCounts);
            integratedEV += (path.point * b.prob) / trials;
            probSumSlice += b.prob;
            if (probSumSlice > 0.35) break;
        }
    }
    const totalProb = Math.min(0.35, selected.reduce((s, b) => s + b.prob, 0));
    res.ev = integratedEV + res.ev * (1 - totalProb);
    res.isLookaheadApplied = true;
};

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
