import { TILES } from './core/tile';
import { scoreWinningHandFast, GameState } from './simulation/engine';

const hand = [
    TILES.p2, TILES.p2, 
    TILES.p5r, TILES.p5,
    TILES.p9, TILES.p9,
    TILES.s5, // Not sorted!
    TILES.s6, TILES.s6,
    TILES.s7, TILES.s7,
    TILES.s5, // the winning tile appended at the end
    TILES.z7, TILES.z7
];

const state: GameState = {
    isDealer: true,
    isTsumo: true,
    isRiichi: true,
    turnCount: 8,
    discardCount: 8,
    hasCallOccurred: false,
    doraCount: 2, // 22p
    uraDoraCount: 0,
    kitaCount: 1, // Own 1
    bakaze: TILES.z1,
    jikaze: TILES.z1,
    winningTile: TILES.s5
};

const structure = { head: -1 as any, mentsu: [] };

const res = scoreWinningHandFast(hand, structure, state);
console.log("Result NOT sorted:", res);

const handSorted = [...hand].sort((a, b) => a - b);
const resSorted = scoreWinningHandFast(handSorted, structure, state);
console.log("Result SORTED:", resSorted);
