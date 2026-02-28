import { TILES, toNormalFive, isRedFive } from '../core/tile';
export { TILES };
import type { Tile } from '../core/tile';
import { calculateShanten27, getAgariPatterns } from '../core/shanten';
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

export type Action =
    | { type: 'discard', tile: Tile, riichi?: boolean }
    | { type: 'kita' }
    | { type: 'ankan', tile: Tile, riichi?: boolean }
    | { type: 'kakan', tile: Tile }
    | { type: 'tsumo' };

export type SimulationConfig = {
    myHand: Tile[];
    fixedMentsu: Mentsu[];
    myDiscards: Tile[];
    doraIndicators: Tile[];
    myKita: number;
    otherKita: number;
    trials: number;
    currentTurn: number;
    isDealer: boolean;
    validationMode?: boolean;
};


export type SimulationSummary = {
    remainingTiles: number;
    shanten: {
        normal: number;
        chiitoi: number;
        kokushi: number;
    };
    totalTimeMs?: number;
};

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
    effectiveTiles?: { tile: Tile; count: number }[];
};

export type SimulationPathResult = {
    type: 'win' | 'draw';
    point: number;
    isTenpai: boolean;
    initialRemainingTiles: number;
};

let debugSimCountGlobal = 0;
let debugWinLogged = false;

