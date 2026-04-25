/**
 * Fuzz validation: compares Full scorer (yaku.ts) vs Fast scorer (engine.ts).
 * For each random agari hand, tests one winningTile and simple state combo.
 */
import { calculateScore, GameState } from './src/core/yaku';
import { scoreWinningHandFast } from './src/simulation/engine';
import { getAgariPatterns } from './src/core/shanten';
import { TILES, toNormalFive } from './src/core/tile';

const TILE_TYPES = [
    TILES.m1, TILES.m9,
    TILES.p1, TILES.p2, TILES.p3, TILES.p4, TILES.p5, TILES.p6, TILES.p7, TILES.p8, TILES.p9, TILES.p5r,
    TILES.s1, TILES.s2, TILES.s3, TILES.s4, TILES.s5, TILES.s6, TILES.s7, TILES.s8, TILES.s9, TILES.s5r,
    TILES.z1, TILES.z2, TILES.z3, TILES.z4, TILES.z5, TILES.z6, TILES.z7,
];

function buildPool(): number[] {
    const pool: number[] = [];
    for (const t of TILE_TYPES) {
        if (t === TILES.p5r || t === TILES.s5r) pool.push(t);
        else for (let i = 0; i < 4; i++) pool.push(t);
    }
    return pool;
}
const POOL = buildPool();

function getRandomHand(): number[] {
    const pool = POOL.slice().sort(() => Math.random() - 0.5);
    return pool.slice(0, 14).sort((a, b) => a - b);
}

let tested = 0;
let errors = 0;
const errorDetails: string[] = [];

const LIMIT = 2000;

while (tested < LIMIT) {
    const hand = getRandomHand();
    const patterns = getAgariPatterns(hand, []);
    if (patterns.length === 0) continue;
    tested++;

    // Use first pattern; pick a random tile from hand as winning tile
    const p = patterns[0];
    const wt = hand[Math.floor(Math.random() * hand.length)];

    // Test two representative states: riichi-tsumo and no-riichi-ron
    const states: GameState[] = [
        {
            bakaze: TILES.z1, jikaze: TILES.z2,
            isRiichi: true, isDoubleRiichi: false, isIppatsu: false,
            isTsumo: true, isRinshan: false, isChankan: false, isHaitei: false, isHoutei: false,
            kitaCount: 0, doraCount: 0, uraDoraCount: 0,
            winningTile: wt, hasCallOccurred: false, isDealer: false, turnCount: 5, discardCount: 5,
        },
        {
            bakaze: TILES.z1, jikaze: TILES.z1,
            isRiichi: false, isDoubleRiichi: false, isIppatsu: false,
            isTsumo: false, isRinshan: false, isChankan: false, isHaitei: false, isHoutei: false,
            kitaCount: 0, doraCount: 0, uraDoraCount: 0,
            winningTile: wt, hasCallOccurred: false, isDealer: true, turnCount: 5, discardCount: 5,
        },
    ];

    for (const state of states) {
        const fastRes = scoreWinningHandFast(hand, p, state);
        const fullRes = calculateScore(hand, p, state);

        if (fastRes.han !== fullRes.han) {
            const msg = `[MISMATCH] Hand:[${hand}] wt:${wt} riichi:${state.isRiichi} tsumo:${state.isTsumo} bakaze:${state.bakaze} | Fast:${fastRes.han} Full:${fullRes.han} | Yaku:[${fullRes.yaku.join(',')}]`;
            if (errorDetails.length < 30) errorDetails.push(msg);
            errors++;
        }
    }
}

for (const d of errorDetails) console.log(d);
console.log(`\nTested ${tested} agari hands. Mismatches: ${errors}`);
