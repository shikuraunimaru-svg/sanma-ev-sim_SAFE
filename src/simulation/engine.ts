import { TILES, toNormalFive, isRedFive, tileToString, toSanmaTile as toSanmaTileCore, toStandardTile as toStandardTileCore } from '../core/tile';
export { TILES };
export const toSanmaTile = toSanmaTileCore;
export const toStandardTile = toStandardTileCore;
import type { Tile } from '../core/tile';
import { calculateShanten27, getAgariPatterns, getShantenBreakdown27, suitCacheHit, suitCacheMiss, solveSuitCallCount, suitCache, resetSuitStats, packCounts27, shantenCache } from '../core/shanten';
export { getShantenBreakdown27 };
import type { Mentsu, HandStructure } from '../core/shanten';
import { calculateScore } from '../core/yaku';
import type { GameState, YakuResult } from '../core/yaku';
export type { GameState, YakuResult };
import { calculatePoints } from '../core/score';
import type { ScoreResult } from '../core/score';
import { logImportant, logDebug, logVerbose } from '../utils/logger';

export const ENABLE_STATE_CACHE = false;

export const agariCache = new Map<string, HandStructure[]>();

export function clearAgariCache() {
    // No-op to preserve cache between simulations for better performance
}

export function makeHandKey(hand: Tile[], mentsu: Mentsu[]): string {
    const h = hand.map(t => toNormalFive(t)).sort((a, b) => a - b).join(',');
    if (!mentsu || mentsu.length === 0) return h;
    const m = mentsu.map(m => m.tiles.map(t => toNormalFive(t)).sort((a, b) => a - b).join('-')).sort().join('|');
    return `${h}|${m}`;
}

export function getAgariPatternsCached(hand: Tile[], mentsu: Mentsu[], h27: Int8Array | number[] | Uint8Array): HandStructure[] {
    if (calculateShanten27(h27 as any, mentsu.length) > 0) return [];
    const key = makeHandKey(hand, mentsu);
    let cached = agariCache.get(key);
    if (!cached) {
        cached = getAgariPatterns(hand, mentsu);
        agariCache.set(key, cached);
        if (agariCache.size > 50000) agariCache.clear();
    }
    return cached;
}

export const DEBUG = {
    actionGen: false,
    ukeire: false,
    wall: false,
    performance: true,
    tenpai: false
};

// =========================================================
// Evaluation Constants
// =========================================================
const SHANTEN_SCORE_TABLE = [
    140, // 0シャンテン (テンパイ)
    50,  // 1シャンテン
    22,  // 2シャンテン
    10,  // 3シャンテン
    6    // 4シャンテン以上
];
const SHANTEN_MULTIPLIER = [2.7, 1.8, 1.3, 1.0, 1.0];

// =========================================================
// Tile Count System (29 Types)
// =========================================================
export const TILE_TYPES: Tile[] = [
    TILES.m1, TILES.m9,
    TILES.p1, TILES.p2, TILES.p3, TILES.p4, TILES.p5, TILES.p6, TILES.p7, TILES.p8, TILES.p9,
    TILES.s1, TILES.s2, TILES.s3, TILES.s4, TILES.s5, TILES.s6, TILES.s7, TILES.s8, TILES.s9,
    TILES.z1, TILES.z2, TILES.z3, TILES.z4, TILES.z5, TILES.z6, TILES.z7,
    TILES.p5r, TILES.s5r
];

