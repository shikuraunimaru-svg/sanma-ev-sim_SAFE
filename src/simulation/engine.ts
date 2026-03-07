import { TILES, toNormalFive, isRedFive, tileToString } from '../core/tile';
export { TILES };
import type { Tile } from '../core/tile';
import { calculateShanten27, getAgariPatterns, getShantenBreakdown27 } from '../core/shanten';
export { getShantenBreakdown27 };
import { toSanmaTile, toStandardTile } from '../core/sanmaTiles';
import type { Mentsu, HandStructure } from '../core/shanten';
import { calculateScore } from '../core/yaku';
import type { GameState, YakuResult } from '../core/yaku';
import { calculatePoints } from '../core/score';
import type { ScoreResult } from '../core/score';

/**
 * DEBUG_LOG: パフォーマンス維持のため、シミュレーション中の詳細ログを抑制する。
 */
const DEBUG_LOG = false;

/**
 * Tile Count System (29 Types)
 */
export const TILE_TYPES: Tile[] = [
    TILES.m1, TILES.m9,
    TILES.p1, TILES.p2, TILES.p3, TILES.p4, TILES.p5, TILES.p5r, TILES.p6, TILES.p7, TILES.p8, TILES.p9,
    TILES.s1, TILES.s2, TILES.s3, TILES.s4, TILES.s5, TILES.s5r, TILES.s6, TILES.s7, TILES.s8, TILES.s9,
    TILES.z1, TILES.z2, TILES.z3, TILES.z4, TILES.z5, TILES.z6, TILES.z7
];

export function getInitialCounts(): Int8Array {
    const counts = new Int8Array(29).fill(4);
    // Pinzu: Normal 5p is 3, Red 5p is 1
    counts[TILE_TYPES.indexOf(TILES.p5)] = 3;
    counts[TILE_TYPES.indexOf(TILES.p5r)] = 1;
    // Souzu: Normal 5s is 3, Red 5s is 1
    counts[TILE_TYPES.indexOf(TILES.s5)] = 3;
    counts[TILE_TYPES.indexOf(TILES.s5r)] = 1;
    return counts;
}

function validateAgari(result: YakuResult): boolean {
    if (result.yakuman) return true;
    const baseHan = result.yakuList
        .filter(y => !y.isDora)
        .reduce((sum, y) => sum + y.han, 0);
    return baseHan > 0;
}

function getDoraValue(ind: Tile): Tile {
    const normalInd = toNormalFive(ind);
    if (normalInd >= 0 && normalInd <= 8) return normalInd === 0 ? 8 : (normalInd === 8 ? 0 : normalInd + 1);
    if (normalInd >= 9 && normalInd <= 17) return normalInd === 17 ? 9 : normalInd + 1;
    if (normalInd >= 18 && normalInd <= 26) return normalInd === 26 ? 18 : normalInd + 1;
    if (normalInd >= 27 && normalInd <= 30) return normalInd === 30 ? 27 : normalInd + 1;
    if (normalInd >= 31 && normalInd <= 33) return normalInd === 33 ? 31 : normalInd + 1;
    return normalInd;
}

function resolveFinalScore(
    result: YakuResult,
    state: GameState
): { finalHan: number; points: number } {
    const finalResult = { ...result, han: result.han };
    const isDealer = state.isDealer ?? false;
    const points = calculatePoints(finalResult, isDealer, true).total;

    return { finalHan: result.han, points };
}

// =========================================================
// Phase71: Fast Win Evaluation (Monte Carlo dedicated)
// 配列・オブジェクト生成なし。翻数→符→点数を直接計算。
// isDealer=true, isTsumo=true の Monte Carlo ツモ専用。
// =========================================================

// サンマ用 fast 符計算（オブジェクト非生成版）
function calcFuFast(structure: HandStructure, isRiichi: boolean, winTile: Tile): number {
    if (structure.head === -1 && structure.mentsu.length === 0) return 25;

    let fu = 20;

    for (let i = 0; i < structure.mentsu.length; i++) {
        const m = structure.mentsu[i];
        if (m.type === 'koutsu') {
            const isYW = m.tile === TILES.m1 || m.tile === TILES.m9 ||
                m.tile === TILES.p1 || m.tile === TILES.p9 ||
                m.tile === TILES.s1 || m.tile === TILES.s9 ||
                (m.tile >= 27 && m.tile <= 33);
            fu += m.isOpen ? (isYW ? 4 : 2) : (isYW ? 8 : 4);
        } else if (m.type === 'kantsu') {
            const isYW = m.tile === TILES.m1 || m.tile === TILES.m9 ||
                m.tile === TILES.p1 || m.tile === TILES.p9 ||
                m.tile === TILES.s1 || m.tile === TILES.s9 ||
                (m.tile >= 27 && m.tile <= 33);
            fu += m.isOpen ? (isYW ? 16 : 8) : (isYW ? 32 : 16);
        }
    }

    const head = structure.head;
    // Yakuhai head: z5(Haku)=31, z6(Hatsu)=32, z7(Chun)=33, z1(Ton/Bakaze)=27
    if (head === 31 || head === 32 || head === 33 || head === 27) fu += 2;

    // Wait type: tanki or kanchan/penchan → +2
    if (winTile === head) {
        fu += 2; // tanki
    } else {
        for (let i = 0; i < structure.mentsu.length; i++) {
            const m = structure.mentsu[i];
            if (m.type !== 'shuntsu') continue;
            const s = m.tile;
            if (winTile < s || winTile > s + 2) continue;
            const pos = winTile - s;
            // Get number of start tile in 1-9 range
            let startNum = s - 8; // for p: p1=9→1, p2=10→2...
            if (s >= 0 && s <= 8) startNum = s + 1;      // manzu
            else if (s >= 9 && s <= 17) startNum = s - 8; // pinzu
            else if (s >= 18 && s <= 26) startNum = s - 17; // souzu
            if (pos === 1) { fu += 2; break; } // kanchan
            if (startNum === 1 && pos === 2) { fu += 2; break; } // penchan
            if (startNum === 7 && pos === 0) { fu += 2; break; } // penchan
            break;
        }
    }

    // Tsumo +2
    fu += 2;
    // Round up to nearest 10
    fu = Math.ceil(fu / 10) * 10;
    return fu;
}

