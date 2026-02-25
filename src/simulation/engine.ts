import { TILES, toNormalFive, isRedFive, ALL_SANMA_TILES, getKanTiles } from '../core/tile';
import type { Tile } from '../core/tile';
import { calculateShanten, getAgariPatterns } from '../core/shanten';
import type { Mentsu, HandStructure } from '../core/shanten';
import { calculateScore, isChiitoitsu, isKokushiMusou } from '../core/yaku';
import type { GameState, YakuResult } from '../core/yaku';
import { calculatePoints } from '../core/score';
import type { ScoreResult } from '../core/score';

/**
 * Tile Count System (29 Types)
 */
const TILE_TYPES: Tile[] = [
    TILES.m1, TILES.m9,
    TILES.p1, TILES.p2, TILES.p3, TILES.p4, TILES.p5, TILES.p5r, TILES.p6, TILES.p7, TILES.p8, TILES.p9,
    TILES.s1, TILES.s2, TILES.s3, TILES.s4, TILES.s5, TILES.s5r, TILES.s6, TILES.s7, TILES.s8, TILES.s9,
    TILES.z1, TILES.z2, TILES.z3, TILES.z4, TILES.z5, TILES.z6, TILES.z7
];

function getInitialCounts(): number[] {
    const counts = new Array(29).fill(4);
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
    const baseHan = result.han;
    // result.han already includes state.doraCount and state.uraDoraCount

    // We add Kita fans here. 
    // If North is the dora, countDora already added 1 per Kita.
    // In Sanma, North is usually 1 fan regardless (Nukidora).
    const finalHan = baseHan + state.kitaCount;
    const finalResult = { ...result, han: finalHan };
    const isDealer = state.isDealer ?? false;
    const points = calculatePoints(finalResult, isDealer, true).total;

    return { finalHan, points };
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
    kitaCount: number;
    trials: number;
    currentTurn: number;
    isDealer: boolean;
    validationMode?: boolean;
};

export type DiscardResult = {
    action: Action;
    winRate: number;
    avgScore: number;
    ev: number;
    ronRate: number;
    tenpaiRate: number;
    effectiveTiles?: { tile: Tile, count: number }[];
    shantenBefore: number;
    shantenAfter: number;
};

export type SimulationSummary = {
    remainingTiles: number;
    shanten: {
        normal: number;
        chiitoi: number;
        kokushi: number;
    };
};

export type SimulationPathResult = {
    type: 'win' | 'draw';
    point: number;
    isTenpai: boolean;
    initialRemainingTiles: number;
};

let debugSimCountGlobal = 0;

export function getWinningTiles(hand: Tile[], fixedMentsuCount: number): Tile[] {
    const wins: Tile[] = [];
    const allTiles = ALL_SANMA_TILES;
    for (const t of allTiles) {
        const tempHand = [...hand, t];
        if (calculateShanten(tempHand, fixedMentsuCount) === -1) {
            wins.push(t);
        }
    }
    return Array.from(new Set(wins));
}

