import { getAgariPatterns } from './src/core/shanten';
import { scoreWinningHandFast } from './src/simulation/engine';
import { calculateScore, GameState } from './src/core/yaku';
import { TILES } from './src/core/tile';
import { performance } from 'perf_hooks';

function generateRandomHand(isMenzen: boolean): { hand: number[], winTile: number } {
    // Basic stub, we will just use predetermined test cases instead for reliable coverage
    return { hand: [], winTile: 0 };
}

const testCases = [
    {
        name: "Ittsu (Menzen)",
        hand: [
            TILES.p1, TILES.p3, TILES.p4, TILES.p5, TILES.p6,
            TILES.p7, TILES.p8, TILES.p9,
            TILES.s4, TILES.s5, TILES.s6, TILES.s7, TILES.s7
        ],
        winTile: TILES.p2,
        state: { isRiichi: true, isTsumo: true }
    },
    {
        name: "Shousangen",
        hand: [
            TILES.z5, TILES.z5,
            TILES.z6, TILES.z6, TILES.z6,
            TILES.z7, TILES.z7, TILES.z7,
            TILES.s1, TILES.s2, TILES.s3,
            TILES.p5, TILES.p5
        ],
        winTile: TILES.p5,
        state: { isRiichi: false, isTsumo: true }
    },
    {
        name: "Chanta",
        hand: [
            TILES.p1, TILES.p2, TILES.p3,
            TILES.s7, TILES.s8, TILES.s9,
            TILES.s1, TILES.s2, TILES.s3,
            TILES.z1, TILES.z1, TILES.z2, TILES.z2
        ],
        winTile: TILES.z2,
        state: { isRiichi: true, isTsumo: true }
    },
    {
        name: "User Reported Case (Ittsu Wait 7p)",
        hand: [
            TILES.p1, TILES.p3, TILES.p4, TILES.p5, TILES.p6, TILES.p7, TILES.p8, TILES.p9,
            TILES.s4, TILES.s5, TILES.s6, TILES.s7, TILES.s7
        ], // 13456789p45677s (after discarding 7p)
        winTile: TILES.p2, // Winning on 2p completes ittsu
        state: { isRiichi: true, isTsumo: true }
    },
    {
        name: "Rinshan Kaihou",
        hand: [
            TILES.p1, TILES.p1, TILES.p1, TILES.p2, TILES.p3, TILES.p4,
            TILES.s1, TILES.s2, TILES.s3,
            TILES.z1, TILES.z1, TILES.z2, TILES.z2
        ],
        winTile: TILES.z2,
        state: { isRiichi: false, isTsumo: true, isRinshan: true } // Rinshan
    }
];

let mismatches = 0;

for (const tc of testCases) {
    const comp = [...tc.hand, tc.winTile].sort((a, b) => a - b);
    const pattern = getAgariPatterns(comp, [])[0];
    if (!pattern) continue;

    // Convert to GameState for both
    const state: GameState = {
        bakaze: TILES.z1,
        jikaze: TILES.z1,
        isRiichi: tc.state.isRiichi,
        isDoubleRiichi: false,
        isIppatsu: false,
        isTsumo: tc.state.isTsumo,
        isRinshan: tc.state.isRinshan || false,
        isChankan: false,
        isHaitei: false,
        isHoutei: false,
        kitaCount: 0,
        doraCount: 0,
        uraDoraCount: 0,
        winningTile: tc.winTile,
        hasCallOccurred: false,
        isDealer: true,
        turnCount: 7,
        discardCount: 7
    };

    const fastRes = scoreWinningHandFast(comp, pattern, state);
    const fullRes = calculateScore(comp, pattern, state);

    if (fastRes.han !== fullRes.han) {
        console.log(`[MISMATCH] ${tc.name} | Fast Han: ${fastRes.han} | Full Han: ${fullRes.han}`);
        console.log(`   Full Yaku: ${fullRes.yaku.join(', ')}`);
        mismatches++;
    } else {
        console.log(`[MATCH] ${tc.name} | Han: ${fastRes.han}`);
    }
}

if (mismatches === 0) {
    console.log("All manual cases match!");
}

// BENCHMARK STRUCTURE
const benchComp = [...testCases[0].hand, testCases[0].winTile].sort((a, b) => a - b);
const benchPattern = getAgariPatterns(benchComp, [])[0];
const benchState: GameState = {
    bakaze: TILES.z1, jikaze: TILES.z1, isRiichi: true, isDoubleRiichi: false, isIppatsu: false, isTsumo: true, isRinshan: false, isChankan: false, isHaitei: false, isHoutei: false, kitaCount: 0, doraCount: 0, uraDoraCount: 0, winningTile: testCases[0].winTile, hasCallOccurred: false, isDealer: true, turnCount: 7, discardCount: 7
};

const ITERATIONS = 1000000;
console.log(`\nStarting benchmark: ${ITERATIONS} iterations...`);
const start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    scoreWinningHandFast(benchComp, benchPattern, benchState);
}
const end = performance.now();
console.log(`Fast Benchmark: Total time ${(end - start).toFixed(2)} ms`);
console.log(`Average: ${((end - start) * 1000 / ITERATIONS).toFixed(4)} microseconds per call`);