// サンマ点数テーブル: isDealer=true → ceil(base*2)×2人
//                    isDealer=false → ceil(base*2)(親) + ceil(base)(もう1人)
function calcPointsFast(han: number, fu: number, isYakuman: boolean, yakumanMult: number, isDealer: boolean): number {
    const ceil100 = (n: number) => Math.ceil(n / 100) * 100;

    if (isYakuman) {
        if (isDealer) return 16000 * yakumanMult * 2;
        // 子役満ツモ: 親16000 + 子8000
        return (16000 + 8000) * yakumanMult;
    }

    let base = fu * (1 << (han + 2)); // fu * 2^(han+2)
    if (base > 2000 || han >= 5) {
        if (han >= 13) base = 8000;
        else if (han >= 11) base = 6000;
        else if (han >= 8) base = 4000;
        else if (han >= 6) base = 3000;
        else base = 2000;
    }

    if (isDealer) {
        // dealer tsumo: ceil(base * 2) per person × 2 persons
        return ceil100(base * 2) * 2;
    } else {
        // non-dealer tsumo (sanma): dealer pays ceil(base*2), other non-dealer pays ceil(base)
        return ceil100(base * 2) + ceil100(base);
    }
}

/**
 * Phase71: Monte Carlo 専用高速 win スコア計算。
 * 配列・オブジェクト生成なし。dealer tsumo 固定（isDealer=true, isTsumo=true）。
 * @returns 点数（0 = 役なし / 無効）
 */
