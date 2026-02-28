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
    const INITIAL_TRIALS = 300;
    const MIN_TRIALS_FOR_ELIMINATION = 300;
    const Z_VALUE = 1.96;
    const MAX_TOTAL_TRIALS = 10000; // Increased for higher precision
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

        res.evMean = res.ev; // Compatibility alias

        if (res.trialCount > 1) {
            const variance = Math.max(0, res.m2 / (res.trialCount - 1));
            res.stdError = Math.sqrt(variance / res.trialCount);
            res.confidence95 = Z_VALUE * res.stdError;
            res.ciLower = res.ev - res.confidence95;
            res.ciUpper = res.ev + res.confidence95;
        }
    };


    const mountainBuffer = new Uint8Array(136);
    const workTrialCounts = new Int8Array(29);
    const workHand27 = new Int8Array(27);
    const workUraCounts = new Int8Array(29);

    const runSingleTrialForAction = (res: any, mountainArr: Uint8Array) => {
        const afterHand = res.action.type === 'discard' ? removeOneTile(myHand, res.action.tile) : myHand;

        // Stable seed for internal trial randomness (CRN support)
        const mHashStr = simpleHash(mountainArr, templateLen);
        const mHash = parseInt(mHashStr, 16) || 0;
        const seed = (mHash + res.trialCount) >>> 0;

        const result = runSinglePath(
            afterHand, fixedMentsu, res.action, myKita, otherKita, doraIndicators,
            currentTurn, isDealer, mountainArr, templateLen,
            templateCounts as any, workTrialCounts, workHand27, workUraCounts,
            seed
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
    };

    // Successive Elimination Implementation
    let activeCandidates = [...results];
    let totalTrialsSoFar = 0;
    let mountainSnapshotLogged = false;

    // Phase 0: Uniform Initial Sampling (Strictly 300 per arm)
    console.log(`Starting Phase 0: Sampling ${INITIAL_TRIALS} trials for each of ${activeCandidates.length} arms.`);
    for (const res of activeCandidates) {
        for (let i = 0; i < INITIAL_TRIALS; i++) {
            for (let j = 0; j < templateLen; j++) mountainBuffer[j] = templateMountain[j];
            shuffleInPlace(mountainBuffer, templateLen);
            if (!mountainSnapshotLogged) {
                console.log("=== MOUNTAIN SNAPSHOT (first 20 tiles) ===");
                console.log(Array.from(mountainBuffer.slice(0, 20)));
                mountainSnapshotLogged = true;
            }
            runSingleTrialForAction(res, mountainBuffer.slice());
            totalTrialsSoFar++;
        }
    }

    // Main Loop
    let round = 0;
    while (totalTrialsSoFar < MAX_TOTAL_TRIALS) {
        round++;

        // Identify best arm B
        const sorted = [...activeCandidates].sort((a, b) => b.ev - a.ev);
        const B = sorted[0];
        const S = sorted.length > 1 ? sorted[1] : null;

        // Round Logging
        if (round === 1 || round % 100 === 0) {
            console.log(`Round ${round}: Total Trials=${totalTrialsSoFar}`);
            console.table(activeCandidates.map(c => {
                const actionTile = (c.action as any).tile;
                return {
                    tile: actionTile !== undefined ? tileToString(actionTile) : c.action.type,
                    mean: c.ev.toFixed(2),
                    SE: c.stdError.toFixed(2),
                    n: c.trialCount,
                    CI_lower: c.ciLower.toFixed(2),
                    CI_upper: c.ciUpper.toFixed(2)
                };
            }));
        }

        // Elimination and Concentration only after initial samples are complete for EVERY arm
        const allArmsReady = activeCandidates.every(c => c.trialCount >= MIN_TRIALS_FOR_ELIMINATION);

        if (allArmsReady) {
            // Phase 1: Successive Elimination
            const toRemove: any[] = [];
            if (B) {
                for (let i = 1; i < sorted.length; i++) {
                    const arm = sorted[i];
                    if (arm.ciUpper < B.ciLower) {
                        toRemove.push(arm);
                    }
                }
            }

            if (toRemove.length > 0) {
                toRemove.forEach(r => {
                    const actionTile = (r.action as any).tile;
                    const actionStr = actionTile !== undefined ? tileToString(actionTile) : r.action.type;
                    console.log(`[ELIMINATED] ${actionStr} | mean: ${r.ev.toFixed(2)} | CI_upper: ${r.ciUpper.toFixed(2)} < best_CI_lower: ${B.ciLower.toFixed(2)} (n=${r.trialCount})`);
                });
                activeCandidates = activeCandidates.filter(c => !toRemove.includes(c));
            }

            // Phase 2: Top-K Concentration
            if (activeCandidates.length > TOP_K) {
                const currentSorted = [...activeCandidates].sort((a, b) => b.ev - a.ev);
                const candidatesToKeep = currentSorted.slice(0, TOP_K);
                const dropped = currentSorted.slice(TOP_K);
                dropped.forEach(d => {
                    const actionTile = (d.action as any).tile;
                    const actionStr = actionTile !== undefined ? tileToString(actionTile) : d.action.type;
                    console.log(`[TOP-K DROPPED] ${actionStr} (EV: ${d.ev.toFixed(2)}, n=${d.trialCount})`);
                });
                activeCandidates = candidatesToKeep;
            }
        }

        // Check Final Stop Condition (CI Separation)
        if (activeCandidates.length >= 2 && B && S) {
            const mean_B = B.ev;
            const mean_S = S.ev;
            const combinedSE = Math.sqrt(B.stdError ** 2 + S.stdError ** 2);
            const diff = mean_B - mean_S;
            if (round % 100 === 0) {
                const ratio = diff / (combinedSE || 1);
                console.log("=== SIGNIFICANCE DEBUG ===");
                console.log({
                    mean_B,
                    mean_S,
                    SE_B: B.stdError,
                    SE_S: S.stdError,
                    diff,
                    combinedSE,
                    ratio,
                    Z_VALUE,
                    stopCondition: ratio > Z_VALUE
                });
                console.log(`Round ${round}: Active Arms=${activeCandidates.length}, Total Trials=${totalTrialsSoFar}, Best=${B.ev.toFixed(2)}, Diff/Z=${ratio.toFixed(4)}`);
            }

            // If the difference between the best and second-best is statistically significant
            if (diff > Z_VALUE * combinedSE) {
                const bTile = (B.action as any).tile;
                const bStr = bTile !== undefined ? tileToString(bTile) : B.action.type;
                const sTile = (S.action as any).tile;
                const sStr = sTile !== undefined ? tileToString(sTile) : S.action.type;
                console.log("=== SUCCESSIVE ELIMINATION STOP TRIGGERED (CI SEPARATED) ===", {
                    totalTrials: totalTrialsSoFar,
                    best: bStr,
                    second: sStr,
                    diff: diff.toFixed(2),
                    zBound: (Z_VALUE * combinedSE).toFixed(2),
                    ratio: (diff / (combinedSE || 1)).toFixed(3)
                });
                break;
            }
        } else if (activeCandidates.length === 1) {
            const aTile = (activeCandidates[0].action as any).tile;
            const aStr = aTile !== undefined ? tileToString(aTile) : activeCandidates[0].action.type;
            console.log("=== STOPPED: ONLY ONE ARM LEFT ===", {
                tile: aStr,
                totalTrials: totalTrialsSoFar
            });
            break;
        }

        // Trial Addition Logic: Sample arm with max Standard Error to reduce uncertainty
        // If all stdErrors are 0 (e.g., all trials are 1), pick one randomly or the first.
        const armToSample = activeCandidates.reduce((prev, curr) => (curr.stdError > prev.stdError ? curr : prev), activeCandidates[0]);
        for (let j = 0; j < templateLen; j++) mountainBuffer[j] = templateMountain[j];
        shuffleInPlace(mountainBuffer, templateLen);
        runSingleTrialForAction(armToSample, mountainBuffer.slice());
        totalTrialsSoFar++;

        if (totalTrialsSoFar >= MAX_TOTAL_TRIALS) {
            console.log("=== MAX TRIALS REACHED ===", { totalTrials: totalTrialsSoFar });
            break;
        }
    }

    // Two-Step Lookahead (Applied to the best candidate(s) after elimination)
    if (LOOKAHEAD_ENABLED && initialShanten === 1 && activeCandidates.length > 0) {
        const totalInvisible = (templateCounts as any).slice(0, 27).reduce((acc: number, val: number) => acc + val, 0);
        if (totalInvisible > 0) {
            // Apply lookahead to the top 2 candidates if they are close
            const topCandidates = [...activeCandidates].sort((a, b) => b.ev - a.ev).slice(0, 2);
            if (topCandidates.length >= 2) {
                const EV1 = topCandidates[0].ev;
                const EV2 = topCandidates[1].ev;
                const scale = Math.max(Math.abs(EV1), Math.abs(EV2), 1000);
                // Only apply lookahead if the top two are relatively close in EV
                if (Math.abs(EV1 - EV2) / scale < 0.02 && EV1 > 0 && EV2 > 0) {
                    topCandidates.slice(0, 2).forEach(cand => {
                        const candTileStr = (cand.action as any).tile !== undefined ? tileToString((cand.action as any).tile) : cand.action.type;
                        const twoStepCondition = (LOOKAHEAD_ENABLED && initialShanten === 1);
                        if (candTileStr === "6s") {
                            console.log("DEBUG_6s_CONDITION_W", twoStepCondition);
                        }
                        if (twoStepCondition) {
                            if (candTileStr === "6s") {
                                console.log("DEBUG_6s_ENTERED");
                            }
                            evaluateLookaheadForAction(cand, config, templateCounts as any, totalInvisible, INITIAL_TRIALS, templateMountain, templateLen, workTrialCounts, workHand27, workUraCounts);
                        }
                    });
                }
            } else if (topCandidates.length === 1) {
                const cand = topCandidates[0];
                const candTileStr = (cand.action as any).tile !== undefined ? tileToString((cand.action as any).tile) : cand.action.type;
                const twoStepCondition = (LOOKAHEAD_ENABLED && initialShanten === 1);
                if (candTileStr === "6s") {
                    console.log("DEBUG_6s_CONDITION_W", twoStepCondition);
                }
                if (twoStepCondition) {
                    if (candTileStr === "6s") {
                        console.log("DEBUG_6s_ENTERED");
                    }
                    evaluateLookaheadForAction(cand, config, templateCounts as any, totalInvisible, INITIAL_TRIALS, templateMountain, templateLen, workTrialCounts, workHand27, workUraCounts);
                }
            }
        }
    }

    const endTime = performance.now();
    const summary = createSummary(config, results[0].initialRemainingTiles, endTime - startTime);

    console.log("ARM RAW", results);

    const finalResults = results.map((r: any) => {
        const handAfter = r.action.type === 'discard' ? removeOneTile(myHand, r.action.tile) : myHand;
        return {
            ...r,
            effectiveTiles: calculateEffectiveTiles(handAfter, fixedMentsu.length, visible, myKita, otherKita),
            evMean: r.ev,
            agariCount: r.wins,
            agariRate: r.trialCount > 0 ? (r.wins / r.trialCount) : 0
        };
    });

    // CRN Verification: Console Output
    const sorted = [...finalResults].sort((a, b) => b.ev - a.ev);
    console.log("=== FINAL EV RANKING ===");
    sorted.forEach((r, i) => {
        const actionTile = (r.action as any).tile;
        const actionStr = actionTile !== undefined ? tileToString(actionTile) : r.action.type;
        console.log("FINAL ARM STATE", actionStr, {
            n: r.trialCount,
            agariCount: r.agariCount
        });
        console.log(`Rank ${i + 1}: ${actionStr} → EV: ${r.ev.toFixed(2)} ± ${r.confidence95.toFixed(2)} (n=${r.trialCount}, agariCount: ${r.agariCount}, agariRate: ${(r.agariRate * 100).toFixed(2)}%)`);
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
    const actionTile = (res.action as any).tile;
    const tile = actionTile !== undefined ? tileToString(actionTile) : res.action.type;

    // We already log condition and entered at the call site for 6s.
    // Keeping a generic log for other problem tiles if needed.
    const isProblem = ["1m", "4p", "4s", "9m"].includes(tile);
    if (isProblem) {
        console.log(">>> TWO STEP ENTERED", tile);
    }

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

            // Now bh has 14 tiles. We MUST discard one before calling runSinglePath
            // to maintain the "starts with 13 tiles after discard" convention.
            const bhHand27 = new Int8Array(27);
            for (const t of bh) {
                const s = toSanmaTile(toNormalFive(t));
                if (s !== -1) bhHand27[s]++;
            }

            // check win
            if (getShantenMemoized(bhHand27 as any, fixedMentsu.length) === -1) {
                // stable seed for lookahead win path
                const mHashStr = simpleHash(branchMountain, templateLen);
                const mHash = parseInt(mHashStr, 16) || 0;
                const seedL = (mHash + i + b.t + 777) >>> 0;

                const path = runSinglePath(bh, fixedMentsu, { type: 'tsumo' } as Action, myKita, myKita + otherKita, doraIndicators, currentTurn + 1, isDealer, branchMountain.slice(), templateLen, invCounts29 as any, workTrialCounts, workHand27, workUraCounts, seedL);
                integratedEV += (path.point * b.prob) / trials;
            } else {
                // stable seed for lookahead discard path
                const mHashStr = simpleHash(branchMountain, templateLen);
                const mHash = parseInt(mHashStr, 16) || 0;
                const seedL = (mHash + i + b.t + 888) >>> 0;
                const rngL = new Engine.SimpleRNG(seedL);

                const bestDiscardIdx = findBestDiscard27(bhHand27, fixedMentsu.length, invCounts29, rngL);
                if (bestDiscardIdx !== -1) {
                    const bestDiscardTile = TILE_TYPES[bestDiscardIdx];
                    const dropIdx = bh.indexOf(bestDiscardTile);
                    if (dropIdx !== -1) bh.splice(dropIdx, 1);

                    const path = runSinglePath(bh, fixedMentsu, { type: 'discard', tile: bestDiscardTile } as Action, myKita, myKita + otherKita, doraIndicators, currentTurn + 1, isDealer, branchMountain.slice(), templateLen, invCounts29 as any, workTrialCounts, workHand27, workUraCounts, seedL);
                    integratedEV += (path.point * b.prob) / trials;
                }
            }

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
