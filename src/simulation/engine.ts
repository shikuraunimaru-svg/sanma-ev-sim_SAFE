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
const DEBUG_WIN = false; // WIN_DEBUG ログの ON/OFF（デフォルト OFF）

export function resetDebugCounters() {
    debugSimCountGlobal = 0;
    debugWinLogged = false;
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
        let isIppatsu = isRiichi; // Ippatsu is active if riichi is declared
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

        // --- 2. Initial Kita Handling (Only if initial action) ---
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
                mountainPtr += 3; // Sanma skip
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
                    // Sanma dead wall has (14 - doraIndicators.length) unseen tiles.
                    // We sample as many ura indicators as there are dora indicators.
                    for (let d = 0; d < doraIndicators.length; d++) {
                        if (tempPool <= 0) break;
                        let r = Math.floor(rng.next() * tempPool);
                        for (let j = 0; j < 29; j++) {
                            if (r < tempCounts[j]) {
                                const val = getDoraValue(TILE_TYPES[j]);
                                // Check counts in hand and fixed segments
                                for (let k = 0; k < 27; k++) if (toStandardTile(k) === val) udc += hand27[k];
                                for (const m of localFixedMentsuArr) for (const t of m.tiles) if (toNormalFive(t) === val) udc++;
                                tempCounts[j]--; tempPool--; break;
                            }
                            r -= tempCounts[j];
                        }
                    }
                    state.uraDoraCount = udc;
                }

                const result = calculateScore(currentHand, patterns[0], state);
                if (validateAgari(result)) {
                    const { points } = resolveFinalScore(result, state);
                    if (DEBUG_WIN) {
                        console.log("WIN_DEBUG", {
                            riichi: state.isRiichi,
                            ippatsu: state.isIppatsu,
                            han: result.han,
                            ura: state.uraDoraCount,
                            yaku: result.yakuList.map(y => `${y.name}(${y.han})`).join(","),
                            score: points
                        });
                    }
                    return {
                        type: 'win', point: points + scoreAdjustment, isTenpai: true,
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

                // Auto-riichi if Dama
                if (!isRiichi && localFixedMentsuArr.length === 0 && getShantenMemoized(hand27 as any, 0) === 0) {
                    isRiichi = true; isIppatsu = true; scoreAdjustment -= 1000;
                }
            } else { break; }
            isIppatsu = false; // Ippatsu reset after one full cycle (draw + discard)
        }

        const isTenpai = getShantenMemoized(hand27 as any, localFixedMentsuArr.length) <= 0;
        return {
            type: 'draw', point: scoreAdjustment + (isTenpai ? 1000 : -1000), isTenpai,
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

    if (sorted.length > 0) {
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
    let count = kitaCount; // Basic Nukidora
    for (const ind of doraInds) {
        const doraValue = getDoraValue(ind);
        if (doraValue === TILES.z4) count += kitaCount;
        for (const t of hand) if (toNormalFive(t) === doraValue) count++;
        for (const m of fixedMentsu) for (const t of m.tiles) if (toNormalFive(t) === doraValue) count++;
    }
    for (const t of hand) if (isRedFive(t)) count++;
    for (const m of fixedMentsu) for (const t of m.tiles) if (isRedFive(t)) count++;
    return count;
}