export function scoreWinningHandFast(
    hand: Tile[],
    structure: HandStructure,
    state: GameState
): number {
    const isMenzen = !structure.mentsu.some(m => m.isOpen);
    const s = structure;

    // ---------- 役満判定 ----------
    let yakumanMult = 0;

    // 清老頭: 全て端牌
    const fullLen = (s.head !== -1 ? 2 : 0) + s.mentsu.reduce((a, m) => a + m.tiles.length, 0);
    if (fullLen > 0) {
        let isChinroutou = true;
        for (let i = 0; i < hand.length; i++) {
            const t = hand[i];
            if (!(t === 0 || t === 8 || t === 9 || t === 17 || t === 18 || t === 26)) { isChinroutou = false; break; }
        }
        if (isChinroutou) yakumanMult++;
    }

    // 大三元: 3つの三元牌刻子
    let dragonKotsu = 0;
    for (let i = 0; i < s.mentsu.length; i++) {
        const m = s.mentsu[i];
        if ((m.type === 'koutsu' || m.type === 'kantsu') && m.tile >= 31 && m.tile <= 33) dragonKotsu++;
    }
    if (dragonKotsu === 3) yakumanMult++;

    // 四暗刻
    if (isMenzen && s.head !== -1) {
        let ankou = 0;
        for (let i = 0; i < s.mentsu.length; i++) {
            const m = s.mentsu[i];
            if ((m.type === 'koutsu' || m.type === 'kantsu') && !m.isOpen) ankou++;
        }
        if (ankou === 4) yakumanMult++;
    }

    // 字一色
    let isTsuiisou = hand.length > 0;
    for (let i = 0; i < hand.length; i++) {
        if (hand[i] < 27) { isTsuiisou = false; break; }
    }
    if (isTsuiisou) yakumanMult++;

    // 四槓子
    let kanCount = 0;
    for (let i = 0; i < s.mentsu.length; i++) {
        if (s.mentsu[i].type === 'kantsu') kanCount++;
    }
    if (kanCount >= 4) yakumanMult++;

    // 天和（dealer, turn=1, tsumo, no call）
    if (state.isTsumo && !state.hasCallOccurred && (state.discardCount || 0) === 0
        && state.isDealer && (state.turnCount || 0) <= 1) {
        yakumanMult++;
    }

    if (yakumanMult > 0) {
        return calcPointsFast(0, 0, true, yakumanMult, state.isDealer ?? true);
    }

    // ---------- 通常役判定（han 加算のみ） ----------
    let han = 0;
    let hasPinfu = false;

    if (isMenzen) {
        if (state.isDoubleRiichi) han += 2;
        else if (state.isRiichi) han += 1;
        if (state.isIppatsu) han += 1;
        if (state.isTsumo) han += 1; // 門清ツモ
    }
    if (state.isHaitei && state.isTsumo) han += 1;

    // タンヤオ
    let isTanyao = hand.length > 0;
    for (let i = 0; i < hand.length; i++) {
        const t = hand[i];
        if (t === 0 || t === 8 || t === 9 || t === 17 || t === 18 || t === 26 || t >= 27) {
            isTanyao = false; break;
        }
    }
    if (isTanyao) han += 1;

    // 一色手
    let hasHonor = false; let suitBits = 0;
    for (let i = 0; i < hand.length; i++) {
        const t = hand[i];
        if (t >= 27) { hasHonor = true; }
        else if (t <= 8) suitBits |= 1;
        else if (t <= 17) suitBits |= 2;
        else suitBits |= 4;
    }
    const suitCount = (suitBits !== 0 ? ((suitBits & 1) + ((suitBits >> 1) & 1) + ((suitBits >> 2) & 1)) : 0);
    if (!hasHonor && suitCount === 1) han += isMenzen ? 6 : 5; // 清一色
    else if (hasHonor && suitCount === 1) han += isMenzen ? 3 : 2; // 混一色

    if (s.head === -1) {
        // 七対子
        if (hand.length === 14) {
            let pairs = 0;
            // 簡易チェック: ソートされた手牌でペアを数える
            let prev = -1; let cnt = 0;
            for (let i = 0; i < hand.length; i++) {
                if (hand[i] === prev) { cnt++; if (cnt === 2) { pairs++; cnt = 0; } }
                else { prev = hand[i]; cnt = 1; }
            }
            if (pairs === 7) han += 2;
        }
        // ドラ加算
        han += state.doraCount;
        han += state.uraDoraCount;
        han += state.kitaCount;
        if (han <= 0) return 0; // 役なし
        const fu = 25;
        return calcPointsFast(han, fu, false, 1, state.isDealer ?? true);
    }

    // ピンフ
    if (isMenzen && s.head !== -1) {
        let allShuntsu = true;
        let nonYakuhaiHead = !(s.head === 27 || s.head === 28 || s.head === 29 || s.head === 30 ||
            s.head === 31 || s.head === 32 || s.head === 33);
        for (let i = 0; i < s.mentsu.length; i++) {
            if (s.mentsu[i].type !== 'shuntsu') { allShuntsu = false; break; }
        }
        if (allShuntsu && nonYakuhaiHead && state.winningTile !== undefined) {
            // 両面待ch判定: シュンツ終端でないこと
            let isRyanmen = false;
            for (let i = 0; i < s.mentsu.length; i++) {
                const m = s.mentsu[i];
                if (m.type !== 'shuntsu') continue;
                if (state.winningTile < m.tile || state.winningTile > m.tile + 2) continue;
                const pos = state.winningTile - m.tile;
                if (pos === 1) break; // kanchan
                let sn = m.tile;
                if (sn >= 9 && sn <= 17) sn -= 8; else if (sn >= 18 && sn <= 26) sn -= 17; else sn += 1;
                if ((sn === 1 && pos === 2) || (sn === 7 && pos === 0)) break; // penchan
                isRyanmen = true; break;
            }
            if (isRyanmen) { han += 1; hasPinfu = true; }
        }
    }

    // 役牌
    for (let i = 0; i < s.mentsu.length; i++) {
        const m = s.mentsu[i];
        if (m.type !== 'koutsu' && m.type !== 'kantsu') continue;
        if (m.tile === state.bakaze) han += 1;
        if (m.tile === state.jikaze) han += 1;
        if (m.tile === 31) han += 1; // Haku
        if (m.tile === 32) han += 1; // Hatsu
        if (m.tile === 33) han += 1; // Chun
    }

    // 一盃口 / 二盃口
    if (isMenzen) {
        let pairCnt = 0;
        // シュンツのペアをカウント（tile の値が同じシュンツが2つ）
        for (let i = 0; i < s.mentsu.length; i++) {
            if (s.mentsu[i].type !== 'shuntsu') continue;
            let dup = 0;
            for (let j = i + 1; j < s.mentsu.length; j++) {
                if (s.mentsu[j].type === 'shuntsu' && s.mentsu[j].tile === s.mentsu[i].tile) dup++;
            }
            if (dup >= 1) pairCnt++;
        }
        if (pairCnt >= 2) han += 3; // 二盃口
        else if (pairCnt === 1) han += 1; // 一盃口
    }

    // 三暗刻
    let ankou3 = 0;
    for (let i = 0; i < s.mentsu.length; i++) {
        const m = s.mentsu[i];
        if ((m.type === 'koutsu' || m.type === 'kantsu') && !m.isOpen) ankou3++;
    }
    if (ankou3 >= 3) han += 2;

    // 対々和
    let isToitoi = s.mentsu.length > 0;
    for (let i = 0; i < s.mentsu.length; i++) {
        if (s.mentsu[i].type !== 'koutsu' && s.mentsu[i].type !== 'kantsu') { isToitoi = false; break; }
    }
    if (isToitoi) han += 2;

    // 三槓子
    if (kanCount === 3) han += 2;

    // ドラ加算
    han += state.doraCount;
    han += state.uraDoraCount;
    han += state.kitaCount;

    // ----- HAN_DEBUG (Phase73: 指示内容のログ追加) -----
    if (DEBUG_LOG && han >= 8) {
        console.log("HAN_DEBUG", {
            han,
            fu: hasPinfu ? 20 : calcFuFast(structure, state.isRiichi, state.winningTile ?? -1),
            doraCount: state.doraCount,
            kitaCount: state.kitaCount,
            isRiichi: state.isRiichi,
            isMenzen: isMenzen,
            isTsumo: state.isTsumo,
            yakus: {
                // 主要な役のフラグを簡易的に出力
                pinfu: hasPinfu,
                toitoi: isToitoi,
                ankou3: ankou3,
                tanyao: isTanyao
            }
        });
    }

    if (han <= 0) return 0; // 役なし

    const fu = hasPinfu ? 20 : calcFuFast(structure, state.isRiichi, state.winningTile ?? -1);
    return calcPointsFast(han, fu, false, 1, state.isDealer ?? true);
}


