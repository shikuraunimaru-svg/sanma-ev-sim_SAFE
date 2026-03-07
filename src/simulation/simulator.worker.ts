const DEBUG_LOG = false;

if (DEBUG_LOG) {
    console.log("WORKER_VERSION_PHASE58_ACTIVE");
    console.log("WORKER_BUILD_ID", Date.now());
    console.log("FAST_WIN_EVAL_ACTIVE"); // Phase71: scoreWinningHandFast が有効
}
import { toNormalFive, toSanmaTile, TILES, tileToString, isRedFive } from '../core/tile';
import type { Tile } from '../core/tile';
import { getShantenBreakdown, calculateShanten as calculateShantenCore } from '../core/shanten';

import * as Engine from './engine';
const { runSinglePath, evaluateWinningHand, getInitialCounts, TILE_TYPES, getWinningTiles, initShantenCache, clearShantenCache, getShantenMemoized, shuffleInPlace, resetDebugCounters, getShantenBreakdown27, simpleHash, createSummary, getPlayableWallCount } = Engine;
// fullEvalCount は Engine モジュール変数として直接参照 (Engine.fullEvalCount)

import type { SimulationConfig, Action, DiscardResult, SimulationSummary } from './engine';

const calculateShanten = (hand: Tile[] | Int8Array, fixedCount: number) => {
    if (hand instanceof Int8Array) return getShantenMemoized(hand, fixedCount);
    return calculateShantenCore(hand, fixedCount);
};

// 以前の Tile[] べースの関数 (互換性維持)
function removeOneTile(hand: Tile[], tile: Tile): Tile[] {
    const copy = [...hand];
    const index = copy.indexOf(tile);
    if (index !== -1) {
        copy.splice(index, 1);
    }
    return copy;
}

const LOOKAHEAD_ENABLED = false; // Flag to easily toggle lookahead on/off

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

/**
 * Phase70: Wall Template Builder
 * visible タイル除去済み・巻目消費調整済みの wall を一度だけ構築し末使用する。
 * @param config SimulationConfig
 * @param visible 可視タイル配列（手牌 + ドラ表示牌 + 镦子 + 李子など）
 * @param drawsConsumed 犹目消費枚数 (currentTurn-1)*3
 * @returns { templateMountain: Uint8Array, templateCounts: Int8Array }
 */
function buildWallTemplate(
    visible: Tile[],
    drawsConsumed: number
): { templateMountain: Uint8Array; templateCounts: Int8Array } {
    const templateCounts = getInitialCounts();
    let baseWall: number[] = [];
    for (let i = 0; i < templateCounts.length; i++) {
        for (let j = 0; j < templateCounts[i]; j++) {
            baseWall.push(i);
        }
    }

    if (baseWall.length !== 108) {
        throw new Error("SANMA_WALL_ERROR: wall must be 108 tiles");
    }

    // visible タイルを除去 (templateCounts も同期)
    for (const t of visible) {
        const idx = TILE_TYPES.indexOf(t);
        const pos = baseWall.indexOf(idx);
        if (pos === -1) {
            throw new Error(`SANMA_WALL_ERROR: visible tile ${t} not found in wall`);
        }
        baseWall.splice(pos, 1);
        if (templateCounts[idx] > 0) templateCounts[idx]--;
    }

    // 巡目消費：ランダムにシャッフルしてから pop（templateCounts も同期）
    for (let i = baseWall.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = baseWall[i];
        baseWall[i] = baseWall[j];
        baseWall[j] = temp;
    }
    for (let i = 0; i < drawsConsumed; i++) {
        if (baseWall.length > 0) {
            const tileIdx = baseWall.pop()!;
            if (templateCounts[tileIdx] > 0) {
                templateCounts[tileIdx]--;
            } else {
                console.warn("COUNT_UNDERFLOW_DETECTED", tileIdx);
            }
        }
    }

    return { templateMountain: new Uint8Array(baseWall), templateCounts };
}