export function getInitialCounts(): Int8Array {
    const counts = new Int8Array(TILE_TYPES.length);
    for (let i = 0; i < TILE_TYPES.length; i++) {
        const t = TILE_TYPES[i];
        if (isRedFive(t)) {
            counts[i] = 1;
        } else if (toNormalFive(t) === t && (t === TILES.p5 || t === TILES.s5)) {
            counts[i] = 3;
        } else {
            counts[i] = 4;
        }
    }
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



// =========================================================
// Phase71: Fast Win Evaluation (Monte Carlo dedicated)
// 配列・オブジェクト生成なし。翻数→符→点数を直接計算。
// isDealer=true, isTsumo=true の Monte Carlo ツモ専用。
// =========================================================

// サンマ用 fast 符計算（オブジェクト非生成版）
function calcFuFast(structure: HandStructure, winTile: Tile): number {
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
): { score: number; han: number; fu: number; pinfu: boolean } {
    scoreFastCalls++;
    const isMenzen = !structure.mentsu.some(m => m.isOpen);
    const s = structure;

    // ---------- 役満判定 ----------
    let yakumanMult = 0;

    // 清老頭: 全て端牌
    const fullLen = (s.head !== -1 ? 2 : 0) + s.mentsu.reduce((a, m) => a + m.tiles.length, 0);
    if (fullLen > 0) {
        let isChinroutou = true;
        for (let i = 0; i < hand.length; i++) {
            const t = toNormalFive(hand[i]);
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
        if (toNormalFive(hand[i]) < 27) { isTsuiisou = false; break; }
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
        return { score: calcPointsFast(0, 0, true, yakumanMult, state.isDealer ?? true), han: 13 * yakumanMult, fu: 0, pinfu: false };
    }

    // ---------- 通常役判定（han 加算のみ） ----------
    let han = 0;
    let hasPinfu = false;

    if (isMenzen) {
        if (state.isDoubleRiichi) han += 2;
        else if (state.isRiichi) han += 1;

        if (state.isIppatsu) {
            han += 1;
        }
        if (state.isTsumo) han += 1; // 門清ツモ
    }
    if (state.isHaitei && state.isTsumo) {
        han += 1;
    }

    // タンヤオ
    let isTanyao = hand.length > 0;
    for (let i = 0; i < hand.length; i++) {
        const t = toNormalFive(hand[i]);
        if (t === 0 || t === 8 || t === 9 || t === 17 || t === 18 || t === 26 || t >= 27) {
            isTanyao = false; break;
        }
    }
    if (isTanyao) han += 1;

    // 一色手
    let hasHonor = false; let suitBits = 0;
    for (let i = 0; i < hand.length; i++) {
        const t = toNormalFive(hand[i]);
        if (t >= 27) { hasHonor = true; }
        else if (t <= 8) suitBits |= 1;
        else if (t <= 17) suitBits |= 2;
        else suitBits |= 4;
    }
    const suitCount = (suitBits !== 0 ? ((suitBits & 1) + ((suitBits >> 1) & 1) + ((suitBits >> 2) & 1)) : 0);
    if (!hasHonor && suitCount === 1) han += isMenzen ? 6 : 5; // 清一色
    else if (hasHonor && suitCount === 1) han += isMenzen ? 3 : 2; // 混一色

    const isChiitoi = s.mentsu.length === 6 && s.mentsu.every(m => m.type === 'pair');

    if (isChiitoi) {
        // 七対子
        han += 2;
        // ドラ加算
        han += state.doraCount;
        han += state.uraDoraCount;
        han += state.kitaCount;
        if (han <= 0) return { score: 0, han: 0, fu: 0, pinfu: false }; // 役なし
        const fu = 25;
        return { score: calcPointsFast(han, fu, false, 1, state.isDealer ?? true), han, fu, pinfu: false };
    }

    if (s.head === -1) {
        // 国士など、その他の特殊形
        han += state.doraCount;
        han += state.uraDoraCount;
        han += state.kitaCount;
        if (han <= 0) return { score: 0, han: 0, fu: 0, pinfu: false }; // 役なし
        const fu = 25;
        return { score: calcPointsFast(han, fu, false, 1, state.isDealer ?? true), han, fu, pinfu: false };
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
                if (pos === 1) continue; // kanchan: skip and check other mentsu
                let sn = m.tile;
                if (sn >= 9 && sn <= 17) sn -= 8; else if (sn >= 18 && sn <= 26) sn -= 17; else sn += 1;
                if ((sn === 1 && pos === 2) || (sn === 7 && pos === 0)) continue; // penchan: skip and check other mentsu
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
    if (DEBUG.ukeire && han >= 8) {
        logVerbose("HAN_DEBUG", {
            han,
            fu: hasPinfu ? 20 : calcFuFast(structure, state.winningTile ?? -1),
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

    if (han <= 0) return { score: 0, han: 0, fu: 0, pinfu: false }; // 役なし

    const fu = hasPinfu ? 20 : calcFuFast(structure, state.winningTile ?? -1);
    const finalScore = calcPointsFast(han, fu, false, 1, state.isDealer ?? true);

    return { score: finalScore, han, fu, pinfu: hasPinfu };
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
    | { type: 'ankan', tile: Tile }
    | { type: 'ankanRiichi', tile: Tile }
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
    useLookahead?: boolean;

    validationMode?: boolean;
};

// =========================================================
// Phase 77: Pinzu/Souzu Symmetry Transformation
// =========================================================

export function swapPinSou(tile: Tile): Tile {
    if (tile >= 9 && tile <= 17) return (tile + 9) as Tile;   // 1p-9p (9-17) -> 1s-9s (18-26)
    if (tile >= 18 && tile <= 26) return (tile - 9) as Tile;  // 1s-9s (18-26) -> 1p-9p (9-17)
    if (tile === TILES.p5r) return TILES.s5r as Tile;         // red 5p (34) -> red 5s (35)
    if (tile === TILES.s5r) return TILES.p5r as Tile;         // red 5s (35) -> red 5p (34)
    return tile;                                              // m, z remain unchanged
}

export function swapTileArray(arr: Tile[]): Tile[] {
    return arr.map(swapPinSou);
}

export function swapSimulationConfig(config: SimulationConfig): SimulationConfig {
    return {
        ...config,
        myHand: swapTileArray(config.myHand || []),
        fixedMentsu: (config.fixedMentsu || []).map(m => ({
            ...m,
            tile: swapPinSou(m.tile),
            tiles: swapTileArray(m.tiles)
        })),
        otherOpenMelds: config.otherOpenMelds ? config.otherOpenMelds.map(m => ({
            ...m,
            tile: swapPinSou(m.tile),
            tiles: swapTileArray(m.tiles)
        })) : undefined,
        myDiscards: swapTileArray(config.myDiscards || []),
        doraIndicators: swapTileArray(config.doraIndicators || [])
    };
}

export function swapAction(action: Action): Action {
    switch (action.type) {
        case 'discard':
            return { ...action, tile: swapPinSou(action.tile) };
        case 'ankan':
        case 'ankanRiichi':
        case 'kakan':
            return { ...action, tile: swapPinSou(action.tile) };
        default:
            return { ...action };
    }
}


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
    const displayRemainingTiles = Math.max(0, remainingTiles);
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
    tenpaiBy10Rate?: number;
    tenpaiWithin3Rate?: number;
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
    avgWinPoint?: number;
    layerA_totalScore: number;
    layerB_totalScore: number;
    layerA_trials: number;
    layerB_trials: number;
    stdError: number;
    confidence95: number;
    m2: number;
    ciLower: number;
    ciUpper: number;
    effectiveTileTypes: number;
    effectiveTileCount: number;
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
    finalShanten: number;
    initialRemainingTiles: number;
    totalAgariTurnSum: number;
    agariCount: number;
    engineLiveWallLimit: number;
    win?: boolean;
    score?: number;
    endReason?: string;
    firstTenpaiTurn?: number;
};

export let fullEvalCount = 0; // Phase71: win 判定（patterns.length > 0）カウンタ



export function shuffleInPlace(arr: Uint8Array, len: number) {
    for (let i = len - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
}

export let cacheHits = 0;
export let cacheMisses = 0;
export let shantenCacheHits = 0;
export let shantenCacheMisses = 0;

export let shantenCalls = 0;
export let shantenTotalTime = 0;
export let agariCalls = 0;
export let agariTotalTime = 0;
export let scoreFastCalls = 0;
export let scoreFastTotalTime = 0;

// Phase 74: State Cache (局面キャッシュ)
// キー: 手牌のハッシュ (number), 値: シミュレーション結果の EV (number)
export const stateCache = new Map<string, number>();
const STATE_CACHE_LIMIT = 200000;

/**
 * 手牌 (Tile[]) のハッシュ値を計算して数値で返す。
 */
export function simpleHashHand(hand: Tile[]): number {
    let hash = 0;
    // 手牌はソートされている前提（または正規化が必要）だが、
    // シミュレータの discard 後の手牌は順序が固定的なのでそのまま使用。
    for (let i = 0; i < hand.length; i++) {
        hash = ((hash << 5) - hash) + hand[i];
        hash |= 0;
    }
    return (hash >>> 0);
}

/**
 * シミュレーション結果をキャッシュに保存する。
 * 制限数を超えた場合はクリアする。
 */
export function saveStateCache(key: string, ev: number) {
    if (ENABLE_STATE_CACHE) {
        if (stateCache.size >= STATE_CACHE_LIMIT) {
            stateCache.clear();
        }
        stateCache.set(key, ev);
    }
}

export function logPerformanceStats() {
    const totalCache = cacheHits + cacheMisses;
    const hitRate = totalCache > 0 ? ((cacheHits / totalCache) * 100).toFixed(1) : "0.0";

    logImportant("---- Simulation End Reasons ----");
    logImportant("win:", simStats.win);
    logImportant("ryukyoku:", simStats.ryukyoku);
    logImportant("tenpaiStop:", simStats.tenpaiStop);
    logImportant("wallExhaust:", simStats.wallExhaust);
    logImportant("--------------------------------");

    logImportant("--- Performance Stats ---");
    if (ENABLE_STATE_CACHE) {
        logImportant(`stateCache size: ${stateCache.size}`);
        logImportant(`cacheHits: ${cacheHits}`);
        logImportant(`cacheMisses: ${cacheMisses}`);
        logImportant(`cacheHitRate: ${hitRate} %`);
        logImportant("");
    }
    const totalShantenCache = shantenCacheHits + shantenCacheMisses;
    const shantenHitRate = totalShantenCache > 0 ? ((shantenCacheHits / totalShantenCache) * 100).toFixed(1) : "0.0";

    logImportant(`shantenCache size: ${shantenCache.size}`);
    logImportant(`shantenCacheHits: ${shantenCacheHits}`);
    logImportant(`shantenCacheMisses: ${shantenCacheMisses}`);
    logImportant(`shantenCacheHitRate: ${shantenHitRate} %`);
    logImportant(`calculateShanten calls: ${shantenCalls}`);
    const shantenTotal = shantenCacheHits + shantenCacheMisses;
    const shantenRate = shantenTotal > 0 ? (shantenCacheHits / shantenTotal) * 100 : 0;
    logImportant(`shantenCacheHitRate: ${shantenRate.toFixed(1)} %`);
    logImportant(`calculateShanten totalTime: ${shantenTotalTime.toFixed(2)} ms`);
    logImportant("");
    
    // --- Phase 2 Suit Cache Stats ---
    const totalSuitCache = suitCacheHit + suitCacheMiss;
    const suitHitRate = totalSuitCache > 0 ? (suitCacheHit / totalSuitCache) * 100 : 0;
    logImportant(`suitCache size: ${suitCache.size}`);
    logImportant(`suitCacheHits: ${suitCacheHit}`);
    logImportant(`suitCacheMisses: ${suitCacheMiss}`);
    logImportant(`suitCacheHitRate: ${suitHitRate.toFixed(1)} %`);
    logImportant(`solveSuitCallCount: ${solveSuitCallCount}`);
    logImportant("");
    logImportant(`getAgariPatterns calls: ${agariCalls}`);
    logImportant(`getAgariPatterns totalTime: ${agariTotalTime.toFixed(2)} ms`);
    logImportant("");
    logImportant(`scoreWinningHandFast calls: ${scoreFastCalls}`);
    logImportant(`scoreWinningHandFast totalTime: ${scoreFastTotalTime.toFixed(2)} ms`);
    logDebug(`WallPool size: ${WALL_POOL_SIZE}`);
    logImportant("-------------------------");
}

export function resetPerformanceStats() {
    console.log("RESET_PERF_STATS CALLED");
    cacheHits = 0;
    cacheMisses = 0;
    shantenCacheHits = 0;
    shantenCacheMisses = 0;
    shantenCalls = 0;
    shantenTotalTime = 0;
    agariCalls = 0;
    agariTotalTime = 0;
    scoreFastCalls = 0;
    scoreFastTotalTime = 0;
    resetSuitStats();  // Core/shanten stats

    simStats.win = 0;
    simStats.ryukyoku = 0;
    simStats.tenpaiStop = 0;
    simStats.wallExhaust = 0;
}

export function resetDebugCounters() {
    fullEvalCount = 0; // Phase71 カウンタもリセット
    resetPerformanceStats();
}

// Phase 76: Wall Pool (壁の事前生成)
export const WALL_POOL_SIZE = 2048;
export let wallPool: Uint8Array[] = [];
export let reverseWallPool: Uint8Array[] = [];

// Phase 77: Swapped Wall Pool (対称シミュレーション用事前生成)
export let swappedWallPool: Uint8Array[] = [];
export let swappedReverseWallPool: Uint8Array[] = [];

/**
 * テンプレートを 512 回シャッフルして Wall Pool を生成する。
 */
export function initWallPool(template: Uint8Array) {
    wallPool.length = 0;
    reverseWallPool.length = 0;
    swappedWallPool.length = 0;
    swappedReverseWallPool.length = 0;

    for (let i = 0; i < WALL_POOL_SIZE; i++) {
        const w = new Uint8Array(template);
        shuffleInPlace(w, w.length);
        wallPool.push(w);

        // Antithetic Sampling 用に反転させた壁も事前生成しておく
        const rw = new Uint8Array(w).reverse();
        reverseWallPool.push(rw);

        // Symmetric Simulation 用の壁を生成
        const sw = new Uint8Array(w.length);
        for (let j = 0; j < w.length; j++) {
            sw[j] = swapPinSou(w[j]);
        }
        swappedWallPool.push(sw);

        const srw = new Uint8Array(rw.length);
        for (let j = 0; j < rw.length; j++) {
            srw[j] = swapPinSou(rw[j]);
        }
        swappedReverseWallPool.push(srw);
    }
    if (DEBUG.performance) {
        logDebug("WallPool size:", wallPool.length);
        logDebug("ReverseWallPool size:", reverseWallPool.length);
    }
}

// --- Shanten Memoization ---
export function initShantenCache() {}
export function clearShantenCache() {}
export function getShantenCacheStats() { return { hit: shantenCacheHits, miss: shantenCacheMisses }; }

export function getShanten(counts27: Int8Array | Int32Array | number[] | Uint8Array, fixedMentsuCount: number = 0): number {
    shantenCalls++;
    const key = packCounts27(counts27, fixedMentsuCount);
    const cached = shantenCache.get(key);
    if (cached !== undefined) {
        shantenCacheHits++;
        return cached;
    }
    
    shantenCacheMisses++;
    const t0 = performance.now();
    const result = calculateShanten27(counts27 as any, fixedMentsuCount);
    shantenTotalTime += (performance.now() - t0);
    return result;
}

export const calculateShantenCached = getShanten;
export const calculateShantenWith27 = getShanten;
export const getShantenMemoized = getShanten;

export function calculateShanten(hand: Tile[] | number[], fixedMentsuLength: number = 0): number {
    const hand27 = new Int8Array(27);
    for (let i = 0; i < hand.length; i++) {
        const t = hand[i];
        if (typeof t === 'number') {
            hand27[t]++;
        } else {
            const tile = t as any;
            if (tile.type === 'm') {
                hand27[tile.n - 1]++;
            } else if (tile.type === 'p') {
                hand27[tile.n + 8]++;
            } else if (tile.type === 's') {
                hand27[tile.n + 17]++;
            }
        }
    }
    return getShanten(hand27, fixedMentsuLength);
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

// =========================================================
// Phase 2: Effective Ukeire Weighting (Progress Evaluation)
// =========================================================

function formsMultiBlockExpansion(tile27: number, counts: Int8Array | number[]): boolean {
    const normTile = toStandardTile(tile27);
    const type = Math.floor(normTile / 9);
    if (type >= 3) return false;

    let mentsuCandidates = 0;

    for (let i = -2; i <= 0; i++) {
        const aNum = (normTile % 9) + 1 + i;
        const cNum = aNum + 2;

        if (aNum < 1 || cNum > 9) continue;
        
        const aT27 = toSanmaTile(normTile + i);
        const bT27 = toSanmaTile(normTile + i + 1);
        
        if (aT27 !== -1 && bT27 !== -1 && counts[aT27] > 0 && counts[bT27] > 0) {
            mentsuCandidates++;
        }
    }

    return mentsuCandidates >= 2;
}

export function evaluateShapeProgress(beforeHand: Int8Array | number[], drawT27: number, doraSet: Set<number>, isRed: boolean): number {
    const c = beforeHand[drawT27];
    const normTile = toStandardTile(drawT27);
    const type = Math.floor(normTile / 9); // 0=m, 1=p, 2=s, 3=z
    const num = (type < 3) ? (normTile % 9) + 1 : 0;

    let w = 0;

    const B = (delta: number) => {
        if (type === 3) return 0;
        const n = num + delta;
        if (n < 1 || n > 9) return 0;
        const target = toSanmaTile(normTile + delta);
        if (target === -1) return 0;
        return beforeHand[target];
    };

    if (c === 0) {
        if (type < 3) {
            const left1 = B(-1), left2 = B(-2), left3 = B(-3);
            const right1 = B(1), right2 = B(2), right3 = B(3);

            if (left1 > 0 && left2 > 0) {
                if (left3 > 0) {
                    if (num === 4 || num === 9) w = Math.max(w, 2);
                    else if (num === 5 || num === 8) w = Math.max(w, 3);
                    else w = Math.max(w, 4);
                } else {
                    w = Math.max(w, 8);
                }
            }
            if (right1 > 0 && right2 > 0) {
                if (right3 > 0) {
                    if (num === 1 || num === 6) w = Math.max(w, 2);
                    else if (num === 2 || num === 5) w = Math.max(w, 3);
                    else w = Math.max(w, 4);
                } else {
                    w = Math.max(w, 8);
                }
            }
            if (left1 > 0 && right1 > 0) {
                w = Math.max(w, 8);
            }

            const isPenchanLeft = (num === 3);
            const isPenchanRight = (num === 7);

            if (left1 === 1) w = Math.max(w, isPenchanLeft ? 2 : 5);
            if (left1 >= 2) w = Math.max(w, isPenchanLeft ? 3 : 4);

            if (right1 === 1) w = Math.max(w, isPenchanRight ? 2 : 5);
            if (right1 >= 2) w = Math.max(w, isPenchanRight ? 3 : 4);

            if (left2 === 1) w = Math.max(w, 2);
            if (left2 >= 2) w = Math.max(w, 3);

            if (right2 === 1) w = Math.max(w, 2);
            if (right2 >= 2) w = Math.max(w, 3);

            if (left1 > 0 && left3 > 0) w = Math.max(w, 4);
            if (right1 > 0 && right3 > 0) w = Math.max(w, 4);

            if (num === 4 && left2 > 0 && left3 > 0) w = Math.max(w, 1);
            if (num === 6 && right2 > 0 && right3 > 0) w = Math.max(w, 1);
        }

        // 孤立牌判定 (c === 0 は新しく引いた単独の牌)と連鎖連動チェック
        const isIsolated = (c === 0);
        if (isIsolated) {
            beforeHand[drawT27]++;
            if (formsMultiBlockExpansion(drawT27, beforeHand)) {
                w += 8;
            }
            beforeHand[drawT27]--;
        }


    } else if (c === 1) {
        w = Math.max(w, 2);

        const isYakuhai = (type === 3 && (num === 1 || num === 5 || num === 6 || num === 7));
        const isDoubleEast = (type === 3 && num === 1);
        const isDora = doraSet.has(drawT27);

        if (isYakuhai) {
            if (isDora) w = Math.max(w, 8);
            else if (isDoubleEast) w = Math.max(w, 4);
            else w = Math.max(w, 2);
        } else if (isDora && (type === 3 || type === 0)) {
            w = Math.max(w, 4);
        } else if (isDora && type < 3) {
            w = Math.max(w, 4);
        }

        if (type < 3) {
            const left1 = B(-1), right1 = B(1);
            const left2 = B(-2), right2 = B(2);

            const isPenchanLeft = (num === 3);
            const isPenchanRight = (num === 7);

            if ((left1 > 0 && !isPenchanLeft) || (right1 > 0 && !isPenchanRight)) w = Math.max(w, 2);
            if ((left1 > 0 && isPenchanLeft) || (right1 > 0 && isPenchanRight) || left2 > 0 || right2 > 0) w = Math.max(w, 3);

            if (left1 > 0 && right1 > 0) {
                if (num === 2 || num === 8) w = Math.max(w, 0);
                else w = Math.max(w, 3);
            }

            if (left1 > 0 && left2 > 0) {
                if (num === 3 || num === 7) w = Math.max(w, 0);
                else w = Math.max(w, 1);
            }
            if (right1 > 0 && right2 > 0) {
                if (num === 3 || num === 7) w = Math.max(w, 0);
                else w = Math.max(w, 1);
            }
        }
    } else if (c === 2) {
        w = Math.max(w, 8);
    } else if (c === 3) {
        w = Math.max(w, 1);
    }

    if (type < 3) {
        if (B(-1) >= 3 || B(1) >= 3) w = Math.max(w, 1);
    }

    let doraBonus = 0;
    const isDora = doraSet.has(drawT27);
    if (isRed) {
        doraBonus += 4;
    } else if (isDora) {
        if (type === 3 || type === 0) doraBonus += 1;
        else if (num >= 3 && num <= 7) doraBonus += 4;
        else if (num === 2 || num === 8) doraBonus += 3;
        else if (num === 1 || num === 9) doraBonus += 2;
    }

    return w + doraBonus;
}

export const TURN_FACTOR = [
    1.0, 1.0, 1.0, 1.0, 1.0,
    0.98,
    0.95,
    0.90,
    0.82,
    0.72,
    0.62,
    0.53,
    0.45,
    0.38,
    0.32,
    0.27,
    0.23
];

// =========================================================
// Phase 78: Pseudo 2-Step Lookahead Evaluation (初手専用)
// =========================================================

export function getTopDiscardsForLookahead(
    hand27: Int8Array | number[],
    fixedMentsuCount: number
): number[] {
    const candidates: { tile: number; score: number }[] = [];

    const evalLight = (h27: Int8Array | number[], s: number) => {
        let score = (8 - s) * 1000;
        for (let i = 0; i < 27; i++) {
            if (h27[i] >= 2) score += 5;
        }
        for (const [start, end] of [[2, 10], [11, 19]]) {
            for (let i = start; i < end; i++) {
                if (h27[i] > 0 && h27[i + 1] > 0) score += 8;
            }
            for (let i = start; i < end - 1; i++) {
                if (h27[i] > 0 && h27[i + 2] > 0) score += 3;
            }
        }
        return score;
    };

    for (let i = 0; i < 27; i++) {
        if (hand27[i] > 0) {
            hand27[i]--;
            const shanten = calculateShantenCached(hand27 as any, fixedMentsuCount);
            const score = evalLight(hand27, shanten);
            candidates.push({ tile: i, score });
            hand27[i]++;
        }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 3).map(c => c.tile);
}

export function evaluateWithLookahead(
    initialHand27: Int8Array | number[],
    discardTile27: number,
    config: SimulationConfig,
    invisibleCounts29: Int8Array | number[],
    doraIndicators: Tile[],
    myKita: number,
    otherKita: number,
    rng: SimpleRNG,
    liveWallLimit: number,
    wallPool: Uint8Array[]
): number {
    const hand27 = new Int8Array(initialHand27);
    hand27[discardTile27]--; // 初手の打牌を適用

    const currentShanten = calculateShantenCached(hand27 as any, config.fixedMentsu.length);
    const currentUkeire = getUkeireInfo27(hand27, config.fixedMentsu.length, invisibleCounts29).tileCount;

    const effectiveTiles: { drawT34Index: number; drawT27: number; weight: number }[] = [];
    let baseWeight = 0;

    for (let t = 0; t < 29; t++) {
        const count = invisibleCounts29[t];
        if (count <= 0) continue;
        
        const drawT27 = toSanmaTile(toNormalFive(TILE_TYPES[t]));
        if (drawT27 === -1) continue;

        if (effectiveTiles.some(e => e.drawT34Index === t)) {
            continue;
        }

        hand27[drawT27]++;
        const newShanten = calculateShantenCached(hand27 as any, config.fixedMentsu.length);
        const newUkeire = getUkeireInfo27(hand27, config.fixedMentsu.length, invisibleCounts29).tileCount;
        hand27[drawT27]--;

        let isEffective = false;
        if (currentShanten === 0) {
            if (newShanten === -1) isEffective = true; // テンパイ時は実際に和了できるか
        } else {
            // シャンテン悪化しない OR 有効牌枚数が増大
            if (newShanten <= currentShanten || newUkeire > currentUkeire) isEffective = true;
        }

        if (isEffective) {
            effectiveTiles.push({ drawT34Index: t, drawT27, weight: count });
            baseWeight += count;
        }
    }

    effectiveTiles.sort((a, b) => b.weight - a.weight);
    const topEffectiveTiles = effectiveTiles.slice(0, 10);
    
    let totalWeight = 0;
    for (const et of topEffectiveTiles) totalWeight += et.weight;

    if (totalWeight === 0) return 0; // 有効牌なし

    let totalEV = 0;
    const LOOKAHEAD_ROLLOUTS = 40;

    const workTemplateCounts = new Int8Array(29);
    const workTrialCounts = new Int8Array(29);
    const workHand27 = new Int8Array(27);
    const workUraCounts = new Int8Array(29);

    for (const et of topEffectiveTiles) {
        hand27[et.drawT27]++; // ツモを適用
        
        for (let i = 0; i < 29; i++) workTemplateCounts[i] = invisibleCounts29[i];
        workTemplateCounts[et.drawT34Index]--;

        const nextDiscards = getTopDiscardsForLookahead(hand27, config.fixedMentsu.length);
        const nextEVs: number[] = [];

        // 次打牌候補についてロールアウト
        for (const nextDiscard of nextDiscards) {
            let evalSum = 0;
            const reconstructHand = (): Tile[] => {
                const res: Tile[] = [];
                for (let i = 0; i < 27; i++) {
                    const cnt = hand27[i];
                    const t34 = toStandardTile(i);
                    for (let j = 0; j < cnt; j++) res.push(t34);
                }
                return res;
            };

            const stateHand = reconstructHand();
            const action: Action = { type: 'discard', tile: toStandardTile(nextDiscard), tileInd: 0, riichi: false };
            const nShanten = calculateShantenCached(hand27 as any, config.fixedMentsu.length);

            // ロールアウト実行
            for (let r = 0; r < LOOKAHEAD_ROLLOUTS; r++) {
                workHand27.fill(0); workTrialCounts.fill(0); workUraCounts.fill(0);
                const res = runSinglePath(
                    stateHand, config.fixedMentsu, action, myKita, otherKita, doraIndicators,
                    (config.currentTurn || 0) + 1, !!config.isDealer,
                    wallPool[r % wallPool.length], 108, liveWallLimit, liveWallLimit,
                    workTemplateCounts, workTrialCounts, workHand27, workUraCounts,
                    rng.next() * 1000000 >>> 0, nShanten, (config.currentTurn || 0) + 1, 9999
                );
                evalSum += res.point;
            }

            const avgEV = evalSum / LOOKAHEAD_ROLLOUTS;
            nextEVs.push(avgEV);
        }

        // 降順ソート
        nextEVs.sort((a, b) => b - a);

        // 上位2件を取得（存在しない場合のフォールバックあり）
        const top1 = nextEVs[0];
        const top2 = nextEVs.length > 1 ? nextEVs[1] : nextEVs[0];

        // 重み付き平均（top1を優先）
        const WEIGHT_TOP1 = 0.7;
        const WEIGHT_TOP2 = 0.3;

        const bestNextEV = WEIGHT_TOP1 * top1 + WEIGHT_TOP2 * top2;

        logDebug("LOOKAHEAD_WEIGHTED_EV", {
            candidates: nextEVs,
            top1,
            top2,
            weightedEV: bestNextEV
        });
        
        hand27[et.drawT27]--; // ツモを取り消し
        
        if (bestNextEV > -Infinity) {
            totalEV += bestNextEV * et.weight;
        }
    }

    return totalEV / totalWeight;
}



/**
 * Pure function to find the best discard from a 27-count hand.
 * Returns the index (0-26) or -1 if no discards possible.
 */
export function findBestDiscard27(
    hand27: Int8Array | number[],
    fixedMentsuCount: number,
    invisibleCounts29: Int8Array | number[],
    doraIndicators: Tile[],
    rng?: SimpleRNG,
    tenpaiDepth: number = 0,
    _depth: number = 0,
    turn: number = 1,
    debugTrialIndex: number = 9999
): number {
    const turnFactor = TURN_FACTOR[Math.min(Math.max(0, turn - 1), 16)] || 1.0;
    const doraSet = new Set<number>();
    for (const ind of doraIndicators) {
        const d = getDoraValue(ind);
        const sIdx = toSanmaTile(d);
        if (sIdx !== -1) doraSet.add(sIdx);
    }

    // If tenpaiDepth >= 2, we are in a re-tenpai situation where we must not drop shanten back to 1.
    const currentShanten = calculateShantenCached(hand27 as any, fixedMentsuCount);
    const forceMaintainTenpai = (tenpaiDepth >= 2 && currentShanten === 0);

    // Pre-calculate sanmaRemaining derived from invisibleCounts29 to handle red fives correctly
    const sanmaRemaining = new Int8Array(27);
    for (let t = 0; t < 29; t++) {
        const count = invisibleCounts29[t];
        if (count <= 0) continue;
        const norm = toSanmaTile(toNormalFive(TILE_TYPES[t]));
        if (norm !== -1) sanmaRemaining[norm] += count; // correctly aliases red fives into the base number
    }

    type DiscardCandidate = {
        tile: number;
        shanten: number;
        ukeire: number;
        score: number;
        ev: number;
    };

    const candidates: DiscardCandidate[] = [];

    // Helper: evaluates hand score instantly based on current shanten and pure shape heuristics.
    function evaluateHandScore(h27: Int8Array | number[], s: number): number {
        let shapeScore = 0;

        // Pairs (Toitsu)
        for (let i = 0; i < 27; i++) {
            if (h27[i] >= 2) shapeScore += 5;
        }

        // Shapes for Pinzu (2 to 10) and Souzu (11 to 19)
        const suits = [[2, 10], [11, 19]];
        for (const [start, end] of suits) {
            // Ryanmen and Penchan
            for (let i = start; i < end; i++) {
                if (h27[i] > 0 && h27[i + 1] > 0) { // Sequential
                    if (i === start || i + 1 === end) {
                        shapeScore += 1; // Penchan (12 or 89)
                    } else {
                        shapeScore += 8; // Ryanmen
                    }
                }
            }
            // Kanchan
            for (let i = start; i < end - 1; i++) {
                if (h27[i] > 0 && h27[i + 2] > 0) {
                    shapeScore += 3; // Kanchan (e.g. 13, 46)
                }
            }
        }
        return SHANTEN_SCORE_TABLE[Math.min(s, 4)] + shapeScore; // non-linear evaluation base
    }
    let hasTenpaiCandidate = false;
    let bestEvSoFar = -999999;

    // First Pass: evaluate immediate discards
    for (let i = 0; i < 27; i++) {
        if (hand27[i] === 0) continue;

        hand27[i]--;
        const s = calculateShantenCached(hand27, fixedMentsuCount);
        if (debugTrialIndex < 5) {
            logVerbose("SHANTEN_STATE", {
                shanten: s,
                turn: turn
            });
        }

        // If forcing tenpai maintenance, skip any discard that increases shanten above 0
        if (forceMaintainTenpai && s > 0) {
            hand27[i]++;
            continue;
        }

        if (s === 0) hasTenpaiCandidate = true;

        const baseScore = evaluateHandScore(hand27, s);
        let ev = 0;

        // --- Phase 2: Effective Ukeire Weighting ---
        if (s > 0) {
            if (debugTrialIndex < 3) {
                let effectiveTiles: Tile[] = [];
                let seen = new Set<number>();
                for (let t = 0; t < 29; t++) {
                    if (invisibleCounts29[t] <= 0) continue;
                    const tile29 = TILE_TYPES[t];
                    const drawT27 = toSanmaTile(toNormalFive(tile29));
                    if (drawT27 === -1) continue;
                    if (seen.has(drawT27)) continue;

                    hand27[drawT27]++;
                    const nextS = calculateShantenCached(hand27, fixedMentsuCount);
                    hand27[drawT27]--;

                    if (nextS < s) {
                        seen.add(drawT27);
                        effectiveTiles.push(toNormalFive(tile29));
                    }
                }
                if (DEBUG.ukeire && effectiveTiles.length > 0) {
                    console.log("DEBUG_UKEIRE", {
                        shanten: s,
                        ukeireTiles: effectiveTiles.map(tileToString)
                    });
                }
            }

            let totalProgress = 0;
            for (let t = 0; t < 29; t++) {
                const rem = invisibleCounts29[t];
                if (rem <= 0) continue;

                const tile29 = TILE_TYPES[t];
                const drawT27 = toSanmaTile(toNormalFive(tile29));
                if (drawT27 === -1) continue;

                const isRed = isRedFive(tile29);
                const progressScore = evaluateShapeProgress(hand27, drawT27, doraSet, isRed);
                totalProgress += progressScore * rem;
            }
            // Apply Multiplier corresponding to current Shanten (s).
            ev = totalProgress * SHANTEN_MULTIPLIER[Math.min(s, 4)];
        }

        let finalEv = 0;
        if (s === 0) {
            finalEv = baseScore;
        } else {
            finalEv = (baseScore * turnFactor) + (ev * turnFactor);
        }

        if (finalEv > bestEvSoFar && !hasTenpaiCandidate && ev !== -999999) {
            bestEvSoFar = finalEv;
        }

        candidates.push({
            tile: i,
            shanten: s,
            ukeire: 0, // ukeire logic replaced by Progress Weighting
            score: baseScore,
            ev: finalEv
        });

        hand27[i]++;
    }

    if (candidates.length === 0) return -1;

    // Use pure score (no EV lookahead) if any discard makes us Tenpai immediately, 
    // honoring the rule "テンパイ時は現在のロジック（リーチ判断）を優先し1巡先評価は行わない"
    if (hasTenpaiCandidate) {
        candidates.sort((a, b) => b.score - a.score);
    } else {
        candidates.sort((a, b) => b.ev - a.ev);
    }

    const EPSILON = 0.03;
    const TOP_K = 3;
    const r = rng ? rng.next() : Math.random();

    // ユーザー要求の安全ガードの意図を汲み、選出される candidates に undefined 対策
    if (!candidates || candidates.length === 0) return -1;

    // 追加の安全策: 有効な candidate のみをフィルタ
    const validCandidates = candidates.filter(c => c !== undefined && c.tile !== undefined);
    if (validCandidates.length === 0) return -1;

    if (r < EPSILON) {
        // トップ K 個からランダム選択
        const k = Math.min(TOP_K, validCandidates.length);
        const randomChoice = rng ? rng.next() : Math.random();
        const chosen = validCandidates[Math.floor(randomChoice * k)];
        if (!chosen || chosen.tile === undefined) return -1;
        return chosen.tile;
    } else {
        // 通常の貪欲法 (同スコアの場合はランダム)
        const bestScore = validCandidates[0].score;
        const bests = validCandidates.filter(c => c && c.score === bestScore);
        const randomChoice = rng ? rng.next() : Math.random();
        const chosen = bests.length === 0 ? validCandidates[0] : bests[Math.floor(randomChoice * bests.length)];

        if (debugTrialIndex < 10) {
            console.log("BEST_DISCARD_CHOSEN", {
                tile: tileToString(toStandardTile(chosen.tile)),
                shanten: chosen.shanten,
                ev: chosen.ev.toFixed(2),
                candidatesCount: validCandidates.length
            });
        }

        if (!chosen || chosen.tile === undefined) return -1;
        return chosen.tile;
    }
}

/**
 * Calculates total ukeire (shanten-improving tiles) count from mountain.
 */
export function getUkeireCount27(
    hand27: Int8Array | Int32Array | number[],
    fixedMentsuCount: number,
    invisibleCounts29: Int8Array | number[]
): number {
    return getUkeireInfo27(hand27, fixedMentsuCount, invisibleCounts29).tileCount;
}

/**
 * Calculates ukeire (shanten-improving tiles) info: kinds and total count.
 */
export function getUkeireInfo27(
    hand27: Int8Array | Int32Array | number[],
    fixedMentsuCount: number,
    invisibleCounts27: Int8Array | number[]
): { typeCount: number; tileCount: number } {
    let typeCount = 0;
    let tileCount = 0;
    let currentShanten = getShantenMemoized(hand27 as any, fixedMentsuCount);

    if (currentShanten === -1) return { typeCount: 0, tileCount: 0 };

    // テンパイ（0シャンテン）時の特別処理
    // 和了牌が1枚も存在しない場合、実質的に和了不可能な「空テン」状態であるため
    // テンパイから除外（1シャンテンとして扱う）
    let isRealTenpai = false;
    if (currentShanten === 0) {
        for (let i = 0; i < 27; i++) {
            hand27[i]++;
            if (calculateShantenCached(hand27 as any, fixedMentsuCount) === -1) {
                isRealTenpai = true;
            }
            hand27[i]--;
            if (isRealTenpai) break;
        }
        if (!isRealTenpai) {
            currentShanten = 1; // 空テン除外
        }
    }

    // We only check tiles 0-26 (Sanma tiles)
    for (let t = 0; t < 27; t++) {
        const count = invisibleCounts27[t];
        if (count <= 0) continue;

        hand27[t]++;
        const nextShanten = calculateShantenCached(hand27 as any, fixedMentsuCount);
        
        let isUkeire = false;

        if (currentShanten === 0) {
            // ② テンパイ時: その牌で実際に和了(-1シャンテン)できる場合のみ有効牌
            if (nextShanten === -1) {
                isUkeire = true;
            }
        } else {
            // ① 非テンパイ時: シャンテン数が小さくなる場合
            if (nextShanten < currentShanten) {
                isUkeire = true;
            }
        }

        if (isUkeire) {
            typeCount++;
            tileCount += count;
        }
        hand27[t]--;
    }
    return { typeCount, tileCount };
}

export function simpleHash(arr: Uint8Array, len: number): string {
    let hash = 0;
    for (let i = 0; i < len; i++) {
        hash = ((hash << 5) - hash) + arr[i];
        hash |= 0;
    }
    return (hash >>> 0).toString(16);
}

export function buildStateKey(
    hand: Uint8Array | number[] | Tile[],
    turn: number,
    fixedMentsuLength: number,
    myKita: number,
    otherKita: number
): string {
    let key = "";
    for (let i = 0; i < hand.length; i++) {
        key += hand[i];
    }
    key += "|";
    key += turn;
    key += "|";
    key += fixedMentsuLength;
    key += "|";
    key += myKita;
    key += "|";
    key += otherKita;

    return key;
}

export const simStats = {
    win: 0,
    ryukyoku: 0,
    tenpaiStop: 0,
    wallExhaust: 0
};

export function runSinglePath(
    initialHand: Tile[],
    localFixedMentsuArr: Mentsu[],
    initialAction: Action,
    myKita: number,
    otherKita: number,
    doraIndicators: Tile[],
    currentTurn: number,
    isDealer: boolean,
    mountain: Uint8Array,
    _mountainSize: number, // Physical size for summary
    liveWallLimit: number, // High-bound for draws
    _selfEffectiveWallCount: number,
    templateCounts: Int8Array,
    workTrialCounts: Int8Array,
    workHand27: Int8Array,
    workUraCounts: Int8Array,
    seed: number,
    _initialShanten: number, // Lint: Unused but kept for compatibility
    tenpaiDepth: number = 0,
    debugTrialIndex: number = 9999
): SimulationPathResult {
    // Phase 74: Cache Check
    const cacheKey = buildStateKey(
        initialHand,
        currentTurn,
        localFixedMentsuArr.length,
        myKita,
        otherKita
    );
    if (ENABLE_STATE_CACHE) {
        const cachedEV = stateCache.get(cacheKey);
        if (cachedEV !== undefined) {
            cacheHits++;
            return {
                type: 'win', // キャッシュヒット時は便宜上 'win' 扱い、ポイントに EV を格納
                point: cachedEV,
                isTenpai: true,
                finalShanten: -1,
                initialRemainingTiles: liveWallLimit,
                totalAgariTurnSum: 0,
                agariCount: 0,
                engineLiveWallLimit: liveWallLimit
            };
        }
        cacheMisses++;
    }

    const rng = new SimpleRNG(seed);
    const initialTotalForSummary = liveWallLimit;

    // Internalized path executor
    const executePath = (): SimulationPathResult => {
        if (DEBUG.performance && debugTrialIndex < 3) {
            logDebug("ACTION_TYPE", initialAction.type);
            logDebug("EXECUTE_PATH_CALLED", {
                actionType: initialAction.type,
                tile: (initialAction as any).tile ? tileToString((initialAction as any).tile) : 'none'
            });
        }

        if (initialAction.type === 'discard') {
            return executeDiscardPath(initialAction);
        } else if (initialAction.type === 'ankan') {
            return executeAnkanPath(initialAction);
        } else if (initialAction.type === 'ankanRiichi') {
            return executeAnkanPath(initialAction);
        } else if (initialAction.type === 'kakan') {
            return executeKakanPath(initialAction);
        } else if (initialAction.type === 'kita') {
            return executeKitaPath();
        } else if (initialAction.type === 'tsumo') {
            return executeTsumoPath();
        }

        return {
            type: 'draw', point: 0, isTenpai: false, finalShanten: 99,
            initialRemainingTiles: liveWallLimit, totalAgariTurnSum: 0, agariCount: 0,
            engineLiveWallLimit: liveWallLimit
        };
    };

    const executeDiscardPath = (action: Action & { type: 'discard' }): SimulationPathResult => {
        return runSimulationLoop(action);
    };

    const executeAnkanPath = (action: Action & ({ type: 'ankan' } | { type: 'ankanRiichi' })): SimulationPathResult => {
        return runSimulationLoop(action);
    };

    const executeKakanPath = (action: Action & { type: 'kakan' }): SimulationPathResult => {
        return runSimulationLoop(action);
    };

    const executeKitaPath = (): SimulationPathResult => {
        return runSimulationLoop({ type: 'kita' });
    };

    const executeTsumoPath = (): SimulationPathResult => {
        return runSimulationLoop({ type: 'tsumo' });
    };

    const runSimulationLoop = (action: Action): SimulationPathResult => {
        const hand27 = workHand27;
        const trialCounts = workTrialCounts;
        for (let i = 0; i < 27; i++) hand27[i] = 0;
        for (const t of initialHand) {
            const sTile = toSanmaTile(toNormalFive(t));
            if (sTile !== -1) hand27[sTile]++;
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
        let isRiichi = (action.type === 'discard' && action.riichi) || action.type === 'ankanRiichi';
        let isIppatsu = isRiichi;
        let isHaitei = false;
        let pathTurnCount = 0;
        let scoreAdjustment = isRiichi ? -1000 : 0;
        const currentDoraInds = [...doraIndicators];
        const currentMentsu = [...localFixedMentsuArr];
        // initialShanten は打牌前(14枚)のシャンテン数のため、打牌後(13枚)のシャンテン数を再計算して初期テンパイ判定とする
        const wasInitialTenpai = (calculateShantenCached(hand27, currentMentsu.length) === 0);
        let firstTenpaiTurn = wasInitialTenpai ? currentTurn : -1;

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
        const getCurrentDoraCount = () => countDora(reconstructHand(), currentDoraInds, currentMentsu, nukidoraCount);

        // --- 3. Simulation Loop Setup ---
        let simLoopSafety = 0;
        let depth = 0;

        // --- Initial Action Handling ---
        if (action.type === 'ankanRiichi') {
            if (DEBUG.performance && debugTrialIndex < 3) console.log("ANKAN_RIICHI_START");
        }
        if (action.type === 'ankan' || action.type === 'ankanRiichi' || action.type === 'kakan') {
            const isKakan = action.type === 'kakan';
            if (DEBUG.performance && debugTrialIndex < 3) console.log(isKakan ? "KAKAN_PATH_START" : "ANKAN_PATH_START", (action as any).tile);
            const actionTile = (action as any).tile;
            const sKan = toSanmaTile(toNormalFive(actionTile));
            if (sKan !== -1) {
                if (isKakan) {
                    if (hand27[sKan] >= 1) {
                        hand27[sKan] -= 1;
                        const ponIdx = currentMentsu.findIndex(m => m.type === 'koutsu' && m.isOpen && toNormalFive(m.tile) === toNormalFive(actionTile));
                        if (ponIdx !== -1) {
                            currentMentsu[ponIdx] = {
                                ...currentMentsu[ponIdx],
                                type: 'kantsu',
                                tiles: [...currentMentsu[ponIdx].tiles, actionTile],
                                isKan: true,
                                kanType: 'added'
                            } as any;
                        }
                    }
                } else {
                    if (hand27[sKan] >= 4) {
                        hand27[sKan] -= 4;
                        currentMentsu.push({
                            type: 'kantsu' as any,
                            tile: toNormalFive(actionTile),
                            tiles: [toNormalFive(actionTile), toNormalFive(actionTile), toNormalFive(actionTile), toNormalFive(actionTile)],
                            isOpen: false,
                            isKan: true,
                            kanType: 'ankan'
                        } as any);
                    }
                }
                if (mountainPtr < liveWallLimit) {
                    const dIdx = mountain[mountainPtr++];
                    trialCounts[dIdx]--;
                    currentDoraInds.push(TILE_TYPES[dIdx]);
                }
                // Rinshan Draw
                let rinshanTile: Tile | null = null;
                while (mountainPtr < liveWallLimit) {
                    const rIdx = mountain[mountainPtr++];
                    trialCounts[rIdx]--;
                    const rTile = TILE_TYPES[rIdx];
                    if (rTile === TILES.z4) { nukidoraCount++; continue; }
                    const sRep = toSanmaTile(toNormalFive(rTile));
                    if (sRep !== -1) hand27[sRep]++;
                    if (rTile === TILES.p5r) redP5++; else if (rTile === TILES.s5r) redS5++;
                    rinshanTile = rTile;
                    break;
                }

                if (rinshanTile) {
                    if (DEBUG.performance && debugTrialIndex < 3) console.log("RINSHAN_DRAW", rinshanTile);
                    // Win Check on Rinshan
                    agariCalls++;
                    const pRinshan = getAgariPatternsCached(reconstructHand(), currentMentsu, hand27);
                    if (pRinshan.length > 0) {
                        const state: GameState = {
                            bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                            isRiichi, isDoubleRiichi: false, isIppatsu, isTsumo: true,
                            isRinshan: true, isChankan: false, isHaitei, isHoutei: false,
                            kitaCount: nukidoraCount, doraCount: getCurrentDoraCount(), uraDoraCount: 0,
                            winningTile: rinshanTile, isDealer, turnCount: currentTurn,
                            hasCallOccurred: currentMentsu.some(m => m.isOpen || m.isKan) || nukidoraCount > 0,
                            discardCount: 0
                        };
                        if (isRiichi) {
                            let tempPool = 0; for (let n = 0; n < 29; n++) tempPool += trialCounts[n];
                            const tempCounts = workUraCounts; for (let n = 0; n < 29; n++) tempCounts[n] = trialCounts[n];
                            let udc = 0;
                            for (let d = 0; d < currentDoraInds.length; d++) {
                                if (tempPool <= 0) break;
                                let r = Math.floor(rng.next() * tempPool);
                                for (let j = 0; j < 29; j++) {
                                    if (r < tempCounts[j]) {
                                        const val = getDoraValue(TILE_TYPES[j]);
                                        for (let k = 0; k < 27; k++) if (toStandardTile(k) === val) udc += hand27[k];
                                        for (const m of currentMentsu) for (const t of m.tiles) if (toNormalFive(t) === val) udc++;
                                        tempCounts[j]--; tempPool--; break;
                                    }
                                    r -= tempCounts[j];
                                }
                            }
                            state.uraDoraCount = udc;
                        }
                        let fastPoints = 0;
                        for (const p of pRinshan) {
                            const info = scoreWinningHandFast(reconstructHand(), p, state);
                            if (info.score > fastPoints) fastPoints = info.score;
                        }
                        if (fastPoints > 0) {
                            if (DEBUG.performance && debugTrialIndex < 3) console.log("WIN_DETECTED", fastPoints);
                            return {
                                type: 'win', point: fastPoints + scoreAdjustment, isTenpai: true,
                                finalShanten: -1, initialRemainingTiles: initialTotalForSummary,
                                totalAgariTurnSum: currentTurn, agariCount: 1, engineLiveWallLimit: liveWallLimit,
                                win: true, score: fastPoints, endReason: 'win', firstTenpaiTurn
                            };
                        }
                    }

                    // 5. 嶺上ツモ後は必ず1枚切る (修正要求に対応)
                    // 暗槓リーチの場合はテンパイ崩しを防止するため depth=2 相当で縛る
                    const effectiveTenpaiDepth = action.type === 'ankanRiichi' ? 2 : tenpaiDepth;
                    const discardTile27 = findBestDiscard27(hand27, currentMentsu.length, trialCounts, currentDoraInds, rng, effectiveTenpaiDepth, depth, currentTurn, debugTrialIndex);
                    if (discardTile27 !== -1) {
                        hand27[discardTile27]--;
                        const t34 = toStandardTile(discardTile27);
                        if (t34 === TILES.p5 && redP5 > 0 && hand27[discardTile27] < redP5) redP5--;
                        else if (t34 === TILES.s5 && redS5 > 0 && hand27[discardTile27] < redS5) redS5--;
                    }
                }

                if (DEBUG.performance && debugTrialIndex < 3) {
                    console.log("HAND_AFTER_ANKAN", reconstructHand().map(tileToString));
                }
            }
        } else if (action.type === 'kita') {
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
        } else if (action.type === 'tsumo') {
            // Check win immediately
            const currentHand = reconstructHand();
            agariCalls++;
            const patterns = getAgariPatternsCached(currentHand, currentMentsu, hand27);
            if (patterns.length > 0) {
                const state: GameState = {
                    bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                    isRiichi, isDoubleRiichi: false, isIppatsu, isTsumo: true,
                    isRinshan: false, isChankan: false, isHaitei, isHoutei: false,
                    kitaCount: nukidoraCount, doraCount: getCurrentDoraCount(), uraDoraCount: 0,
                    winningTile: initialHand[initialHand.length - 1], isDealer, turnCount: currentTurn,
                    hasCallOccurred: currentMentsu.some(m => m.isOpen || m.isKan) || nukidoraCount > 0,
                    discardCount: 0
                };
                let fastPoints = 0;
                for (const p of patterns) {
                    const info = scoreWinningHandFast(currentHand, p, state);
                    if (info.score > fastPoints) fastPoints = info.score;
                }
                if (fastPoints > 0) {
                    if (DEBUG.performance && debugTrialIndex < 3) console.log("WIN_DETECTED", fastPoints);
                    return {
                        type: 'win', point: fastPoints + scoreAdjustment, isTenpai: true,
                        finalShanten: -1,
                        initialRemainingTiles: initialTotalForSummary, totalAgariTurnSum: currentTurn,
                        agariCount: 1, engineLiveWallLimit: liveWallLimit,
                        win: true, score: fastPoints, endReason: 'win', firstTenpaiTurn
                    };
                }
            }
        }

        // --- Simulation Loop ---
        while (mountainPtr < liveWallLimit && selfDrawCount < selfDrawQuota) {
            simLoopSafety++; if (simLoopSafety > 1000) break;
            pathTurnCount++;
            let drawn: Tile | null = null;
            while (true) {
                if (mountainPtr >= liveWallLimit || selfDrawCount >= selfDrawQuota) break;
                const typeIdx = mountain[mountainPtr];
                mountainPtr += 3;
                selfDrawCount++;
                trialCounts[typeIdx]--;
                const tile = TILE_TYPES[typeIdx];
                if (tile === TILES.z4) { nukidoraCount++; continue; }

                const isForcedKakanTile = tile === TILES.m1 || tile === TILES.m9 || tile >= TILES.z1;
                if (isForcedKakanTile) {
                    const ponIdx = currentMentsu.findIndex(m => m.type === 'koutsu' && m.isOpen && toNormalFive(m.tile) === toNormalFive(tile));
                    if (ponIdx !== -1) {
                        currentMentsu[ponIdx] = {
                            ...currentMentsu[ponIdx],
                            type: 'kantsu',
                            tiles: [...currentMentsu[ponIdx].tiles, tile],
                            isKan: true,
                            kanType: 'added'
                        } as any;
                        if (mountainPtr < liveWallLimit) {
                            const dIdx = mountain[mountainPtr++];
                            trialCounts[dIdx]--;
                            currentDoraInds.push(TILE_TYPES[dIdx]);
                        }
                        nukidoraCount++;
                        continue;
                    }
                }

                drawn = tile;
                break;
            }
            const prevShanten = calculateShantenCached(hand27, currentMentsu.length);

            if (isRiichi && DEBUG.performance && debugTrialIndex < 3) logVerbose("RIICHI_DRAW");

            const sDrawn = toSanmaTile(toNormalFive(drawn as Tile));
            if (sDrawn !== -1) hand27[sDrawn]++;

            const preDrawShanten = calculateShantenCached(hand27, currentMentsu.length);
            if (debugTrialIndex < 5 && prevShanten !== preDrawShanten) {
                logVerbose("SHANTEN_TRANSITION", {
                    before: prevShanten,
                    after: preDrawShanten,
                    turn: currentTurn + pathTurnCount
                });
            }
            if (debugTrialIndex < 5 && preDrawShanten === 0) {
                logVerbose("POST_TENPAI_DRAW", {
                    turn: currentTurn + pathTurnCount,
                    tilesLeft: Math.floor(Math.max(0, liveWallLimit - mountainPtr) / 3)
                });
            }
            if (drawn === TILES.p5r) redP5++; else if (drawn === TILES.s5r) redS5++;
            if (mountainPtr >= liveWallLimit || selfDrawCount >= selfDrawQuota) isHaitei = true;
            const currentHand = reconstructHand();
            agariCalls++;
            const patterns = getAgariPatternsCached(currentHand, currentMentsu, hand27);
            if (patterns.length > 0) {
                const state: GameState = {
                    bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                    isRiichi, isDoubleRiichi: false, isIppatsu, isTsumo: true,
                    isRinshan: false, isChankan: false, isHaitei, isHoutei: false,
                    kitaCount: nukidoraCount, doraCount: getCurrentDoraCount(), uraDoraCount: 0,
                    winningTile: drawn!, isDealer, turnCount: currentTurn + pathTurnCount,
                    hasCallOccurred: currentMentsu.some(m => m.isOpen || m.isKan) || nukidoraCount > 0,
                    discardCount: 0
                };
                if (isRiichi) {
                    let tempPool = 0; for (let n = 0; n < 29; n++) tempPool += trialCounts[n];
                    const tempCounts = workUraCounts; for (let n = 0; n < 29; n++) tempCounts[n] = trialCounts[n];
                    let udc = 0;
                    for (let d = 0; d < currentDoraInds.length; d++) {
                        if (tempPool <= 0) break;
                        let r = Math.floor(rng.next() * tempPool);
                        for (let j = 0; j < 29; j++) {
                            if (r < tempCounts[j]) {
                                const val = getDoraValue(TILE_TYPES[j]);
                                for (let k = 0; k < 27; k++) if (toStandardTile(k) === val) udc += hand27[k];
                                for (const m of currentMentsu) for (const t of m.tiles) if (toNormalFive(t) === val) udc++;
                                tempCounts[j]--; tempPool--; break;
                            }
                            r -= tempCounts[j];
                        }
                    }
                    state.uraDoraCount = udc;
                }
                let fastPoints = 0;
                for (const p of patterns) {
                    const info = scoreWinningHandFast(currentHand, p, state);
                    if (info.score > fastPoints) fastPoints = info.score;
                }
                if (fastPoints > 0) {
                    if (isRiichi && DEBUG.performance && debugTrialIndex < 3) console.log("RIICHI_WIN");
                    if (DEBUG.performance && debugTrialIndex < 3) console.log("WIN_DETECTED", fastPoints);
                    return {
                        type: 'win', point: fastPoints + scoreAdjustment, isTenpai: true,
                        finalShanten: -1, initialRemainingTiles: initialTotalForSummary,
                        totalAgariTurnSum: currentTurn + pathTurnCount, agariCount: 1, engineLiveWallLimit: liveWallLimit,
                        win: true, score: fastPoints, endReason: 'win', firstTenpaiTurn
                    };
                }
            }
            let bestD = isRiichi ? sDrawn : findBestDiscard27(hand27, currentMentsu.length, trialCounts, currentDoraInds, rng, tenpaiDepth, depth, currentTurn + pathTurnCount, debugTrialIndex);
            if (bestD !== -1) {
                hand27[bestD]--;
                depth++;
                const currentShantenForLog = calculateShantenCached(hand27, currentMentsu.length);
                if (currentShantenForLog === 0 && firstTenpaiTurn === -1) {
                    firstTenpaiTurn = currentTurn + pathTurnCount;
                }
                if (debugTrialIndex < 5 && currentShantenForLog === 0) {
                    logVerbose("TENPAI_DETECTED", {
                        action: action.type === 'discard' ? tileToString((action as any).tile) : action.type,
                        turn: currentTurn + pathTurnCount,
                        tilesLeft: Math.floor(Math.max(0, liveWallLimit - mountainPtr) / 3)
                    });
                }
                const t34 = toStandardTile(bestD);
                if (t34 === TILES.p5 && redP5 > 0 && hand27[bestD] < redP5) redP5--;
                else if (t34 === TILES.s5 && redS5 > 0 && hand27[bestD] < redS5) redS5--;
                const isCurrentlyMenzen = currentMentsu.every(m => !m.isOpen);
                if (!isRiichi && isCurrentlyMenzen && calculateShantenCached(hand27, currentMentsu.length) === 0) {
                    let chooseRiichi = true;
                    if (!wasInitialTenpai) {
                        const currentHandAfterDiscard = reconstructHand();
                        agariCalls++;
                        const patterns = getAgariPatterns(currentHandAfterDiscard, currentMentsu);
                        let totalHan = 0; let totalScore = 0; let maxFu = 0;
                        if (patterns.length > 0) {
                            for (const p of patterns) {
                                const mockState: GameState = {
                                    bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                                    isRiichi: false, isDoubleRiichi: false, isIppatsu: false, isTsumo: true,
                                    isRinshan: false, isChankan: false, isHaitei: false, isHoutei: false,
                                    kitaCount: nukidoraCount, doraCount: getCurrentDoraCount(), uraDoraCount: 0,
                                    winningTile: undefined, isDealer, turnCount: currentTurn + pathTurnCount,
                                    hasCallOccurred: currentMentsu.some(m => m.isOpen || m.isKan) || nukidoraCount > 0,
                                    discardCount: 0
                                };
                                const info = scoreWinningHandFast(currentHandAfterDiscard, p, mockState);
                                totalHan += info.han; totalScore += info.score;
                                if (info.fu > maxFu) maxFu = info.fu;
                            }
                            const averageScore = totalScore / patterns.length;
                            const ukeireCount = getUkeireCount27(hand27, currentMentsu.length, trialCounts);
                            if (ukeireCount >= 6) {
                                if (averageScore >= 12000) chooseRiichi = (ukeireCount >= 9 && (currentTurn + pathTurnCount) <= 9);
                                else if (averageScore >= 8000) chooseRiichi = (currentTurn + pathTurnCount) <= 9;
                            }
                        }
                    }
                    if (chooseRiichi) { isRiichi = true; isIppatsu = true; scoreAdjustment -= 1000; }
                }
            } else break;
            isIppatsu = false;
        }
        const finalShantenVal = calculateShantenCached(hand27, currentMentsu.length);
        const isTenpaiResult = finalShantenVal <= 0;

        let endReason = 'ryukyoku';
        const finalTilesLeft = Math.floor(Math.max(0, liveWallLimit - mountainPtr) / 3);
        if (mountainPtr >= liveWallLimit) {
            endReason = 'wallExhaust';
            if (debugTrialIndex < 5) console.log("WALL_EXHAUST_TRIGGERED", { turn: currentTurn + pathTurnCount });
        } else if (selfDrawCount >= selfDrawQuota) {
            if (debugTrialIndex < 5) console.log("MAX_TURN_REACHED", { turn: currentTurn + pathTurnCount });
            endReason = isTenpaiResult ? 'tenpaiStop' : 'ryukyoku';
            if (isTenpaiResult && debugTrialIndex < 5) console.log("TENPAI_STOP_TRIGGERED", { turn: currentTurn + pathTurnCount, tilesLeft: finalTilesLeft });
        } else {
            endReason = isTenpaiResult ? 'tenpaiStop' : 'ryukyoku';
            if (isTenpaiResult && debugTrialIndex < 5) console.log("TENPAI_STOP_TRIGGERED", { turn: currentTurn + pathTurnCount, tilesLeft: finalTilesLeft });
        }
        return {
            type: 'draw', point: scoreAdjustment + (isTenpaiResult ? 1000 : -1000), isTenpai: isTenpaiResult,
            finalShanten: finalShantenVal, initialRemainingTiles: initialTotalForSummary,
            totalAgariTurnSum: 0, agariCount: 0, engineLiveWallLimit: liveWallLimit,
            win: false, score: 0, endReason, firstTenpaiTurn
        };
    };

    const result = executePath();

    if (result.win && !result.endReason) {
        result.endReason = 'win';
    }

    if (result.endReason === 'win') {
        simStats.win++;
    } else if (result.endReason === 'wallExhaust') {
        simStats.wallExhaust++;
    } else if (result.endReason === 'tenpaiStop') {
        simStats.tenpaiStop++;
    } else {
        simStats.ryukyoku++;
    }

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

    agariCalls++;
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

    if (DEBUG.ukeire && sorted.length > 0) {
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

// =========================================================================
// Phase 102: CI Racing
// =========================================================================

export const DEBUG_CI_RACING = true;

export interface Candidate {
    action: Action;
    trials: number;
    sumEV: number;
    meanEV: number;
    variance: number;
    eliminated: boolean;
    // For final results sync
    winCount: number;
    sumWinPoint: number;
    tenpaiCount: number;
    totalPoints: number;
    totalAgariTurnSum: number;
    agariCount: number;
    tenpaiBy10TurnCount: number;
    tenpaiWithin3TurnCount: number;
}

export function updateCandidateStats(candidate: Candidate, ev: number): void {
    candidate.sumEV += ev;
    candidate.trials++;

    // Welford's algorithm for online variance
    if (candidate.trials === 1) {
        candidate.meanEV = ev;
        candidate.variance = 0;
    } else {
        const oldMean = candidate.meanEV;
        candidate.meanEV += (ev - oldMean) / candidate.trials;
        // Keep sum of squared differences in `variance` temporarily,
        // then divide by (trials - 1) when requested in computeCI
        const delta2 = ev - candidate.meanEV;
        // To strictly follow Welford: M2 += (val - oldMean)*(val - newMean)
        // Here we store M2 directly into `variance` variable until CI computation
        candidate.variance += (ev - oldMean) * delta2;
    }
}

export function computeCI(candidate: Candidate): { lowerBound: number, upperBound: number } {
    if (candidate.trials < 2) {
        return { lowerBound: -Infinity, upperBound: Infinity };
    }
    const sampleVariance = candidate.variance / (candidate.trials - 1);
    const stdDev = Math.sqrt(Math.max(sampleVariance, 0));
    const ci = 1.96 * stdDev / Math.sqrt(candidate.trials);
    return {
        lowerBound: candidate.meanEV - ci,
        upperBound: candidate.meanEV + ci
    };
}


// =========================================================================
// Phase 77: UCB1 Monte Carlo Search (To be pruned, kept for legacy compat)
// =========================================================================

export type UCBNode = {
    action: Action;
    visits: number;
    totalEV: number;
    meanEV: number;
    sumEV: number;
    sumEV2: number;
    winCount: number;
    totalPoints: number;
    tenpaiCount: number;
    totalAgariTurnSum: number;
    agariCount: number;
};

export function computeUCB(node: UCBNode, totalVisits: number, exploration = 5000): number {
    if (node.visits === 0) return Infinity;
    return node.meanEV + exploration * Math.sqrt(Math.log(totalVisits) / node.visits);
}

export function selectUCBNode(nodes: UCBNode[]): UCBNode {
    let bestNode = nodes[0];
    let bestScore = -Infinity;

    let totalVisits = 0;
    for (const n of nodes) totalVisits += n.visits;
    totalVisits = Math.max(totalVisits, 1);

    for (const node of nodes) {
        const score = computeUCB(node, totalVisits);
        if (score > bestScore) {
            bestScore = score;
            bestNode = node;
        }
    }
    return bestNode;
}

export function pruneWeakNodes(nodes: UCBNode[]): UCBNode[] {
    let bestEV = -Infinity;
    for (const n of nodes) {
        if (n.meanEV > bestEV) bestEV = n.meanEV;
    }

    return nodes.filter(n => {
        if (n.visits < 50) return true;
        return n.meanEV > bestEV - 2000;
    });
}

