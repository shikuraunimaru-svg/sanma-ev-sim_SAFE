import { toNormalFive, TILES, tileToString, isRedFive } from '../core/tile';
import type { Tile } from '../core/tile';
import { toSanmaTile } from '../core/sanmaTiles';
import * as Engine from './engine';
const { runSinglePath, evaluateWinningHand, getInitialCounts, TILE_TYPES, initShantenCache, clearShantenCache, getShantenMemoized, resetDebugCounters, createSummary, logPerformanceStats, wallPool, reverseWallPool, initWallPool, DEBUG, getUkeireInfo27 } = Engine;
type Candidate = Engine.Candidate;
// fullEvalCount は Engine モジュール変数として直接参照 (Engine.fullEvalCount)

import type { SimulationConfig, Action } from './engine';

const calculateShanten = (hand: Tile[] | Int8Array, fixedCount: number) => {
    if (hand instanceof Int8Array) {
        return getShantenMemoized(hand, fixedCount);
    }
    const hand27 = new Int8Array(27);
    for (const t of hand) {
        const s = toSanmaTile(t);
        if (s !== -1) hand27[s]++;
    }
    return getShantenMemoized(hand27, fixedCount);
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
    if (DEBUG.actionGen) {
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
        if (!DEBUG.wall) return;
        const counts = new Array(34).fill(0);
        for (let i = 0; i < wall.length; i++) {
            counts[wall[i]]++;
        }
        console.log("DEBUG_WALL_COUNTS", counts);
    };
    debugWallCounts(templateMountain);

    const debugUniqueTiles = (wall: Uint8Array) => {
        if (!DEBUG.wall) return;
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
    if (DEBUG.wall) {
        console.log("WallPool initialized:", wallPool.length);
    }

    if (DEBUG.wall) {
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

    if (DEBUG.wall) {
        console.log("TURN_DEBUG", { currentTurn: config.currentTurn, drawsConsumed });
        console.log("SANMA_WALL_FINAL_CHECK", { remainingWall, deadWallEffectiveCount, liveWallLimit, availableToPlayer });

        const theoreticalLiveWall = Math.max(0, templateMountain.length - 13);
        console.log("PRE_ENGINE_WALL_STATE", {
            templateLength: templateMountain.length,
            theoreticalLiveWall
        });
    }

    const allNodes: Candidate[] = possibleActions.map(a => ({
        action: a,
        trials: 0,
        sumEV: 0,
        meanEV: 0,
        variance: 0,
        eliminated: false,
        winCount: 0,
        totalPoints: 0,
        tenpaiCount: 0
    }));

    let initialRemainingTiles = 0;
    let totalSimulationSteps = 0; // Total runSinglePath calls 
    const workTrialCounts = new Int8Array(29);
    const workHand27 = new Int8Array(27);
    const workUraCounts = new Int8Array(29);

    // ==========================================
    // Phase 1: UCB Search
    // ==========================================
    // allNodes の参照をそのまま使用し、フェーズをまたいで統計情報を共有する
    const ucbNodes: any[] = allNodes;

    // 追加フィールドの初期化
    for (const node of ucbNodes) {
        node.visits = 1; // ユーザー指定: 1初期化
        node.sumEV = 0;
        node.sumEV2 = 0;
        node.meanEV = 0;
        node.winCount = 0;
        node.totalPoints = 0;
        node.tenpaiCount = 0;
    }

    const updateNodeStats = (node: any, point: number) => {
        // visits = 1 スタートの場合、1回目の実行で visits を 1 のままにするか 2 にするか。
        // 一般的な UCB 実装では visits = 1 は「既に1回探索済み」を意味する。
        // ここでは 実行 -> 加算 -> visitsインクリメント の順にする。
        node.sumEV += point;
        node.sumEV2 += point * point;
        if (point > 0) {
            node.winCount++;
            node.totalPoints += point;
        }
        node.meanEV = node.sumEV / node.visits;
        node.visits++; // 次回の計算用にインクリメント
    };

    const TOTAL_INITIAL_STEPS = 2000;

    // ==========================================
    // Phase 1: Batch CRN + Antithetic Search
    // ==========================================
    // 全候補に対し、同一の wall とその反転 (Antithetic) を用いて評価する
    const batchWallSamples = Math.floor(TOTAL_INITIAL_STEPS / (ucbNodes.length * 2));
    
    for (let w = 0; w < batchWallSamples; w++) {
        const wallIndex = w % wallPool.length;
        const wall = wallPool[wallIndex];
        const revWall = reverseWallPool[wallIndex];
        
        // Antithetic 用の独立したシード
        const seed1 = w >>> 0;
        const seed2 = (w >>> 0) ^ 0x9e3779b9;

        for (const node of ucbNodes) {
            const afterHand = node.action.type === 'discard' ? removeOneTile(myHand, (node.action as any).tile) : myHand;

            // 試行1 (Normal)
            workTrialCounts.fill(0); workHand27.fill(0); workUraCounts.fill(0);
            const res1 = runSinglePath(
                afterHand, fixedMentsu, node.action, myKita, otherKita, doraIndicators,
                currentTurn, isDealer, wall, templateLen, liveWallLimit, selfEffectiveWallCount,
                templateCounts as any, workTrialCounts, workHand27, workUraCounts,
                seed1, initialShanten, 0, totalSimulationSteps
            );
            updateNodeStats(node, res1.point);
            if (res1.finalShanten <= 0) node.tenpaiCount++;
            totalSimulationSteps++;

            // 試行2 (Antithetic)
            workTrialCounts.fill(0); workHand27.fill(0); workUraCounts.fill(0);
            const res2 = runSinglePath(
                afterHand, fixedMentsu, node.action, myKita, otherKita, doraIndicators,
                currentTurn, isDealer, revWall, templateLen, liveWallLimit, selfEffectiveWallCount,
                templateCounts as any, workTrialCounts, workHand27, workUraCounts,
                seed2, initialShanten, 0, totalSimulationSteps
            );
            updateNodeStats(node, res2.point);
            if (res2.finalShanten <= 0) node.tenpaiCount++;
            totalSimulationSteps++;
        }
        
        if (DEBUG.wall && w % 10 === 0) {
            console.log("Batch CRN progress:", { wallIndex: w, totalSteps: totalSimulationSteps });
        }
    }

    // ==========================================
    // Phase 2: Top-3 CI Racing
    // ==========================================
    // results 配列を構築せず、ucbNodes の参照をそのまま使って上位 3 件を特定する
    ucbNodes.sort((a, b) => b.meanEV - a.meanEV);
    const racingNodes = ucbNodes.slice(0, Math.min(3, ucbNodes.length));

    const RACING_MAX_TRIALS = 3000;

    function computeLocalCI(node: any) {
        if (node.visits < 2) return { lower: -Infinity, upper: Infinity };
        // 指示された分散計算式: variance = (sumEV2 - visits * meanEV^2) / (visits - 1)
        const variance = (node.sumEV2 - node.visits * node.meanEV * node.meanEV) / (node.visits - 1);
        const stderr = Math.sqrt(Math.max(variance, 0) / node.visits);
        const delta = 1.96 * stderr;
        return {
            lower: node.meanEV - delta,
            upper: node.meanEV + delta
        };
    }

    let racingTrials = 0;
    let racingStopReason = "MAX_TRIALS";

    const racingWallSamples = Math.floor(RACING_MAX_TRIALS / (racingNodes.length * 2));

    for (let w = 0; w < racingWallSamples; w++) {
        const wallIndex = totalSimulationSteps % wallPool.length;
        const wall = wallPool[wallIndex];
        const revWall = reverseWallPool[wallIndex];
        const seed1 = totalSimulationSteps >>> 0;
        const seed2 = (totalSimulationSteps >>> 0) ^ 0x9e3779b9;

        for (const node of racingNodes) {
            const afterHand = node.action.type === 'discard' ? removeOneTile(myHand, (node.action as any).tile) : myHand;

            // res1
            workTrialCounts.fill(0); workHand27.fill(0); workUraCounts.fill(0);
            const res1 = runSinglePath(
                afterHand, fixedMentsu, node.action, myKita, otherKita, doraIndicators,
                currentTurn, isDealer, wall, templateLen, liveWallLimit, selfEffectiveWallCount,
                templateCounts as any, workTrialCounts, workHand27, workUraCounts,
                seed1, initialShanten, 0, totalSimulationSteps
            );
            updateNodeStats(node, res1.point);
            if (res1.finalShanten <= 0) node.tenpaiCount++;
            
            // res2
            workTrialCounts.fill(0); workHand27.fill(0); workUraCounts.fill(0);
            const res2 = runSinglePath(
                afterHand, fixedMentsu, node.action, myKita, otherKita, doraIndicators,
                currentTurn, isDealer, revWall, templateLen, liveWallLimit, selfEffectiveWallCount,
                templateCounts as any, workTrialCounts, workHand27, workUraCounts,
                seed2, initialShanten, 0, totalSimulationSteps + 1
            );
            updateNodeStats(node, res2.point);
            if (res2.finalShanten <= 0) node.tenpaiCount++;

            totalSimulationSteps += 2;
            racingTrials += 2;
        }
    }

    // ========== Results Aggregation ==========
    ucbNodes.sort((a, b) => b.meanEV - a.meanEV);

    // 有効牌計算用の「可視牌カウント」を計算（巡目消費抜き、赤5合算）
    const visibilityCounts29 = getInitialCounts();
    if (DEBUG.ukeire) {
        console.log("UKEIRE_VISIBLE_SOURCE", visible.map(t => tileToString(t)));
    }
    for (const t of visible) {
        const idx = TILE_TYPES.indexOf(t);
        if (DEBUG.ukeire) {
            console.log("DECREMENT_TRACE", { tile: tileToString(t), id: t, index: idx, before: idx !== -1 ? visibilityCounts29[idx] : -1 });
        }
        if (idx !== -1 && visibilityCounts29[idx] > 0) visibilityCounts29[idx]--;
    }
    const ukeireCounts27 = new Int8Array(27);
    for (let i = 0; i < 29; i++) {
        const s = toSanmaTile(TILE_TYPES[i]);
        if (s !== -1) ukeireCounts27[s] += visibilityCounts29[i];
    }
    if (DEBUG.ukeire) {
        console.log("UKEIRE_COUNTS_27", ukeireCounts27);
    }

    const results: any[] = ucbNodes.map(node => {
        const ci = computeLocalCI(node);
        const visits = node.visits || 0;
        const winCount = node.winCount || 0;

        const handAfter = node.action.type === 'discard' ? removeOneTile(myHand, (node.action as any).tile) : myHand;
        const hand27 = new Int8Array(27);
        for (const t of handAfter) {
            const s = toSanmaTile(t);
            if (s !== -1) hand27[s]++;
        }
        const ukeire = getUkeireInfo27(hand27, fixedMentsu.length, ukeireCounts27);

        return {
            action: node.action,
            ev: visits > 0 ? node.meanEV : 0,
            evMean: visits > 0 ? node.meanEV : 0,
            trialCount: visits,
            winRate: visits > 0 ? winCount / visits : 0,
            avgScore: winCount > 0 ? node.totalPoints / winCount : 0,
            tenpaiRate: visits > 0 ? node.tenpaiCount / visits : 0,
            shantenBefore: initialShanten,
            shantenAfter: calculateShanten(handAfter, fixedMentsu.length),
            effectiveTileTypes: ukeire.typeCount,
            effectiveTileCount: ukeire.tileCount,
            converged: racingStopReason === "CI_CONVERGED",
            stdError: visits > 1 ? Math.sqrt(Math.max(((node.sumEV2 - visits * node.meanEV * node.meanEV) / (visits - 1)), 0)) / Math.sqrt(visits) : 0,
            confidence95: visits > 1 ? (Math.abs(ci.upper - ci.lower) / 2) : 0,
            ciLower: visits > 0 ? ci.lower : 0,
            ciUpper: visits > 0 ? ci.upper : 0,
            lcb: visits > 0 ? ci.lower : 0
        };
    });

    const endTime = performance.now();
    const summary = createSummary(config, initialRemainingTiles, endTime - startTime);

    // Results formatting and cache saving
    results.forEach((r: any) => {
        const handAfter = r.action.type === 'discard' ? removeOneTile(myHand, r.action.tile) : myHand;
        const cacheKey = Engine.buildStateKey(handAfter, config.currentTurn || 0, fixedMentsu.length, myKita, otherKita);
        Engine.saveStateCache(cacheKey, r.evMean);
    });

    self.postMessage({ type: 'RESULT', results, summary });
    if (DEBUG.performance) {
        logPerformanceStats();
    }
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
    if (DEBUG.actionGen) {
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

    if (DEBUG.actionGen) {
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

    if (DEBUG.actionGen) {
        console.log("DISCARD_MAP_SIZE", discardMap.size);
    }

    // ② Mapからのみdiscard生成
    for (const [_normalKey, tileInd] of discardMap.entries()) {
        const tile = hand[tileInd];

        if (DEBUG.actionGen) {
            console.log("DISCARD_MAP_DEBUG", {
                tileInd,
                tileType: toNormalFive(tile),
                tileName: tileToString(tile)
            });
        }

        const generateDiscard = (riichi: boolean) => {
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

    if (DEBUG.actionGen) {
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
    if (DEBUG.actionGen) {
        const tileKinds = new Set<number>();
        for (const a of actions) {
            if (a.type !== 'discard') continue;
            const key = toNormalFive(hand[a.tileInd]);
            tileKinds.add(key);
        }
        console.log("UNIQUE_TILE_TYPES", tileKinds.size);
    }


    if (DEBUG.actionGen) console.log("TOTAL_ACTION_COUNT", actions.length);
    if (hand.includes(TILES.z4 as any)) actions.push({ type: 'kita' });
    if (DEBUG.actionGen) console.log("ACTION_GEN_EXIT_COUNT", actions.length);
    return actions;
}