export function runSinglePath(
    initialHand: Tile[],
    fixedMentsu: Mentsu[],
    initialAction: Action,
    allVisible: Tile[],
    initialKita: number,
    doraIndicators: Tile[],
    currentTurn: number,
    isDealer: boolean
): SimulationPathResult {
    debugSimCountGlobal++;

    const hand = [...initialHand];
    let nukidoraCount = initialKita;
    const doraInds = [...doraIndicators];
    const localFixedMentsu = [...fixedMentsu];

    // Initialize Counts
    const counts = getInitialCounts();
    for (const tile of allVisible) {
        const idx = TILE_TYPES.indexOf(tile);
        if (idx !== -1 && counts[idx] > 0) counts[idx]--;
    }

    let isRiichi = (initialAction.type === 'discard' || initialAction.type === 'ankan') ? !!initialAction.riichi : false;

    // If the initial action was a non-riichi discard, we should NOT automatically riichi on this turn to allow comparison.
    const disableAutoRiichi = (initialAction.type === 'discard' && !initialAction.riichi);

    let isDoubleRiichi = false;
    let isIppatsu = false;
    let isHaitei = false;
    let pathTurnCount = 0;
    let scoreAdjustment = 0;

    const NORTH = TILES.z4;

    const TOTAL_TILES = 108;
    const DEAD_WALL = 14;
    const PLAYABLE_TILES = TOTAL_TILES - DEAD_WALL; // 94
    const INITIAL_HANDS = 13 * 3; // 39 tiles dealt
    const doraCountValue = doraInds.length;
    const turnsPassed = currentTurn - 1;
    const drawsConsumed = turnsPassed * 3;

    // mountainSize represents only the DRAWABLE (live wall) tiles.
    let mountainSize = PLAYABLE_TILES - INITIAL_HANDS - doraCountValue - drawsConsumed - initialKita;

    // totalInvisibleCount represents ALL tiles we haven't seen yet (Live Wall + Dead Wall + Other's hidden hands).
    // This is the correct denominator for drawing probability of any unknown tile.
    let totalInvisibleCount = counts.reduce((sum, c) => sum + c, 0);

    if (debugSimCountGlobal <= 1) {
        console.log("Initial mountainSize (Live Wall):", mountainSize);
    }

    const initialTotalForSummary = mountainSize;

    const drawTileCore = (): Tile | null => {
        if (mountainSize <= 0) return null;
        if (totalInvisibleCount <= 0) return null;

        let rand = Math.floor(Math.random() * totalInvisibleCount);
        let safety = 0;
        for (let i = 0; i < counts.length; i++) {
            safety++;
            if (safety > 1000) {
                throw new Error("Infinite loop detected in drawTileCore");
            }
            if (rand < counts[i]) {
                const tile = TILE_TYPES[i];
                counts[i]--;
                totalInvisibleCount--;
                mountainSize--;
                return tile;
            }
            rand -= counts[i];
        }
        return null;
    };

    const drawTileWithAutoKita = (): Tile | null => {
        let safety = 0;
        while (true) {
            safety++;
            if (safety > 1000) {
                throw new Error("Infinite loop detected in drawTileWithAutoKita");
            }

            if (mountainSize <= 0) return null;

            let tile = drawTileCore();
            if (!tile) return null;

            if (tile === NORTH) {
                nukidoraCount++;
                continue;
            }
            return tile;
        }
    };

    const getCurrentDoraCount = () => countDora(hand, doraInds, localFixedMentsu, nukidoraCount);
    const isValidWin = (result: YakuResult) => validateAgari(result);

    const checkAndApplyRiichi = () => {
        if (disableAutoRiichi) return;
        if (localFixedMentsu.length === 0 && !isRiichi && calculateShanten(hand, 0) === 0) {
            isRiichi = true;
            isIppatsu = true;
            scoreAdjustment -= 1000;
        }
    };

    const performGreedyDiscard = (): boolean => {
        if (hand.length === 0) return false;
        let bestDiscardIndex = -1;
        let minShantenFound = 99;
        let maxUkeireFound = -1;

        for (let i = 0; i < hand.length; i++) {
            const removed = hand[i];
            hand.splice(i, 1);
            const s = calculateShanten(hand, localFixedMentsu.length);

            let ukeire = 0;
            if (s === 0) {
                const wins = getWinningTiles(hand, localFixedMentsu.length);
                for (const w of wins) {
                    const idx = TILE_TYPES.indexOf(w);
                    if (idx !== -1) ukeire += counts[idx];
                }
            }
            hand.splice(i, 0, removed);
            if (s < minShantenFound) {
                minShantenFound = s;
                maxUkeireFound = ukeire;
                bestDiscardIndex = i;
            } else if (s === minShantenFound) {
                if (ukeire > maxUkeireFound) {
                    maxUkeireFound = ukeire;
                    bestDiscardIndex = i;
                }
            }
        }
        if (bestDiscardIndex !== -1) {
            hand.splice(bestDiscardIndex, 1);
        } else {
            hand.pop();
        }
        checkAndApplyRiichi();
        return true;
    };

    // Correct Initial Hand (if North exists)
    let initialKitaSafety = 0;
    for (let i = hand.length - 1; i >= 0; i--) {
        initialKitaSafety++;
        if (initialKitaSafety > 100) throw new Error("Infinite loop detected in initial hand Kita check");
        if (hand[i] === NORTH) {
            hand.splice(i, 1);
            nukidoraCount++;
            const drawn = drawTileWithAutoKita();
            if (drawn) hand.push(drawn);
        }
    }

    // PHASE 1: INITIAL ACTION
    if (initialAction.type === 'tsumo') {
        const agariShanten = calculateShanten(hand, localFixedMentsu.length);
        if (agariShanten === -1) {
            const patterns = getAgariPatterns(hand, localFixedMentsu);
            if (patterns[0]) {
                const state: GameState = {
                    bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                    isRiichi, isDoubleRiichi: false, isIppatsu, isTsumo: true,
                    isRinshan: false, isChankan: false, isHaitei, isHoutei: false,
                    kitaCount: nukidoraCount, doraCount: getCurrentDoraCount(), uraDoraCount: 0,
                    winningTile: hand[hand.length - 1], isDealer, turnCount: currentTurn,
                    hasCallOccurred: false, discardCount: 0
                };

                if (isRiichi) {
                    let tempPool = totalInvisibleCount;
                    let tempCounts = [...counts];
                    let uraDoraCount = 0;
                    for (let d = 0; d < doraInds.length; d++) {
                        if (tempPool <= 0) break;
                        let rand = Math.floor(Math.random() * tempPool);
                        for (let j = 0; j < tempCounts.length; j++) {
                            if (rand < tempCounts[j]) {
                                const uraInd = TILE_TYPES[j];
                                const uraDoraValue = getDoraValue(uraInd);
                                for (const t of hand) if (toNormalFive(t) === uraDoraValue) uraDoraCount++;
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

                const result = calculateScore(hand, patterns[0], state);
                if (isValidWin(result)) {
                    const { points } = resolveFinalScore(result, state);
                    return { type: 'win', point: points + scoreAdjustment, isTenpai: true, initialRemainingTiles: initialTotalForSummary };
                }
            }
        }
        return { type: 'draw', point: 0, isTenpai: agariShanten <= 0, initialRemainingTiles: initialTotalForSummary };
    }

    if (initialAction.type === 'discard') {
        const dIdx = hand.indexOf(initialAction.tile);
        hand.splice(dIdx !== -1 ? dIdx : hand.length - 1, 1);
        if (initialAction.riichi) {
            isRiichi = true;
            isIppatsu = true;
            scoreAdjustment -= 1000;
        } else {
            checkAndApplyRiichi();
        }
    } else if (initialAction.type === 'kita') {
        const kIdx = hand.indexOf(NORTH);
        if (kIdx !== -1) {
            hand.splice(kIdx, 1);
            nukidoraCount++;
            const drawn = drawTileWithAutoKita();
            if (drawn) hand.push(drawn);
            performGreedyDiscard();
        }
    } else if (initialAction.type === 'ankan') {
        const normTile = toNormalFive(initialAction.tile);
        let removedCount = 0;
        for (let i = hand.length - 1; i >= 0; i--) {
            if (toNormalFive(hand[i]) === normTile) {
                hand.splice(i, 1);
                removedCount++;
                if (removedCount === 4) break;
            }
        }
        localFixedMentsu.push({ type: 'kantsu', tile: normTile, tiles: getKanTiles(normTile), isOpen: false, isKan: true });
        if (initialAction.riichi) {
            isRiichi = true;
            isIppatsu = true;
            scoreAdjustment -= 1000;
        } else {
            checkAndApplyRiichi();
        }
        const drawn = drawTileWithAutoKita();
        if (drawn) hand.push(drawn);
        performGreedyDiscard();
    } else if (initialAction.type === 'kakan') {
        const normTile = toNormalFive(initialAction.tile);
        const kakanIdx = hand.findIndex(t => toNormalFive(t) === normTile);
        if (kakanIdx !== -1) hand.splice(kakanIdx, 1);
        const pon = localFixedMentsu.find(m => m.type === 'koutsu' && m.tile === normTile);
        if (pon) { pon.type = 'kantsu'; pon.isKan = true; pon.tiles.push(initialAction.tile); }
        const drawn = drawTileWithAutoKita();
        if (drawn) hand.push(drawn);
        performGreedyDiscard();
    }

    // SIMULATION LOOP
    let simLoopSafety = 0;
    while (mountainSize > 0) {
        simLoopSafety++;
        if (simLoopSafety > 1000) throw new Error("Infinite loop detected in simulation loop");

        pathTurnCount++;
        if (mountainSize <= 0) break;

        // Opponents (Simulated as random counts reduction)
        for (let j = 0; j < 2; j++) {
            if (mountainSize <= 0) break;
            drawTileCore(); // Just discard it
        }

        if (mountainSize <= 0) break;

        // My Draw
        const drawn = drawTileWithAutoKita();
        if (!drawn) break;
        hand.push(drawn);

        if (mountainSize <= 0) isHaitei = true;

        if (calculateShanten(hand, localFixedMentsu.length) === -1) {
            const patterns = getAgariPatterns(hand, localFixedMentsu);
            if (patterns.length > 0) {
                const state: GameState = {
                    bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                    isRiichi, isDoubleRiichi, isIppatsu, isTsumo: true,
                    isRinshan: false, isChankan: false, isHaitei, isHoutei: false,
                    kitaCount: nukidoraCount, doraCount: getCurrentDoraCount(), uraDoraCount: 0,
                    winningTile: hand[hand.length - 1], isDealer, turnCount: currentTurn + pathTurnCount,
                    hasCallOccurred: localFixedMentsu.some(m => m.isOpen || m.isKan) || nukidoraCount > 0,
                    discardCount: 0
                };

                if (isRiichi) {
                    // Simulate Ura-dora
                    let tempPool = totalInvisibleCount;
                    let tempCounts = [...counts];
                    let uraDoraCount = 0;
                    for (let d = 0; d < doraInds.length; d++) {
                        if (tempPool <= 0) break;
                        let rand = Math.floor(Math.random() * tempPool);
                        for (let j = 0; j < tempCounts.length; j++) {
                            if (rand < tempCounts[j]) {
                                const uraInd = TILE_TYPES[j];
                                const uraDoraValue = getDoraValue(uraInd);
                                for (const t of hand) if (toNormalFive(t) === uraDoraValue) uraDoraCount++;
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

                const result = calculateScore(hand, patterns[0], state);
                if (isValidWin(result)) {
                    const { points } = resolveFinalScore(result, state);
                    return { type: 'win', point: points + (isRiichi ? 1000 : 0) + scoreAdjustment, isTenpai: true, initialRemainingTiles: initialTotalForSummary };
                }
            }
        }

        if (isRiichi) { hand.pop(); isIppatsu = false; }
        else if (!performGreedyDiscard()) break;
    }

    return { type: 'draw', point: scoreAdjustment + (calculateShanten(hand, localFixedMentsu.length) <= 0 ? 1000 : -1000), isTenpai: calculateShanten(hand, localFixedMentsu.length) <= 0, initialRemainingTiles: initialTotalForSummary };
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
    if (isKokushiMusou(hand)) {
        const result: YakuResult = { han: 13, fu: 0, yaku: ["国士無双"], yakuList: [{ name: "国士無双", han: 13 }], yakuman: true, yakumanMultiplier: 1 };
        const score = calculatePoints(result, config.isDealer, true);
        return { bestYaku: result, bestScore: score, bestStructure: { head: -1 as Tile, mentsu: [] }, allPatterns: [{ yaku: result, score, structure: { head: -1 as Tile, mentsu: [] } }] };
    }

    const state: GameState = {
        bakaze: TILES.z1, jikaze: config.isDealer ? TILES.z1 : TILES.z2,
        isRiichi: false, isDoubleRiichi: false, isIppatsu: false, isTsumo: true,
        isRinshan: false, isChankan: false, isHaitei: false, isHoutei: false,
        kitaCount: config.kitaCount, doraCount: countDora(hand, config.doraIndicators, [], config.kitaCount),
        uraDoraCount: 0, winningTile: hand[hand.length - 1], isDealer: config.isDealer,
        turnCount: config.currentTurn, hasCallOccurred: config.kitaCount > 0 || config.fixedMentsu.some(m => m.isOpen || m.isKan),
        discardCount: config.myDiscards.length
    };

    if (isChiitoitsu(hand)) {
        const result = calculateScore(hand, { head: -1 as Tile, mentsu: [] }, state);
        if (!validateAgari(result)) return null;
        const score = calculatePoints(result, config.isDealer, true);
        return { bestYaku: result, bestScore: score, bestStructure: { head: -1 as Tile, mentsu: [] }, allPatterns: [{ yaku: result, score, structure: { head: -1 as Tile, mentsu: [] } }] };
    }

    const patterns = getAgariPatterns(hand, config.fixedMentsu || []);
    if (patterns.length === 0) return null;

    const evaluated = patterns.map(structure => {
        const result = calculateScore(hand, structure, state);
        if (!validateAgari(result)) return null;
        return { yaku: result, score: calculatePoints(result, config.isDealer, true), structure };
    }).filter(p => p !== null) as { yaku: YakuResult, score: ScoreResult, structure: HandStructure }[];

    if (evaluated.length === 0) return null;
    const sorted = [...evaluated].sort((a, b) => b.yaku.han - a.yaku.han);

    return { bestYaku: sorted[0].yaku, bestScore: sorted[0].score, bestStructure: sorted[0].structure, allPatterns: evaluated };
}

export function countDora(hand: Tile[], doraInds: Tile[], fixedMentsu: Mentsu[] = [], kitaCount: number = 0): number {
    let count = 0;
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