/**
 * Simple LCG-based PRNG for deterministic simulation paths (supporting CRN).
 */
export class SimpleRNG {
    private state: number;
    constructor(seed: number) {
        this.state = seed >>> 0;
    }
    next(): number {
        // LCG: MMAR
        this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
        return this.state / 4294967296;
    }
}

export type Action =
    | {
        type: 'discard',
        tile: Tile,
        tileInd: number,
        riichi: boolean,
    }
    | { type: 'kita' }
    | { type: 'ankan', tile: Tile, riichi?: boolean }
    | { type: 'kakan', tile: Tile }
    | { type: 'tsumo' };

export type SimulationConfig = {
    myHand: Tile[];
    fixedMentsu: Mentsu[];
    otherOpenMelds?: Mentsu[];
    myDiscards: Tile[];
    doraIndicators: Tile[];
    myKita: number;
    otherKita: number;
    trials: number;
    currentTurn: number;
    isDealer: boolean;
    selfEffectiveWallCount: number;
    liveWallLimit: number;
    myKanCount: number;
    validationMode?: boolean;
};


export type SimulationSummary = {
    remainingTiles: number;
    displayRemainingTiles: number;
    shanten: {
        normal: number;
        chiitoi: number;
        kokushi: number;
    };
    totalTimeMs?: number;
};

/**
 * Unifies the physical playable wall boundary calculation (excluding 王牌 13 tiles).
 */
export function computeLiveWall(config: {
    myHand: Tile[],
    doraIndicators: Tile[],
    myKita: number,
    otherKita: number,
    currentTurn: number,
    myKanCount: number
}): number {
    // visibleCount for playable wall calculation should exclude "extra" dora indicators
    // because they are accounted for by the reduced dead wall count.
    const extraDora = Math.max(0, config.doraIndicators.length - 1);
    const visibleCount = config.myHand.length + config.myKita + config.otherKita;
    const turnConsumption = (config.currentTurn - 1) * 3;
    const physicalMountainAtTurnStart = 108 - visibleCount - turnConsumption;

    // Dead wall is 14 tiles. Subsequent Kans add more dora indicators.
    // The "unseen" part of the dead wall is (14 - extraDora).
    const deadWallActualCount = Math.max(0, 14 - extraDora);

    return Math.max(0, physicalMountainAtTurnStart - deadWallActualCount);
}

export function getPlayableWallCount(config: {
    myHand: Tile[],
    doraIndicators: Tile[],
    myKita: number,
    otherKita: number,
    currentTurn: number,
    myKanCount: number
}): number {
    return computeLiveWall(config);
}

export function createSummary(config: SimulationConfig, remainingTiles: number, totalTimeMs?: number): SimulationSummary {
    const hand27 = new Int8Array(27);
    for (const t of config.myHand) {
        const s = toSanmaTile(toNormalFive(t));
        if (s !== -1) hand27[s]++;
    }
    const b = getShantenBreakdown27(Array.from(hand27), config.fixedMentsu.length);
    const displayRemainingTiles = Math.max(0, remainingTiles - 26);
    return {
        remainingTiles,
        displayRemainingTiles,
        shanten: { normal: b.normal, chiitoi: b.chiitoi, kokushi: b.kokushi },
        totalTimeMs
    };
}