// TypedArray resources
const SHARED_MOUNTAIN = new Uint8Array(136);

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
    invisibleCounts29: Int8Array | number[]
): number {
    let bestDiscardS27 = -1;
    let minShantenFound = 99;
    let maxUkeireFound = -1;

    for (let i = 0; i < 27; i++) {
        if (hand27[i] === 0) continue;

        hand27[i]--;
        const s = getShantenMemoized(hand27 as any, fixedMentsuCount);

        let ukeire = 0;
        if (s <= 1) { // We care about ukeire for 0 and 1 shanten
            ukeire = getUkeireCount27(hand27, fixedMentsuCount, invisibleCounts29);
        }

        if (s < minShantenFound) {
            minShantenFound = s;
            maxUkeireFound = ukeire;
            bestDiscardS27 = i;
        } else if (s === minShantenFound) {
            if (ukeire > maxUkeireFound) {
                maxUkeireFound = ukeire;
                bestDiscardS27 = i;
            }
        }
        hand27[i]++;
    }
    return bestDiscardS27;
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

export function runSinglePath(
    initialHand: Tile[],
    localFixedMentsuArr: Mentsu[],
    initialAction: Action,
    myKita: number,
    visibleKitaCount: number,
    doraIndicators: Tile[],
    currentTurn: number,
    isDealer: boolean,
    mountain: Uint8Array,
    mountainSize: number,
    templateCounts: Int8Array,
    workTrialCounts: Int8Array,
    workHand27: Int8Array,
    workUraCounts: Int8Array
): SimulationPathResult {
    debugSimCountGlobal++;
    let agariCheckCount = 0;

    const doraInds = [...doraIndicators];
    const localFixedMentsu = [...localFixedMentsuArr];
    let nukidoraCount = myKita;

    const TOTAL_TILES = 108;
    const DEAD_WALL = 14;
    const PLAYABLE_TILES = TOTAL_TILES - DEAD_WALL;
    const INITIAL_HANDS = 13 * 3;

    const doraCountValue = doraInds.length;
    const turnsPassed = currentTurn - 1;
    const drawsConsumed = turnsPassed * 3;
    const liveWallLimit = PLAYABLE_TILES - INITIAL_HANDS - doraCountValue - drawsConsumed - visibleKitaCount;

    // --- Optimization: Mountain passed from outside ---
    // (Shuffle is now done in worker per user request)

    const trialCounts = workTrialCounts;
    for (let i = 0; i < 29; i++) {
        trialCounts[i] = templateCounts[i];
    }

    const drawTileCore = (): Tile | null => {
        if (mountainPtr >= mountainSize || mountainPtr >= liveWallLimit) return null;
        const typeIdx = mountain[mountainPtr++];
        trialCounts[typeIdx]--;
        return TILE_TYPES[typeIdx];
    };

    const drawTileWithAutoKita = (isPlayer: boolean): Tile | null => {
        while (true) {
            if (mountainPtr >= mountainSize || mountainPtr >= liveWallLimit) return null;
            let tile = drawTileCore();
            if (!tile) return null;

            if (tile === NORTH) {
                diagNukiCounts++;
                if (isPlayer) nukidoraCount++;
                continue;
            }
            return tile;
        }
    };

    const hand27 = workHand27;
    for (let i = 0; i < 27; i++) hand27[i] = 0; // Manual reset
    let redP5 = 0;
    let redS5 = 0;
    for (let i = 0; i < initialHand.length; i++) {
        const t = initialHand[i];
        if (t === TILES.p5r) redP5++;
        else if (t === TILES.s5r) redS5++;
        const sTile = toSanmaTile(toNormalFive(t));
        if (sTile !== -1) hand27[sTile]++;
    }

    // --- Optimization: trialCounts buffer ---
    // (Already initialized from templateCounts above)

    const NORTH = TILES.z4;
    const initialTotalForSummary = liveWallLimit;
    let mountainPtr = 0;

    let isRiichi = (initialAction.type === 'discard' || initialAction.type === 'ankan') ? !!initialAction.riichi : false;
    const disableAutoRiichi = (initialAction.type === 'discard' && !initialAction.riichi);

    let isDoubleRiichi = false;
    let isIppatsu = false;
    let isHaitei = false;
    let pathTurnCount = 0;
    let scoreAdjustment = 0;

    // Diagnostic counters
    let diagTurnDraws = 0;
    let diagExtraDraws = 0;
    let diagNukiCounts = 0;

    // Apply Initial Action
    if (initialAction.type === 'discard' || initialAction.type === 'ankan' || initialAction.type === 'kakan') {
        const sAction = toSanmaTile(toNormalFive(initialAction.tile));
        if (sAction !== -1) {
            hand27[sAction]--;
            if (initialAction.tile === TILES.p5r) redP5--;
            else if (initialAction.tile === TILES.s5r) redS5--;
        }
    } else if (initialAction.type === 'kita') {
        // North is z4. We extract it.
        const sNorth = toSanmaTile(toNormalFive(NORTH));
        if (sNorth !== -1 && hand27[sNorth] > 0) {
            hand27[sNorth]--;
            nukidoraCount++;
            diagNukiCounts++;
            // Draw a replacement tile for Kita immediately
            const replacement = drawTileWithAutoKita(true);
            if (replacement) {
                const sRep = toSanmaTile(toNormalFive(replacement));
                if (sRep !== -1) hand27[sRep]++;
                if (replacement === TILES.p5r) redP5++;
                else if (replacement === TILES.s5r) redS5++;
            }
        }
    }

    const reconstructHand = (): Tile[] => {
        const res: Tile[] = [];
        let p5Added = 0;
        let s5Added = 0;
        for (let i = 0; i < 27; i++) {
            const count = hand27[i];
            const t34 = toStandardTile(i);
            for (let j = 0; j < count; j++) {
                if (t34 === TILES.p5 && p5Added < redP5) {
                    res.push(TILES.p5r);
                    p5Added++;
                } else if (t34 === TILES.s5 && s5Added < redS5) {
                    res.push(TILES.s5r);
                    s5Added++;
                } else {
                    res.push(t34);
                }
            }
        }
        return res;
    };

    const getCurrentDoraCount = () => countDora(reconstructHand(), doraInds, localFixedMentsu, nukidoraCount);
    const isValidWin = (result: YakuResult) => validateAgari(result);


    const performGreedyDiscard = (): boolean => {
        const bestDiscardS27 = findBestDiscard27(hand27, localFixedMentsu.length, trialCounts);

        if (bestDiscardS27 !== -1) {
            hand27[bestDiscardS27]--;
            // Boundary check
            if (hand27[bestDiscardS27] < 0) {
                hand27[bestDiscardS27] = 0; // Robustness
            }
            const t34 = toStandardTile(bestDiscardS27);
            if (t34 === TILES.p5 && redP5 > 0 && hand27[bestDiscardS27] < redP5) {
                redP5--;
            } else if (t34 === TILES.s5 && redS5 > 0 && hand27[bestDiscardS27] < redS5) {
                redS5--;
            }
        } else {
            return false;
        }

        if (disableAutoRiichi) return true;
        if (localFixedMentsu.length === 0 && !isRiichi && getShantenMemoized(hand27 as any, 0) === 0) {
            isRiichi = true;
            isIppatsu = true;
            scoreAdjustment -= 1000;
        }
        return true;
    };

    // SIMULATION LOOP
    let simLoopSafety = 0;
    while (mountainSize > 0) {
        simLoopSafety++;
        if (simLoopSafety > 1000) throw new Error("Infinite loop detected in simulation loop");

        pathTurnCount++;
        if (mountainSize <= 0) break;

        // Opponents (Simulated as random counts reduction)
        for (let j = 0; j < 2; j++) {
            if (mountainPtr >= mountainSize || mountainPtr >= liveWallLimit) break;
            drawTileWithAutoKita(false); // Opponent turn draw
        }

        if (mountainPtr >= mountainSize || mountainPtr >= liveWallLimit) break;

        // My Draw
        const drawn = drawTileWithAutoKita(true); // Player turn draw
        if (!drawn) break;
        const sDrawn = toSanmaTile(toNormalFive(drawn));
        if (sDrawn !== -1) hand27[sDrawn]++;
        if (drawn === TILES.p5r) redP5++;
        else if (drawn === TILES.s5r) redS5++;

        if (mountainPtr >= liveWallLimit) isHaitei = true;

        if (getShantenMemoized(hand27 as any, localFixedMentsu.length) === -1) {
            const currentHand = reconstructHand();
            const patterns = getAgariPatterns(currentHand, localFixedMentsu);
            if (patterns.length > 0) {
                const state: GameState = {
                    bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                    isRiichi, isDoubleRiichi, isIppatsu, isTsumo: true,
                    isRinshan: false, isChankan: false, isHaitei, isHoutei: false,
                    kitaCount: nukidoraCount, doraCount: getCurrentDoraCount(), uraDoraCount: 0,
                    winningTile: drawn, isDealer, turnCount: currentTurn + pathTurnCount,
                    hasCallOccurred: localFixedMentsu.some(m => m.isOpen || m.isKan) || nukidoraCount > 0,
                    discardCount: 0
                };

                if (isRiichi) {
                    // Simulate Ura-dora
                    let tempPool = 0;
                    for (let n = 0; n < 29; n++) tempPool += trialCounts[n];

                    const tempCounts = workUraCounts;
                    for (let n = 0; n < 29; n++) tempCounts[n] = trialCounts[n];

                    let uraDoraCount = 0;
                    for (let d = 0; d < doraInds.length; d++) {
                        if (tempPool <= 0) break;
                        let rand = Math.floor(Math.random() * tempPool);
                        for (let j = 0; j < 29; j++) {
                            if (rand < tempCounts[j]) {
                                const uraInd = TILE_TYPES[j];
                                const uraDoraValue = getDoraValue(uraInd);
                                for (let k = 0; k < 27; k++) {
                                    if (toStandardTile(k) === uraDoraValue) uraDoraCount += hand27[k];
                                }
                                for (const m of localFixedMentsu) for (const t of m.tiles) if (toNormalFive(t) === uraDoraValue) uraDoraCount++;
                                tempCounts[j]--;
                                tempPool--;
                                break;
                            }
                            rand -= tempCounts[j];
                        }
                    }
                    state.uraDoraCount = uraDoraCount;
                }

                agariCheckCount++;
                const result = calculateScore(currentHand, patterns[0], state);

                if (isValidWin(result)) {
                    const { points } = resolveFinalScore(result, state);

                    if (DEBUG_MODE && !debugWinLogged) {
                        console.log("=== WIN DEBUG ===");
                        console.log({
                            finalCounts27: Array.from(hand27),
                            redP5,
                            redS5,
                            han: result.han,
                            fu: result.fu,
                            point: points + (isRiichi ? 1000 : 0) + scoreAdjustment,
                            yakuList: result.yakuList.map(y => `${y.name}(${y.han}han${y.isDora ? ', dora' : ''})`)
                        });
                        debugWinLogged = true;
                    }

                    if (DEBUG_MODE && debugSimCountGlobal <= 1) {
                        console.log("Win path tiles consumption (sim loop):", {
                            initial: initialTotalForSummary,
                            normalDraws: diagTurnDraws,
                            extraDraws: diagExtraDraws,
                            nukiCounts: diagNukiCounts,
                            finalRemaining: initialTotalForSummary - mountainPtr,
                            isVerified: true
                        });
                    }
                    return { type: 'win', point: points + (isRiichi ? 1000 : 0) + scoreAdjustment, isTenpai: true, initialRemainingTiles: initialTotalForSummary };
                }
            }
        }

        if (isRiichi) {
            // Discard the drawn tile directly
            const sDrawn = toSanmaTile(toNormalFive(drawn));
            if (sDrawn !== -1) hand27[sDrawn]--;
            if (drawn === TILES.p5r) redP5--;
            else if (drawn === TILES.s5r) redS5--;
            isIppatsu = false;
        }
        else if (!performGreedyDiscard()) break;
    }

    if (DEBUG_MODE && debugSimCountGlobal <= 1) {
        console.log("Draw path tiles consumption (final):", {
            initial: liveWallLimit,
            normalDraws: diagTurnDraws,
            extraDraws: diagExtraDraws,
            nukiCounts: diagNukiCounts,
            finalRemaining: liveWallLimit - mountainPtr,
            isVerified: true
        });
    }

    if (DEBUG_MODE && debugSimCountGlobal <= 1) {
        console.log("=== PATH END DEBUG ===");
        console.log({
            initialMountainSize: liveWallLimit,
            remainingMountain: liveWallLimit - mountainPtr,
            nukiTotalCount: diagNukiCounts,
            agariCheckCount
        });
    }

    const finalShanten = getShantenMemoized(hand27 as any, localFixedMentsu.length);
    const isTenpai = finalShanten <= 0;
    return { type: 'draw', point: scoreAdjustment + (isTenpai ? 1000 : -1000), isTenpai, initialRemainingTiles: initialTotalForSummary };
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
            yakuList: best.yaku.yakuList.map(y => `${y.name}(${y.han})`),
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