export function runBatchSimulations(config: SimulationConfig) {
    const startTime = performance.now();
    initShantenCache();
    resetDebugCounters();

    // Successive Elimination Constants
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
    if (DEBUG_LOG) {
        console.log("GET_POSSIBLE_ACTIONS_RETURNED", possibleActions.length, "actions");

        console.log("CANDIDATES_SOURCE", possibleActions.map(a => ({
            type: a.type,
            tile: (a as any).tile ? tileToString((a as any).tile) : null,
            tileInd: (a as any).tileInd,
            riichi: (a as any).riichi
        })));

        console.log("=== CANDIDATES GENERATED ===");
        // NOTE: tileInd は手牌配列インデックス、tile は牌ID
        console.table(possibleActions.map(a => ({
            type: a.type,
            tileInd: (a as any).tileInd,          // 手牌インデックス
            tile_ID: (a as any).tile,              // 牌ID（旧ログでの "tileInd" は誤り）
            tileName: a.type === 'discard' ? tileToString((a as any).tile) : undefined,
            riichi: (a as any).riichi ?? false     // リーチ候補を可視化
        })));
    }

    const visible: Tile[] = [
        ...config.myHand,
        ...config.doraIndicators
    ];
    for (const m of config.fixedMentsu) visible.push(...m.tiles);
    for (const m of config.otherOpenMelds ?? []) visible.push(...m.tiles);

    const totalKitaCount = myKita + otherKita;
    for (let i = 0; i < totalKitaCount; i++) visible.push(Engine.TILES.z4);

    // ===== Phase70: Wall Template =====
    // visible タイル除去済み・巡目消費調整済みの wall テンプレートを一度だけ構築
    const drawsConsumed = Math.max(0, (currentTurn - 1) * 3);
    const { templateMountain, templateCounts } = buildWallTemplate(visible, drawsConsumed);

    if (DEBUG_LOG) {
        console.log("WALL_TEMPLATE_BUILT", templateMountain.length); // シミュレーション全体で1回だけ出力
    }

    const templateLen = templateMountain.length;
    const mountainSize = templateLen; // For logging backwards compatibility

    // liveWallLimit / selfEffectiveWallCount の計算
    const TOTAL_WALL = 108;
    const DEAD_WALL_TOTAL = 14;
    const playerHandCount = config.myHand.length + (config.fixedMentsu.length * 4);
    const doraIndicatorCount = config.doraIndicators.length;
    const totalNukiCount = config.myKita + config.otherKita;
    const wallAfterVisibleRemoval = TOTAL_WALL - playerHandCount - doraIndicatorCount - totalNukiCount;
    const remainingWall = wallAfterVisibleRemoval - drawsConsumed;
    const deadWallEffectiveCount = DEAD_WALL_TOTAL - doraIndicatorCount;
    const liveWallLimit = remainingWall - deadWallEffectiveCount;
    const availableToPlayer = liveWallLimit - 26;
    const selfEffectiveWallCount = availableToPlayer;

    if (DEBUG_LOG) {
        console.log("TURN_DEBUG", { currentTurn: config.currentTurn, drawsConsumed });
        console.log("SANMA_WALL_FINAL_CHECK", { remainingWall, deadWallEffectiveCount, liveWallLimit, availableToPlayer });

        const theoreticalLiveWall = Math.max(0, templateMountain.length - 13);
        console.log("PRE_ENGINE_WALL_STATE", {
            templateLength: templateMountain.length,
            theoreticalLiveWall
        });
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
        const tileName = (DEBUG_LOG && actionTile !== undefined) ? tileToString(actionTile) : (action.type === 'discard' ? "discard" : action.type);

        if (DEBUG_LOG && tileName === "6s") {
            console.log("DEBUG_6s_SHANTEN",
                normalShanten,
                chiitoiShanten,
                minShanten
            );
        }

        let logTile = tileName;
        if (tileName === "5z") logTile = "白";
        else if (tileName === "6z") logTile = "發";
        else if (tileName === "7z") logTile = "中";

        if (DEBUG_LOG && ["1m", "9m", "白", "發", "中"].includes(logTile)) {
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
            stdError: 0, confidence95: 0, m2: 0, ciLower: 0, ciUpper: 0,
            reachedDiff: false, totalAgariTurnSum: 0, agariCount: 0, averageAgariTurn: null
        } as any;
    });

    // Explicitly log Lookahead trigger condition for all arms
    results.forEach(res => {
        const actionTile = (res.action as any).tile;

        if (DEBUG_LOG) {
            const tileName = actionTile !== undefined ? tileToString(actionTile) : res.action.type;
            const bd = getShantenBreakdown27(workHand27 as any, fixedMentsu.length);
            const normalShanten = bd.normal;
            const chiitoiShanten = bd.chiitoi;
            const minShanten = Math.min(normalShanten, chiitoiShanten, bd.kokushi);
            const twoStepCondition = (LOOKAHEAD_ENABLED && initialShanten === 1);

            if (tileName === "6s") {
                console.log("DEBUG_6s_CONDITION",
                    normalShanten,
                    chiitoiShanten,
                    minShanten,
                    twoStepCondition
                );
            }
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

    const mountainBuffer = new Uint8Array(templateLen);
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
            currentTurn, isDealer, mountainArr, templateLen, liveWallLimit, selfEffectiveWallCount,
            templateCounts as any, workTrialCounts, workHand27, workUraCounts,
            seed, 0 // Start with tenpaiDepth 0
        );
        if (res.trialCount === 0) {
            res.initialRemainingTiles = result.initialRemainingTiles;
            if (result.engineLiveWallLimit !== liveWallLimit) {
                console.error("LIVE_WALL_SYNC_ERROR", {
                    worker: liveWallLimit,
                    engine: result.engineLiveWallLimit
                });
            }
        }

        updateStats(res, result.point);
        if (result.type === 'win') {
            res.wins++;
            res.totalWinPoints += result.point;
        }
        if (result.isTenpai) res.tenpaiCount++;

        res.winRate = res.wins / res.trialCount;
        res.avgScore = res.wins > 0 ? res.totalWinPoints / res.wins : 0;
        res.tenpaiRate = res.tenpaiCount / res.trialCount;
        res.agariRate = res.winRate;
        return result;
    };

    const simulateWithFixedMountain = (res: any, mountainArr: Uint8Array, seed: number) => {
        const afterHand = res.action.type === 'discard' ? removeOneTile(myHand, res.action.tile) : myHand;
        const result = runSinglePath(
            afterHand, fixedMentsu, res.action, myKita, otherKita, doraIndicators,
            currentTurn, isDealer, mountainArr, templateLen, liveWallLimit, selfEffectiveWallCount,
            templateCounts as any, workTrialCounts, workHand27, workUraCounts,
            seed, 0
        );
        return result;
    };

    const generateMountainWithSeed = (wall: Uint8Array, seed: number) => {
        for (let i = 0; i < wall.length; i++) wall[i] = templateMountain[i];
        let state = seed >>> 0;
        const nextRand = () => {
            let t = state += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        for (let i = wall.length - 1; i > 0; i--) {
            const j = Math.floor(nextRand() * (i + 1));
            const temp = wall[i];
            wall[i] = wall[j];
            wall[j] = temp;
        }
    };

    // Ultimate Successive Elimination with Common Random Numbers (CRN)
    const allCandidates = results.map(r => ({ ...r, m2: 0, ev: 0, trialCount: 0, lastTrialReward: 0 }));
    let activeCandidates = [...allCandidates];

    // Config based on hand state
    const isTenpai = (initialShanten === 0);
    const epsilon = 0.000001; // isTenpai ? 0.008 : 0.015;
    const globalHardLimit = isTenpai ? 60000 : 30000; // Total trials across the whole evaluation

    if (DEBUG_LOG) {
        console.log(`Ultimate CRN SE Config: state=${isTenpai ? 'Tenpai' : 'Ishanten'}, epsilon=${epsilon}, hardLimit=${globalHardLimit}`);
    }

    const getZ = (n: number) => 1.96 + 0.1 * Math.log2(n || 1);
    let stopReason = "unknown";
    let totalExecutions = 0;

    if (DEBUG_LOG) {
        console.log(`[Trial Start] mountainSize: ${mountainSize} (Total Nuki: ${totalKitaCount})`);
    }

    const masterWall = new Uint8Array(templateLen);

    if (DEBUG_LOG) {
        console.log("SANMA_FINAL_WALL_LENGTH", masterWall.length);
    }
    let diffStats = { mean: 0, sumSq: 0, n: 0, variance: 0 };

    // === Budget control ===
    const SR_BUDGET_RATIO = 0.35;   // SRは全体の35%まで
    const SR_BUDGET_CAP = Math.floor(globalHardLimit * SR_BUDGET_RATIO);
    let srUsedTrials = 0;

    // SR Boundaries (Theoretical Successive Rejects Formula)
    const initialK = activeCandidates.length;
    const initialT = SR_BUDGET_CAP;
    const H_K = Array.from({ length: initialK }, (_, i) => 1 / (i + 1)).reduce((a, b) => a + b, 0);

    let remainingBudget = globalHardLimit;
    let phaseTrialsLeft = Math.floor((Math.max(0, initialT - initialK) / H_K) * (1 / initialK));

    if (srUsedTrials + phaseTrialsLeft > SR_BUDGET_CAP) {
        phaseTrialsLeft = SR_BUDGET_CAP - srUsedTrials;
    }

    // ===== Phase 1: Successive Rejects =====
    while (activeCandidates.length > 2 && remainingBudget > 0) {
        // 1. Generate CRN Master Wall for this trial
        for (let j = 0; j < templateLen; j++) masterWall[j] = templateMountain[j];
        shuffleInPlace(masterWall, masterWall.length);

        // 2. Evaluate all active candidates on the exact same wall
        for (const candidate of activeCandidates) {
            // Provide a clean copy of the master wall to prevent mutation side-effects
            for (let j = 0; j < templateLen; j++) mountainBuffer[j] = masterWall[j];
            const pathResult = runSingleTrialForAction(candidate, mountainBuffer);
            candidate.lastTrialReward = pathResult.point;
            candidate.totalAgariTurnSum += pathResult.totalAgariTurnSum;
            candidate.agariCount += pathResult.agariCount;
            totalExecutions++;
        }

        phaseTrialsLeft--;
        remainingBudget--;
        srUsedTrials++;

        // 3. SR Phase Allocation Check
        if (phaseTrialsLeft <= 0) {
            if (DEBUG_LOG) {
                console.log(`SR Phase complete. Remaining budget: ${remainingBudget}. Candidates before drop: ${activeCandidates.length}`);
            }
            activeCandidates.sort((a, b) => b.ev - a.ev);
            const worst = activeCandidates.pop();

            if (DEBUG_LOG) {
                const actionType = worst?.action?.type;
                const tileStr = (actionType === 'discard' && worst?.action?.tile !== undefined) ? tileToString(worst.action.tile) : actionType;
                console.log(`Dropped worst candidate: ${tileStr} (ev: ${worst?.ev})`);
            }

            if (activeCandidates.length === 2) {
                if (DEBUG_LOG) console.log("SR reached 2 candidates → ENTER DIFF MODE");
                break;
            }

            const m = activeCandidates.length;
            let trialsToAllocate = Math.floor((Math.max(0, initialT - initialK) / H_K) * (1 / m));

            // --- SR budget cap enforcement ---
            if (srUsedTrials + trialsToAllocate > SR_BUDGET_CAP) {
                trialsToAllocate = SR_BUDGET_CAP - srUsedTrials;
            }

            if (trialsToAllocate <= 0) {
                if (DEBUG_LOG) console.log(`SR budget cap reached → ENTER DIFF MODE (srUsed=${srUsedTrials}/${SR_BUDGET_CAP})`);
                break;
            }

            phaseTrialsLeft = trialsToAllocate;
            if (DEBUG_LOG) console.log(`Next SR Phase trials allocated: ${phaseTrialsLeft}`);
        }
    }

    if (remainingBudget <= 0 && activeCandidates.length > 2) {
        stopReason = "HARD_LIMIT";
        if (DEBUG_LOG) console.log(`=== SR BUDGET DEPLETED ===`);
    }

    if (activeCandidates.length > 2) {
        if (DEBUG_LOG) console.log(`[Safety] Forcing down to 2 candidates to enter DIFF MODE.`);
        activeCandidates.sort((a, b) => b.ev - a.ev);
        activeCandidates.length = 2;
    }

    // ===== Relative DIFF thresholds =====
    const STRONG_RELATIVE = 0.05;  // 5%
    const MID_RELATIVE = 0.03;  // 3%

    const Z_STRONG = 2.33;  // 99% one-sided
    const Z_MID = 1.64;  // 90% one-sided

    const MIN_DIFF_TRIALS = 3500;

    // ===== Phase 2: DIFF MODE =====
    if (activeCandidates.length === 2 && remainingBudget > 0) {
        if (DEBUG_LOG) console.log("DIFF MODE START");
        activeCandidates.forEach(c => c.reachedDiff = true);
        diffStats = { n: 0, mean: 0, sumSq: 0, variance: 0 };
        const baseSeed = Math.floor(Math.random() * 0xFFFFFFFF);

        while (remainingBudget > 0) {
            const [candidateA, candidateB] = activeCandidates;
            const seed = (baseSeed + diffStats.n) >>> 0;

            // 1. Generate CRN Master Wall for this trial (only once per loop)
            generateMountainWithSeed(masterWall, seed);

            // 2. Evaluate A
            for (let j = 0; j < templateLen; j++) mountainBuffer[j] = masterWall[j];
            const resA = simulateWithFixedMountain(candidateA, mountainBuffer, seed);
            const rewardA = resA.point;
            candidateA.totalAgariTurnSum += resA.totalAgariTurnSum;
            candidateA.agariCount += resA.agariCount;

            // 3. Evaluate B (Same Master Wall, Same Seed)
            for (let j = 0; j < templateLen; j++) mountainBuffer[j] = masterWall[j];
            const resB = simulateWithFixedMountain(candidateB, mountainBuffer, seed);
            const rewardB = resB.point;
            candidateB.totalAgariTurnSum += resB.totalAgariTurnSum;
            candidateB.agariCount += resB.agariCount;

            const diff = rewardA - rewardB;
            diffStats.n++;
            const delta = diff - diffStats.mean;
            diffStats.mean += delta / diffStats.n;
            const delta2 = diff - diffStats.mean;
            diffStats.sumSq += delta * delta2;
            diffStats.variance = diffStats.n > 1 ? diffStats.sumSq / (diffStats.n - 1) : 0;

            if (diffStats.n > 1) {
                const baseEV = Math.max(candidateA.ev, candidateB.ev);

                if (baseEV <= 0) {
                    // Safety guard for pathological states
                    remainingBudget--;
                    continue;
                }

                const meanDiff = diffStats.mean;
                const variance = diffStats.variance;
                const stdError = Math.sqrt(variance / diffStats.n);

                // Strong confidence (99%)
                const lcbStrong = meanDiff - Z_STRONG * stdError;
                const relativeLCBStrong = lcbStrong / baseEV;

                // Medium confidence (90%)
                const lcbMid = meanDiff - Z_MID * stdError;
                const relativeLCBMid = lcbMid / baseEV;

                // Relative mean
                const relativeMean = meanDiff / baseEV;

                if (DEBUG_LOG && diffStats.n % 200 === 0) {
                    console.log(`DIFF_STATS n: ${diffStats.n} mean: ${meanDiff.toFixed(2)} relMidLCB: ${(relativeLCBMid * 100).toFixed(2)}%`);
                }

                // === STRONG ZONE (≥5%) ===
                if (relativeLCBStrong > STRONG_RELATIVE) {
                    stopReason = "STRONG_WIN";
                    if (DEBUG_LOG) console.log("=== DIFF END: STRONG_WIN (≥5%) ===");
                    break;
                }

                // === MID ZONE (3–5%) ===
                if (relativeLCBMid > MID_RELATIVE) {
                    stopReason = "MID_WIN";
                    if (DEBUG_LOG) console.log("=== DIFF END: MID_WIN (≥3%) ===");
                    break;
                }

                // === SMALL DIFF STOP (<3%) ===
                if (diffStats.n >= MIN_DIFF_TRIALS && Math.abs(relativeMean) < MID_RELATIVE) {
                    stopReason = "SMALL_DIFF_STOP";
                    if (DEBUG_LOG) console.log("=== DIFF END: SMALL_DIFF_STOP (<3%) ===");
                    break;
                }
            }

            remainingBudget--;
        }

        if (remainingBudget <= 0 && stopReason !== "STRONG_WIN" && stopReason !== "MID_WIN" && stopReason !== "SMALL_DIFF_STOP") {
            stopReason = "HARD_LIMIT";
            if (DEBUG_LOG) console.log(`=== DIFF BUDGET DEPLETED ===`);
        }
    }

    // =========================================================
    // Phase72: Phase2 — Non-CRN Final Comparison
    // Phase1 で残った候補の中から top3 を選び、
    // 独立乱数（山共有なし）で 5000 試行ずつ再評価する。
    // =========================================================
    const FINAL_TRIALS = 5000;

    // Phase1 終了時の全候補から EV 上位 3 を選択
    // ★ sort-slice ではなくインデックスで取得 → Phase2 stats が allCandidates に直接書き込まれる
    const topIndices = allCandidates
        .map((c, i) => ({ i, ev: c.ev }))
        .sort((a, b) => b.ev - a.ev)
        .slice(0, 3)
        .map(x => x.i);
    const finalCandidates = topIndices.map(i => allCandidates[i]);

    if (DEBUG_LOG) {
        console.log("CRN_PHASE1_END", {
            RemainingCandidates: finalCandidates.length,
            topIndices,
            topEVs: finalCandidates.map(c => c.ev.toFixed(1))
        });
        console.log("CRN_PHASE2_START", { Candidates: finalCandidates.length, TrialsPerCandidate: FINAL_TRIALS });
    }

    // Phase2 用の専用ワークバッファ（masterWall は Phase1 で使用済みのため別途用意）
    const phase2Wall = new Uint8Array(templateLen);
    const phase2Buffer = new Uint8Array(templateLen);

    // ★ Phase2 カウンタをリセット（Phase1 の蓄積をゼロから出直す）
    resetDebugCounters(); // fullEvalCount も内部でリセット
    totalExecutions = 0;

    // ★ BEFORE RESET 診断ログ（Phase1 の蓄積量を確認）
    if (DEBUG_LOG) {
        console.log("PHASE2_STATS_BEFORE_RESET", finalCandidates.map(c => ({
            tile: (c.action as any).tile !== undefined
                ? tileToString((c.action as any).tile) + ((c.action as any).riichi ? "(riichi)" : "")
                : c.action.type,
            trialCount: c.trialCount,
            wins: c.wins,
            scoreSum: c.totalWinPoints,  // totalWinPoints が scoreSum に相当
            evMean: c.evMean
        })));
    }

    for (const candidate of finalCandidates) {
        // ★ stats オブジェクトを丸ごと再生成（部分リセット禁止）
        candidate.ev = 0;
        candidate.m2 = 0;
        candidate.trialCount = 0;
        candidate.wins = 0;
        candidate.totalWinPoints = 0;
        candidate.tenpaiCount = 0;
        candidate.totalAgariTurnSum = 0;
        candidate.agariCount = 0;
        candidate.stdError = Infinity;
        candidate.evMean = 0;
        candidate.winRate = 0;
        candidate.avgScore = 0;
        candidate.tenpaiRate = 0;
        candidate.lcb = 0;
        candidate.initialRemainingTiles = 0;

        // ★ AFTER RESET 診断ログ（全フィールドが 0 になっているか確認）
        if (DEBUG_LOG) {
            const _tileStr = (candidate.action as any).tile !== undefined
                ? tileToString((candidate.action as any).tile) + ((candidate.action as any).riichi ? "(riichi)" : "")
                : candidate.action.type;
            console.log("PHASE2_STATS_AFTER_RESET", {
                tile: _tileStr,
                trialCount: candidate.trialCount,
                wins: candidate.wins,
                scoreSum: candidate.totalWinPoints,
                evMean: candidate.evMean
            });
        }

        for (let t = 0; t < FINAL_TRIALS; t++) {
            // 候補ごとに**独立した**乱数シードで山を生成（CRN 無効・山共有なし）
            const indepSeed = (Math.random() * 0xFFFFFFFF) >>> 0;
            generateMountainWithSeed(phase2Wall, indepSeed);

            // コピーして mutate 防止
            for (let j = 0; j < templateLen; j++) phase2Buffer[j] = phase2Wall[j];

            const pathResult = runSingleTrialForAction(candidate, phase2Buffer);
            candidate.totalAgariTurnSum += pathResult.totalAgariTurnSum;
            candidate.agariCount += pathResult.agariCount;
            totalExecutions++;
        }

        // Phase2 最終統計を明示的に同期（runSingleTrialForAction が updateStats を呼ぶが念押し）
        candidate.evMean = candidate.ev;
        candidate.winRate = candidate.trialCount > 0 ? candidate.wins / candidate.trialCount : 0;
        candidate.avgScore = candidate.wins > 0 ? candidate.totalWinPoints / candidate.wins : 0;
        candidate.tenpaiRate = candidate.trialCount > 0 ? candidate.tenpaiCount / candidate.trialCount : 0;
        if (candidate.trialCount > 1) {
            const variance = Math.max(1e-9, candidate.m2 / (candidate.trialCount - 1));
            candidate.stdError = Math.sqrt(variance / candidate.trialCount);
        }

        // averageAgariTurn を再計算
        if (candidate.agariCount > 0) {
            candidate.averageAgariTurn = candidate.totalAgariTurnSum / candidate.agariCount;
            candidate.averageAgariAfterTurns = Math.max(0, candidate.averageAgariTurn - currentTurn);
        } else {
            candidate.averageAgariTurn = null;
            candidate.averageAgariAfterTurns = null;
        }

        if (DEBUG_LOG) {
            const tileStr = (candidate.action as any).tile !== undefined
                ? tileToString((candidate.action as any).tile) : candidate.action.type;
            const rStr = (candidate.action as any).riichi ? "(riichi)" : "";
            console.log(`P2_EVAL ${tileStr}${rStr} ev=${candidate.ev.toFixed(1)} n=${candidate.trialCount} wr=${(candidate.winRate * 100).toFixed(1)}%`);

            // ★ P2_SANITY_CHECK ログ
            console.log("P2_SANITY_CHECK", {
                tile: `${tileStr}${rStr}`,
                trialCount: candidate.trialCount,
                wins: candidate.wins,
                avgScore: candidate.avgScore.toFixed(1),
                evMean: candidate.evMean.toFixed(1),
                stdError: candidate.stdError.toFixed(2),
                fullEvalCount: Engine.fullEvalCount
            });
        }
    }

    if (DEBUG_LOG) console.log("CRN_PHASE2_END");

    // Phase2 候補を allCandidates へ反映（非final候補の ev は Phase1 のまま）
    // → Phase2 候補が上位になるよう ev が再設定されているので sort で自然に最上位へ


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

    if (DEBUG_LOG) {
        console.log(`=== UNIFIED SE END: ${stopReason} ===`);
        console.log(`State: ${isTenpai ? 'Tenpai' : 'Ishanten'}`);
        console.log(`Best: ${winner.ev.toFixed(1)} (LCB: ${(winner.lcb ?? 0).toFixed(1)}, n=${winner.trialCount})`);
        if (runnerUp) console.log(`Second: ${runnerUp.ev.toFixed(1)} (LCB: ${(runnerUp.lcb ?? 0).toFixed(1)}, n=${runnerUp.trialCount})`);
    }

    const endTime = performance.now();
    const summary = createSummary(config, winner.initialRemainingTiles, endTime - startTime);

    // ===============================
    // Finalize average agari turn
    // ===============================
    for (const c of allCandidates) {
        if (c.agariCount > 0) {
            c.averageAgariTurn = c.totalAgariTurnSum / c.agariCount;
            c.averageAgariAfterTurns = Math.max(0, c.averageAgariTurn - config.currentTurn);
        } else {
            c.averageAgariTurn = null;
            c.averageAgariAfterTurns = null;
        }
    }

    if (DEBUG_LOG) {
        console.log("FINAL_AVG_DEBUG",
            allCandidates.map(c => ({
                tile: (c.action as any).tile ? tileToString((c.action as any).tile) : c.action.type,
                agariCount: c.agariCount,
                avgTurn: c.averageAgariTurn,
                wins: c.wins,
                trialCount: c.trialCount,
                avgScore: c.avgScore.toFixed(1),   // ← P2_EVAL との比較用
                evMean: c.evMean.toFixed(1)
            }))
        );
    }

    const processedResults = allCandidates.map((r: any) => {
        const handAfter = r.action.type === 'discard' ? removeOneTile(myHand, r.action.tile) : myHand;
        return {
            ...r,
            effectiveTiles: calculateEffectiveTiles(handAfter, fixedMentsu.length, visible, myKita, otherKita),
            evMean: r.ev,
            confidence95: r.confidence95,
            agariCount: r.wins,
            agariRate: r.trialCount > 0 ? (r.wins / r.trialCount) : 0,
            // ★ avgScore を明示的に再計算（スプレッドに依存せず Phase2 stats を保証）
            avgScore: r.wins > 0 ? r.totalWinPoints / r.wins : 0,
            averageAgariAfterTurns: r.averageAgariAfterTurns
        };
    });

    if (DEBUG_LOG) {
        console.log("WORKER_RESULT_SAMPLE", processedResults[0]);
        // Phase71: totalExecutions に対する scoreWinningHandFast 呼び出し回数
        console.log("FULL_EVAL_COUNT", Engine.fullEvalCount, "/", totalExecutions, "trials →", ((Engine.fullEvalCount / Math.max(1, totalExecutions)) * 100).toFixed(2) + "%");
    }
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

/**
 * Normalizes a hand to 14 tiles for shanten calculation.
 * If 13 tiles, adds a dummy tile (that doesn't improve shanten) to make it 14.
 */
function normalizeTo14Tiles(hand: Tile[]): Tile[] {
    if (hand.length % 3 === 2) return hand; // Already 14, 11, 8, or 5 tiles (after draw/calling)
    // If 13, 10, 7, 4 tiles (before draw), we need to check if we CAN be tenpai.
    // In Riichi context, we check if adding ANY tile makes it agari or tenpai.
    // However, the standard way to check "Can I Riichi?" is to check if shanten is 0 with 13 tiles,
    // but the system's `calculateShanten` might vary. 
    // The user specifically requested normalizeTo14Tiles logic.
    return [...hand, TILES.m1 as Tile]; // Add dummy
}

export function getPossibleActions(config: SimulationConfig): Action[] {
    if (DEBUG_LOG) {
        console.log("GET_POSSIBLE_ACTIONS_CALLED");
        console.log("ACTION_GEN_ENTRY", {
            hand: config.myHand.map(tileToString),
            handLength: config.myHand.length
        });
    }
    const actions: Action[] = [];
    const hand = config.myHand;

    // In Sanma EV Simulator, melds might have type: 'pon' | 'chi' | 'kan_open' | 'kan_closed' (ankan).
    // Ankan is Menzen.
    const isMenzen = config.fixedMentsu.every(m => {
        const type = (m as any).type;
        if (type === 'pon' || type === 'chi' || type === 'kan_open') return false;
        if (type === 'kan_closed') return true;
        return !m.isOpen;
    });

    // Shanten normalization: calculate shanten on a 14-tile equivalent hand.
    const normalizedHand = normalizeTo14Tiles(hand);
    const shanten = calculateShanten(normalizedHand, config.fixedMentsu.length);

    if (DEBUG_LOG) {
        console.log("RIICHI_CHECK", {
            shanten,
            isMenzen,
            handLength: hand.length,
            fixedMentsuCount: config.fixedMentsu.length
        });
    }

    if (hand.length % 3 === 2 && shanten === -1) actions.push({ type: 'tsumo' });

    // ① 牌種単位で代表インデックスをMap化 (Phase 58 完全版)
    // キーは toNormalFive(tile) の数値 → r5p と 5p を同一牌種として扱う
    // 代表牌は「通常五優先」: 既存が赤五かつ新しいのが通常五なら上書き
    const discardMap = new Map<number, number>();
    for (let i = 0; i < hand.length; i++) {
        const tile = hand[i];
        const key = toNormalFive(tile);

        if (!discardMap.has(key)) {
            discardMap.set(key, i);
            continue;
        }

        // 既存が赤五 かつ 今の牌が通常五なら、通常五を優先して上書き
        const existingIndex = discardMap.get(key)!;
        const existingTile = hand[existingIndex];
        if (isRedFive(existingTile) && !isRedFive(tile)) {
            discardMap.set(key, i);
        }
    }

    if (DEBUG_LOG) {
        console.log("DISCARD_MAP_SIZE", discardMap.size);
        console.log("MAP_UNIQUE_SIZE", discardMap.size);
        console.log("DISCARD_MAP_KEYS", [...discardMap.values()].map(idx => tileToString(hand[idx])));
    }

    // ② Mapからのみdiscard生成
    for (const [_normalKey, tileInd] of discardMap.entries()) {
        const tile = hand[tileInd];

        if (DEBUG_LOG) {
            console.log("DISCARD_MAP_DEBUG", {
                tileInd,
                tileType: toNormalFive(tile),
                tileName: tileToString(tile)
            });
        }

        const generateDiscard = (riichi: boolean) => {
            if (DEBUG_LOG) {
                console.log("DISCARD_GENERATED", {
                    tileInd,
                    tileName: tileToString(tile),
                    riichi,
                    source: "discardMap"  // discardMap 経由であることを明示
                });
            }
            actions.push({
                type: 'discard',
                tile,
                tileInd,
                riichi
            });
        };

        // DAMA
        generateDiscard(false);

        // RIICHI (if possible)
        const nextHand = [...normalizedHand];
        const removeIdx = nextHand.findIndex(t => t === tile);
        if (removeIdx !== -1) {
            nextHand.splice(removeIdx, 1);
        }
        const nextShanten = calculateShanten(nextHand, config.fixedMentsu.length);
        const canRiichi = nextShanten === 0 && isMenzen && !config.validationMode;

        if (canRiichi) {
            generateDiscard(true);
        }
    }

    if (DEBUG_LOG) {
        console.log("ACTIONS_AFTER_GENERATION", actions.map(a => ({
            type: a.type,
            tile: (a as any).tile ? tileToString((a as any).tile) : null,
            tileInd: (a as any).tileInd,
            riichi: (a as any).riichi
        })));
        console.log("ACTIONS_AFTER_UNIQUE", actions.length);
    }

    // ③ 強制デバッグ：重複チェック (Phase 58 Safety Check)
    // キーは toNormalFive ベース × riichi で一意性を判断
    const keySet = new Set<string>();
    for (const a of actions) {
        if (a.type !== 'discard') continue;
        const key = `${toNormalFive(hand[a.tileInd])}-${a.riichi}`;
        if (keySet.has(key)) {
            throw new Error("DUPLICATE_ACTION_DETECTED: " + key);
        }
        keySet.add(key);
    }


    if (DEBUG_LOG) console.log("TOTAL_ACTION_COUNT", actions.length);
    if (hand.includes(TILES.z4 as any)) actions.push({ type: 'kita' });
    if (DEBUG_LOG) console.log("ACTION_GEN_EXIT_COUNT", actions.length);
    return actions;
}