export type DiscardResult = {
    action: Action;
    winRate: number;
    avgScore: number;
    ev: number;
    evMean: number;
    ronRate: number;
    tenpaiRate: number;
    shantenBefore: number;
    shantenAfter: number;
    trialCount: number;
    previousMeanEV: number;
    stableCount: number;
    converged: boolean;
    initialRemainingTiles: number;
    initialShanten: number;
    isLookaheadApplied?: boolean;
    totalScore: number;
    totalScore2: number;
    totalWinPoints: number;
    wins: number;
    tenpaiCount: number;
    layerA_totalScore: number;
    layerB_totalScore: number;
    layerA_trials: number;
    layerB_trials: number;
    stdError: number;
    confidence95: number;
    m2: number;
    ciLower: number;
    ciUpper: number;
    effectiveTiles?: { tile: Tile; count: number }[];
    lcb?: number;
    reachedDiff: boolean;
    totalAgariTurnSum: number;
    agariCount: number;
    averageAgariTurn: number | null;
    averageAgariAfterTurns: number | null;
};

export type SimulationPathResult = {
    type: 'win' | 'draw';
    point: number;
    isTenpai: boolean;
    initialRemainingTiles: number;
    totalAgariTurnSum: number;
    agariCount: number;
    engineLiveWallLimit: number;
};

let debugSimCountGlobal = 0;
const debugCountsByTile: Record<number, number> = {};
let debugWinLogged = false;
export let fullEvalCount = 0; // Phase71: win 判定（patterns.length > 0）カウンタ

export function resetDebugSimCount() {
    debugSimCountGlobal = 0;
    for (const key in debugCountsByTile) {
        delete debugCountsByTile[key];
    }
}

// TypedArray resources
const SHARED_MOUNTAIN = new Uint8Array(108);

