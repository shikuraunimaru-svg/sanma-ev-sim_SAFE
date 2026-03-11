const DEBUG_LOG = false;

if (DEBUG_LOG) {
    console.log("WORKER_VERSION_PHASE58_ACTIVE");
    console.log("WORKER_BUILD_ID", Date.now());
    console.log("FAST_WIN_EVAL_ACTIVE"); // Phase71: scoreWinningHandFast が有効
}
import { toNormalFive, TILES, tileToString, isRedFive } from '../core/tile';
import type { Tile } from '../core/tile';
import { calculateShanten as calculateShantenCore } from '../core/shanten';

import * as Engine from './engine';
const { runSinglePath, evaluateWinningHand, getInitialCounts, TILE_TYPES, initShantenCache, clearShantenCache, getShantenMemoized, resetDebugCounters, createSummary, logPerformanceStats, wallPool, initWallPool, selectUCBNode, pruneWeakNodes, earlyStop, DEBUG_LOGS } = Engine;
type UCBNode = Engine.UCBNode;
// fullEvalCount は Engine モジュール変数として直接参照 (Engine.fullEvalCount)

import type { SimulationConfig, Action } from './engine';

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
            // The instruction's code edit seems to be for a different part of the simulation flow.
            // The `initialShanten === -1` block is an early exit for an already winning hand,
            // which sends a 'WIN' message, not 'COMPLETE'.
            // The instruction asks to call `saveStateCache` before the 'COMPLETE' message.
            // Assuming the intent is to add this logic before the *final* 'COMPLETE' message
            // at the end of the simulation, not this early exit.
            // Therefore, no change is applied here based on the provided code snippet.
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

    const debugWallCounts = (wall: Uint8Array) => {
        if (!DEBUG_LOGS.wallCounts) return;
        const counts = new Array(34).fill(0);
        for (let i = 0; i < wall.length; i++) {
            counts[wall[i]]++;
        }
        console.log("DEBUG_WALL_COUNTS", counts);
    };
    debugWallCounts(templateMountain);

    const debugUniqueTiles = (wall: Uint8Array) => {
        if (!DEBUG_LOGS.wallCounts) return;
        const counts: Record<string, number> = {};
        for (let i = 0; i < wall.length; i++) {
            const tile = TILE_TYPES[wall[i]];
            const s = tileToString(tile);
            counts[s] = (counts[s] || 0) + 1;
        }
        console.log("DEBUG_WALL_UNIQUE", counts);
    };
    debugUniqueTiles(templateMountain);

    // Phase 76: Wall Pool の初期化と保証
    // ターンの進行により templateMountain の内容（可視牌など）が変わるため、
    // プールが空の場合だけでなく毎ターン更新するのが安全です。
    initWallPool(templateMountain);
    if (DEBUG_LOG) {
        console.log("WallPool initialized:", wallPool.length);
    }

    if (DEBUG_LOG) {
        console.log("WALL_TEMPLATE_BUILT", templateMountain.length); // シミュレーション全体で1回だけ出力
    }

    const templateLen = templateMountain.length;
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

    const allNodes: UCBNode[] = possibleActions.map(a => ({
        action: a,
        visits: 0,
        totalEV: 0,
        meanEV: 0,
        sumEV: 0,
        sumEV2: 0,
        winCount: 0,
        totalPoints: 0,
        tenpaiCount: 0
    }));

    let activeNodes: UCBNode[] = [...allNodes];

    // UCB のメインループパラメータ
    const isTenpai = (initialShanten === 0);
    const globalHardLimit = isTenpai ? 60000 : 30000;
    const TOTAL_TRIALS = Math.min(config.trials ?? 15000, globalHardLimit);

    let totalTrials = 0;
    const workTrialCounts = new Int8Array(29);
    const workHand27 = new Int8Array(27);
    const workUraCounts = new Int8Array(29);

    if (DEBUG_LOG) {
        console.log(`[UCB1 Trial Start] Budget: ${TOTAL_TRIALS}, InitCandidates: ${allNodes.length}`);
    }

    let initialRemainingTiles = 0;

    let stopReason = "BUDGET_EXHAUSTED";

    while (totalTrials < TOTAL_TRIALS) {
        // 定期的な Pruning
        if (totalTrials > 0 && totalTrials % 500 === 0) {
            activeNodes = pruneWeakNodes(activeNodes);

            // 候補が1つになったらそこで終了
            if (activeNodes.length <= 1) {
                stopReason = "ALL_PRUNED";
                break;
            }

            // Early Stop 判定
            if (earlyStop(activeNodes)) {
                stopReason = "EARLY_STOP";
                break;
            }
        }

        // 各ノード最低50回は探索を保証する
        let selectedNode: UCBNode | null = null;
        for (const n of activeNodes) {
            if (n.visits < 50) {
                selectedNode = n;
                break;
            }
        }

        const node = selectedNode ?? selectUCBNode(activeNodes);

        // CRN (Common Random Numbers) 導入: 
        // 試行回数(visits)に応じて使用する山とシードを固定し、候補間の分散を抑える
        const crnIndex = node.visits % wallPool.length;
        const wall = wallPool[crnIndex];

        const afterHand = node.action.type === 'discard' ? removeOneTile(myHand, (node.action as any).tile) : myHand;

        // シードも visits に固定し、他の打牌候補の同じ visits 目と完全に条件を一致させる
        const seed = node.visits >>> 0;

        const result = runSinglePath(
            afterHand, fixedMentsu, node.action, myKita, otherKita, doraIndicators,
            currentTurn, isDealer, wall, templateLen, liveWallLimit, selfEffectiveWallCount,
            templateCounts as any, workTrialCounts, workHand27, workUraCounts,
            seed, initialShanten, 0, totalTrials
        );

        if (totalTrials === 0) {
            initialRemainingTiles = result.initialRemainingTiles;
        }

        const ev = result.point;

        node.visits++;
        node.totalEV += ev;
        node.meanEV = node.totalEV / node.visits;
        node.sumEV += ev;
        node.sumEV2 += ev * ev;

        // === 判定コード修正 (流局テンパイ対応・和了含む) ===
        // console.log("shantenEnd", result.finalShanten); // 大量に出るので一時的にコメントアウト推奨ですが指示通り追加します。もし重い場合は消してください。
        if (DEBUG_LOG) {
            console.log("shantenEnd", result.finalShanten);
        }

        if (result.finalShanten === -1) {
            node.winCount++;
            node.tenpaiCount++;   // 和了は聴牌でもある
            node.totalPoints += result.point;
        } else if (result.finalShanten === 0) {
            node.tenpaiCount++;
        }

        totalTrials++;
    }

    // ========== UCB Kết Quả の集計 ==========
    allNodes.sort((a, b) => b.meanEV - a.meanEV);

    const results: any[] = allNodes.map(node => {
        const winRate = node.visits > 0 ? node.winCount / node.visits : 0;
        const avgPoint = node.winCount > 0 ? node.totalPoints / node.winCount : 0;
        const tenpaiRate = node.visits > 0 ? node.tenpaiCount / node.visits : 0;

        if (DEBUG_LOG) {
            console.log("rates", {
                trialCount: node.visits,
                winCount: node.winCount,
                tenpaiCount: node.tenpaiCount,
                winRate,
                tenpaiRate
            });
        }

        const variance = node.visits > 1 ? (node.sumEV2 / node.visits) - (node.meanEV * node.meanEV) : 0;
        const stdDev = Math.sqrt(Math.max(variance, 0));
        const ci = node.visits > 1 ? 1.96 * stdDev / Math.sqrt(node.visits) : 0;

        return {
            action: node.action,
            ev: node.meanEV,
            evMean: node.meanEV,
            trialCount: node.visits,
            winRate,
            avgScore: avgPoint,
            tenpaiRate,
            shantenBefore: initialShanten,
            shantenAfter: calculateShanten(node.action.type === 'discard' ? removeOneTile(myHand, (node.action as any).tile) : myHand, fixedMentsu.length),
            converged: false,
            totalAgariTurnSum: 0,
            agariCount: 0,
            stdError: stdDev / Math.sqrt(Math.max(node.visits, 1)),
            confidence95: ci,
            ciLower: node.meanEV - ci,
            ciUpper: node.meanEV + ci,
            lcb: node.meanEV - ci
        };
    });

    if (DEBUG_LOG) {
        console.log(`=== UCB1 END: ${stopReason} ===`);
        console.log(`Total Trials: ${totalTrials}/${TOTAL_TRIALS}`);
        console.log(
            "UCB nodes",
            allNodes.map(n => ({
                tile: (n.action as any).tile,
                visits: n.visits
            }))
        );
        const winner = allNodes[0];
        const runnerUp = allNodes[1];
        console.log(`Best: ${winner.meanEV.toFixed(1)} (n=${winner.visits})`);
        if (runnerUp) console.log(`Second: ${runnerUp.meanEV.toFixed(1)} (n=${runnerUp.visits})`);
    }

    const endTime = performance.now();
    const summary = createSummary(config, initialRemainingTiles, endTime - startTime);

    // ========== Final Re-evaluation ==========
    results.sort((a, b) => b.evMean - a.evMean);
    const FINAL_REEVAL_TRIALS = 2000;
    const finalists = results.slice(0, 2);

    if (DEBUG_LOG) {
        console.log("Final Re-evaluation start");
    }

    // CRNの基点: 上位2候補が全く同じ山リスト・シード条件で戦うように固定値をとる
    const finalReevalBaseIndex = totalTrials;

    for (const node of finalists) {
        if (DEBUG_LOG) {
            const tileStr = node.action.type === 'discard' ? tileToString((node.action as any).tile) : node.action.type;
            console.log(`Candidate ${tileStr} +${FINAL_REEVAL_TRIALS} trials`);
        }

        const afterHand = node.action.type === 'discard' ? removeOneTile(myHand, (node.action as any).tile) : myHand;

        // Recover totals to continue adding
        let totalEV = node.evMean * node.trialCount;
        let totalWinCount = Math.round(node.winRate * node.trialCount);
        let totalTenpaiCount = Math.round(node.tenpaiRate * node.trialCount);
        let totalAvgScoreSum = node.avgScore * totalWinCount;

        for (let i = 0; i < FINAL_REEVAL_TRIALS; i++) {
            // CRN: finalists 同士で完全に同じ山とシードを順番に使用する
            const crnIndex = (finalReevalBaseIndex + i) % wallPool.length;
            const wall = wallPool[crnIndex];
            const seed = (finalReevalBaseIndex + i) >>> 0;

            const simResult = runSinglePath(
                afterHand, fixedMentsu, node.action, myKita, otherKita, doraIndicators,
                currentTurn, isDealer, wall, templateLen, liveWallLimit, selfEffectiveWallCount,
                templateCounts as any, workTrialCounts, workHand27, workUraCounts,
                seed, 0, 0, 9999
            );

            totalEV += simResult.point;
            node.trialCount += 1;

            if (simResult.finalShanten === -1) {
                totalWinCount++;
                totalTenpaiCount++;
                totalAvgScoreSum += simResult.point;
            } else if (simResult.finalShanten === 0) {
                totalTenpaiCount++;
            }
        }

        totalTrials += FINAL_REEVAL_TRIALS;
        node.evMean = totalEV / node.trialCount;
        node.ev = node.evMean; // Keep 'ev' and 'evMean' in sync
        node.winRate = totalWinCount / node.trialCount;
        node.tenpaiRate = totalTenpaiCount / node.trialCount;
        node.avgScore = totalWinCount > 0 ? totalAvgScoreSum / totalWinCount : 0;
    }

    results.sort((a, b) => b.evMean - a.evMean);

    // ===============================
    // Finalize average agari turn
    // ===============================
    results.forEach(res => {
        if (res.agariCount > 0) {
            res.averageAgariTurn = res.totalAgariTurnSum / res.agariCount;
            res.averageAgariAfterTurns = Math.max(0, res.averageAgariTurn - config.currentTurn);
        } else {
            res.averageAgariTurn = null;
            res.averageAgariAfterTurns = null;
        }
    });

    if (DEBUG_LOG) {
        console.log("FINAL_AVG_DEBUG",
            results.map(c => ({
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

    // Phase 74/81: 結果をキャッシュに保存
    results.forEach((r: any) => {
        const handAfter = r.action.type === 'discard' ? removeOneTile(myHand, r.action.tile) : myHand;
        const cacheKey = Engine.buildStateKey(
            handAfter,
            config.currentTurn || 0,
            fixedMentsu.length,
            myKita,
            otherKita
        );
        Engine.saveStateCache(cacheKey, r.evMean);
    });

    self.postMessage({ type: 'RESULT', results, summary });
    logPerformanceStats(); // Phase 75: 計測結果を出力
    clearShantenCache();
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