export function shuffleInPlace(arr: Uint8Array, len: number) {
    for (let i = len - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
}

// DEBUG FLAG (Set to true only for diagnosing EV calculation issues)
const DEBUG_MODE = true;

// ===== DEBUG FLAGS =====
const DEBUG_WIN = false;        // WIN_DEBUG ログの ON/OFF（デフォルト OFF）
const DEBUG_SIM_ACTION = true;  // Phase71検証: discard最初の10試行の入力手牌确認用

export function resetDebugCounters() {
    debugSimCountGlobal = 0;
    debugWinLogged = false;
    fullEvalCount = 0; // Phase71 カウンタもリセット
}

// --- Shanten Memoization ---
let shantenCache: Map<string, number> | null = null;
let shantenHit = 0;
let shantenMiss = 0;

export function initShantenCache() {
    shantenCache = new Map();
    shantenHit = 0;
    shantenMiss = 0;
}

export function clearShantenCache() {
    shantenCache = null;
}

export function getShantenCacheStats() {
    return { hit: shantenHit, miss: shantenMiss };
}

function encodeCounts27(counts: Int8Array | Int32Array): string {
    let s = "";
    for (let i = 0; i < 27; i++) {
        s += String.fromCharCode(48 + counts[i]); // '0'-'4'
    }
    return s;
}

export function getShantenMemoized(counts: Int8Array | Int32Array, fixedMentsuCount: number): number {
    if (!shantenCache) return calculateShanten27(counts as any, fixedMentsuCount);

    const key = String.fromCharCode(48 + fixedMentsuCount) + encodeCounts27(counts);
    const cached = shantenCache.get(key);
    if (cached !== undefined) {
        shantenHit++;
        return cached;
    }

    shantenMiss++;
    const result = calculateShanten27(counts as any, fixedMentsuCount);
    shantenCache.set(key, result);
    return result;
}

export function getWinningTiles27(hand27: Int32Array | Int8Array | number[], fixedMentsuCount: number): number[] {
    const wins: number[] = [];
    for (let s = 0; s < 27; s++) {
        (hand27 as any)[s]++;
        if (getShantenMemoized(hand27 as any, fixedMentsuCount) === -1) {
            wins.push(s);
        }
        (hand27 as any)[s]--;
    }
    return wins;
}

export function getWinningTiles(hand: Tile[], fixedMentsuCount: number): Tile[] {
    const hand27 = new Int32Array(27);
    for (const t of hand) {
        const s = toSanmaTile(toNormalFive(t));
        if (s !== -1) hand27[s]++;
    }
    const wins27 = getWinningTiles27(hand27, fixedMentsuCount);
    return wins27.map(s => toStandardTile(s) as Tile);
}

/**
 * Pure function to find the best discard from a 27-count hand.
 * Returns the index (0-26) or -1 if no discards possible.
 */
export function findBestDiscard27(
    hand27: Int8Array | number[],
    fixedMentsuCount: number,
    invisibleCounts29: Int8Array | number[],
    rng?: SimpleRNG,
    tenpaiDepth: number = 0
): number {
    let bestTilesS27: number[] = [];
    let minShantenFound = 99;
    let maxUkeireFound = -1;

    // If tenpaiDepth >= 2, we are in a re-tenpai situation where we must not drop shanten back to 1.
    const currentShanten = getShantenMemoized(hand27 as any, fixedMentsuCount);
    const forceMaintainTenpai = (tenpaiDepth >= 2 && currentShanten === 0);

    for (let i = 0; i < 27; i++) {
        if (hand27[i] === 0) continue;

        hand27[i]--;
        const s = getShantenMemoized(hand27 as any, fixedMentsuCount);

        // If forcing tenpai maintenance, skip any discard that increases shanten above 0
        if (forceMaintainTenpai && s > 0) {
            hand27[i]++;
            continue;
        }

        let ukeire = 0;
        if (s <= 1) { // We care about ukeire for 0 and 1 shanten
            ukeire = getUkeireCount27(hand27, fixedMentsuCount, invisibleCounts29);
        }

        if (s < minShantenFound) {
            minShantenFound = s;
            maxUkeireFound = ukeire;
            bestTilesS27 = [i];
        } else if (s === minShantenFound) {
            if (ukeire > maxUkeireFound) {
                maxUkeireFound = ukeire;
                bestTilesS27 = [i];
            } else if (ukeire === maxUkeireFound) {
                bestTilesS27.push(i);
            }
        }
        hand27[i]++;
    }
    if (bestTilesS27.length === 0) return -1;
    if (bestTilesS27.length === 1) return bestTilesS27[0];

    const r = rng ? rng.next() : Math.random();
    return bestTilesS27[Math.floor(r * bestTilesS27.length)];
}

/**
 * Calculates total ukeire (shanten-improving tiles) count from mountain.
 */
export function getUkeireCount27(
    hand27: Int8Array | Int32Array | number[],
    fixedMentsuCount: number,
    invisibleCounts29: Int8Array | number[]
): number {
    let total = 0;
    const currentShanten = getShantenMemoized(hand27 as any, fixedMentsuCount);

    // We only check tiles 0-26 (Sanma tiles)
    for (let t = 0; t < 27; t++) {
        const count = invisibleCounts29[t];
        if (count <= 0) continue;

        hand27[t]++;
        const nextShanten = getShantenMemoized(hand27 as any, fixedMentsuCount);
        if (nextShanten < currentShanten) {
            total += count;
        }
        hand27[t]--;
    }
    return total;
}

export function simpleHash(arr: Uint8Array, len: number): string {
    let hash = 0;
    for (let i = 0; i < len; i++) {
        hash = ((hash << 5) - hash) + arr[i];
        hash |= 0;
    }
    return (hash >>> 0).toString(16);
}

export function runSinglePath(
    initialHand: Tile[],
    localFixedMentsuArr: Mentsu[],
    initialAction: Action,
    myKita: number,
    otherKita: number, // Added for unified wall calc
    doraIndicators: Tile[],
    currentTurn: number,
    isDealer: boolean,
    mountain: Uint8Array,
    mountainSize: number, // Physical size for summary
    liveWallLimit: number, // High-bound for draws
    selfEffectiveWallCount: number,
    templateCounts: Int8Array,
    workTrialCounts: Int8Array,
    workHand27: Int8Array,
    workUraCounts: Int8Array,
    seed: number,
    tenpaiDepth: number = 0
): SimulationPathResult {
    const rng = new SimpleRNG(seed);
    const initialTotalForSummary = liveWallLimit;

    // Internalized path executor
    const executePath = (): SimulationPathResult => {
        // --- 1. State Reset ---
        const hand27 = workHand27;
        const trialCounts = workTrialCounts;

        for (let i = 0; i < 27; i++) hand27[i] = 0;
        for (const t of initialHand) {
            const sTile = toSanmaTile(toNormalFive(t));
            if (sTile !== -1) hand27[sTile]++;
        }

        // Detailed logs only if DEBUG_LOG is ON
        if (DEBUG_LOG && DEBUG_SIM_ACTION && seed % 100 < 3) {
            console.log("SIM_ACTION_START", {
                actionType: initialAction.type,
                discardTile: (initialAction as any).tile,
                discardTileName: (initialAction as any).tile !== undefined
                    ? tileToString((initialAction as any).tile) : "(none)",
                handBefore: initialHand.map(tileToString)
            });
            const handAfterArr: string[] = [];
            for (let i = 0; i < 27; i++) {
                for (let j = 0; j < hand27[i]; j++) handAfterArr.push(tileToString(toStandardTile(i)));
            }
            console.log("HAND_AFTER_DISCARD", handAfterArr);
        }

        for (let i = 0; i < 29; i++) trialCounts[i] = templateCounts[i];

        let redP5 = 0; let redS5 = 0;
        for (const t of initialHand) {
            if (t === TILES.p5r) redP5++;
            else if (t === TILES.s5r) redS5++;
        }

        let mountainPtr = 0;
        let selfDrawCount = 0;
        const selfDrawQuota = Math.floor(Math.max(0, liveWallLimit - 26) / 3);
        let nukidoraCount = myKita;
        let isRiichi = (initialAction.type === 'discard' && initialAction.riichi) || (initialAction.type === 'ankan' && initialAction.riichi) || false;
        let isIppatsu = isRiichi;
        let isHaitei = false;
        let pathTurnCount = 0;
        let scoreAdjustment = isRiichi ? -1000 : 0;

        const reconstructHand = (): Tile[] => {
            const res: Tile[] = [];
            let p5Added = 0; let s5Added = 0;
            for (let i = 0; i < 27; i++) {
                const count = hand27[i];
                const t34 = toStandardTile(i);
                for (let j = 0; j < count; j++) {
                    if (t34 === TILES.p5 && p5Added < redP5) { res.push(TILES.p5r); p5Added++; }
                    else if (t34 === TILES.s5 && s5Added < redS5) { res.push(TILES.s5r); s5Added++; }
                    else { res.push(t34); }
                }
            }
            return res;
        };

        const getCurrentDoraCount = () => countDora(reconstructHand(), doraIndicators, localFixedMentsuArr, nukidoraCount);

        // --- 2. Initial Kita Handling ---
        if (initialAction.type === 'kita') {
            const sNorth = toSanmaTile(toNormalFive(TILES.z4));
            if (sNorth !== -1 && hand27[sNorth] > 0) {
                hand27[sNorth]--;
                nukidoraCount++;
                while (mountainPtr < liveWallLimit) {
                    const rIdx = mountain[mountainPtr++];
                    trialCounts[rIdx]--;
                    const rTile = TILE_TYPES[rIdx];
                    if (rTile === TILES.z4) { nukidoraCount++; continue; }
                    const sRep = toSanmaTile(toNormalFive(rTile));
                    if (sRep !== -1) hand27[sRep]++;
                    if (rTile === TILES.p5r) redP5++; else if (rTile === TILES.s5r) redS5++;
                    break;
                }
            }
        }

        // --- 3. Simulation Loop ---
        let simLoopSafety = 0;
        while (mountainPtr < liveWallLimit && selfDrawCount < selfDrawQuota) {
            simLoopSafety++; if (simLoopSafety > 1000) break;
            pathTurnCount++;

            // My Draw
            let drawn: Tile | null = null;
            while (true) {
                if (mountainPtr >= liveWallLimit || selfDrawCount >= selfDrawQuota) break;
                const typeIdx = mountain[mountainPtr];
                mountainPtr += 3;
                selfDrawCount++;
                trialCounts[typeIdx]--;
                const tile = TILE_TYPES[typeIdx];
                if (tile === TILES.z4) { nukidoraCount++; continue; }
                drawn = tile;
                break;
            }

            if (!drawn) break;
            const sDrawn = toSanmaTile(toNormalFive(drawn));
            if (sDrawn !== -1) hand27[sDrawn]++;
            if (drawn === TILES.p5r) redP5++; else if (drawn === TILES.s5r) redS5++;
            if (mountainPtr >= liveWallLimit || selfDrawCount >= selfDrawQuota) isHaitei = true;

            // Win Check
            const currentHand = reconstructHand();
            const patterns = getAgariPatterns(currentHand, localFixedMentsuArr);

            if (patterns.length > 0) {
                fullEvalCount++;
                const state: GameState = {
                    bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                    isRiichi, isDoubleRiichi: false, isIppatsu, isTsumo: true,
                    isRinshan: false, isChankan: false, isHaitei, isHoutei: false,
                    kitaCount: nukidoraCount, doraCount: getCurrentDoraCount(), uraDoraCount: 0,
                    winningTile: drawn, isDealer, turnCount: currentTurn + pathTurnCount,
                    hasCallOccurred: localFixedMentsuArr.some(m => m.isOpen || m.isKan) || nukidoraCount > 0,
                    discardCount: 0
                };

                if (isRiichi) {
                    let tempPool = 0; for (let n = 0; n < 29; n++) tempPool += trialCounts[n];
                    const tempCounts = workUraCounts; for (let n = 0; n < 29; n++) tempCounts[n] = trialCounts[n];
                    let udc = 0;
                    for (let d = 0; d < doraIndicators.length; d++) {
                        if (tempPool <= 0) break;
                        let r = Math.floor(rng.next() * tempPool);
                        for (let j = 0; j < 29; j++) {
                            if (r < tempCounts[j]) {
                                const val = getDoraValue(TILE_TYPES[j]);
                                for (let k = 0; k < 27; k++) if (toStandardTile(k) === val) udc += hand27[k];
                                for (const m of localFixedMentsuArr) for (const t of m.tiles) if (toNormalFive(t) === val) udc++;
                                tempCounts[j]--; tempPool--; break;
                            }
                            r -= tempCounts[j];
                        }
                    }
                    state.uraDoraCount = udc;
                }

                const fastPoints = scoreWinningHandFast(currentHand, patterns[0], state);
                if (fastPoints > 0) {
                    if (DEBUG_LOG && DEBUG_WIN) {
                        const resScore = calculateScore(currentHand, patterns[0], state);
                        console.log("WIN_DEBUG", {
                            riichi: state.isRiichi, han: resScore.han, score: fastPoints
                        });
                    }
                    return {
                        type: 'win', point: fastPoints + scoreAdjustment, isTenpai: true,
                        initialRemainingTiles: initialTotalForSummary, totalAgariTurnSum: currentTurn + pathTurnCount,
                        agariCount: 1, engineLiveWallLimit: liveWallLimit
                    };
                }
            }

            // Discard
            const bestD = findBestDiscard27(hand27, localFixedMentsuArr.length, trialCounts, rng, tenpaiDepth);
            if (bestD !== -1) {
                hand27[bestD]--;
                const t34 = toStandardTile(bestD);
                if (t34 === TILES.p5 && redP5 > 0 && hand27[bestD] < redP5) redP5--;
                else if (t34 === TILES.s5 && redS5 > 0 && hand27[bestD] < redS5) redS5--;

                if (!isRiichi && localFixedMentsuArr.length === 0 && getShantenMemoized(hand27 as any, 0) === 0) {
                    isRiichi = true; isIppatsu = true; scoreAdjustment -= 1000;
                }
            } else { break; }
            isIppatsu = false;
        }

        const isTenpaiResult = getShantenMemoized(hand27 as any, localFixedMentsuArr.length) <= 0;
        return {
            type: 'draw', point: scoreAdjustment + (isTenpaiResult ? 1000 : -1000), isTenpai: isTenpaiResult,
            initialRemainingTiles: initialTotalForSummary, totalAgariTurnSum: 0, agariCount: 0,
            engineLiveWallLimit: liveWallLimit
        };
    };

    const result = executePath();
    return result;
}

export function evaluateWinningHand(
    hand: Tile[],
    config: SimulationConfig
): {
    bestYaku: YakuResult;
    bestScore: ScoreResult;
    bestStructure: HandStructure;
    allPatterns: { yaku: YakuResult; score: ScoreResult; structure: HandStructure }[];
} | null {
    const isHaitei = (config.currentTurn || 0) >= 18;

    const state: GameState = {
        bakaze: TILES.z1, jikaze: config.isDealer ? TILES.z1 : TILES.z2,
        isRiichi: false, isDoubleRiichi: false, isIppatsu: false, isTsumo: true,
        isRinshan: false, isChankan: false, isHaitei, isHoutei: false,
        kitaCount: config.myKita, doraCount: countDora(hand, config.doraIndicators, [], config.myKita),
        uraDoraCount: 0, winningTile: hand[hand.length - 1], isDealer: config.isDealer,
        turnCount: config.currentTurn, hasCallOccurred: config.myKita > 0 || config.fixedMentsu.some(m => m.isOpen || m.isKan),
        discardCount: config.myDiscards.length
    };

    const patterns = getAgariPatterns(hand, config.fixedMentsu || []);
    if (patterns.length === 0) return null;

    const evaluated = patterns.map(structure => {
        const result = calculateScore(hand, structure, state);
        if (!validateAgari(result)) return null;
        return { yaku: result, score: calculatePoints(result, config.isDealer, true), structure };
    }).filter(p => p !== null) as { yaku: YakuResult, score: ScoreResult, structure: HandStructure }[];

    if (evaluated.length === 0) return null;

    // Sort by TOTAL SCORE (descending) to maximize points
    const sorted = [...evaluated].sort((a, b) => b.score.total - a.score.total);

    if (DEBUG_LOG && sorted.length > 0) {
        const best = sorted[0];
        console.log("--- Agari Evaluation Debug ---");
        console.log({
            totalHan: best.yaku.han,
            baseHan: best.yaku.yakuList.filter(y => !y.isDora).reduce((s, y) => s + y.han, 0),
            doraCount: state.doraCount,
            nukiDoraCount: state.kitaCount,
            yakuList: best.yaku.yakuList.map(y => `${y.name} (${y.han})`),
            isTsumo: state.isTsumo,
            isHaitei: state.isHaitei,
            turnCount: state.turnCount
        });
        console.log("-------------------------------");
    }

    return { bestYaku: sorted[0].yaku, bestScore: sorted[0].score, bestStructure: sorted[0].structure, allPatterns: sorted };
}

export function countDora(hand: Tile[], doraInds: Tile[], fixedMentsu: Mentsu[] = [], kitaCount: number = 0): number {
    let count = 0; // 初期値は 0 (kitaCount は最後に外部で合算されるか、西表示牌時のみ加算)

    for (const ind of doraInds) {
        const doraValue = getDoraValue(ind);

        // 北抜き牌が表示牌によってドラになった場合
        if (doraValue === TILES.z4) {
            count += kitaCount;
        }

        // 手牌内の通常ドラ
        for (const t of hand) {
            if (toNormalFive(t) === doraValue) count++;
        }

        // 副露内の通常ドラ
        for (const m of fixedMentsu) {
            for (const t of m.tiles) {
                if (toNormalFive(t) === doraValue) count++;
            }
        }
    }

    // 赤ドラ
    for (const t of hand) {
        if (isRedFive(t)) count++;
    }
    for (const m of fixedMentsu) {
        for (const t of m.tiles) {
            if (isRedFive(t)) count++;
        }
    }

    return count;
}
