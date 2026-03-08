// @ts-nocheck

import { runSinglePath } from '../simulation/engine';
import type { Action } from '../simulation/engine';
import { TILES } from './tile';

console.log("=== Double Riichi & Haitei Verification ===");

const createWalls = (liveSize: number = 50) => {
    const live = new Array(liveSize).fill(TILES.s1);
    const dead = new Array(14).fill(TILES.z2); // Dora Ind z2 -> z3
    // Set winning tile z5 for normal Tsumo at a specific spot if needed
    // But we overwrite for specific tests.
    return { live, dead };
};

// Hand: 111m 456p 789s 11z 55z (Tenpai for z5).
// 13 tiles.
const hand = [
    TILES.m1, TILES.m1, TILES.m1,
    TILES.p4, TILES.p5, TILES.p6,
    TILES.s7, TILES.s8, TILES.s9,
    TILES.z1, TILES.z1,
    TILES.z5, TILES.z5
];
// Add discard tile.
const hand14 = [...hand, TILES.m1];

function testDoubleRiichi() {
    console.log("--- Test Case 1: Double Riichi ---");
    // Turn 1, No calls.
    const { live, dead } = createWalls();
    // Setup winning tile immediately? 
    // If we win immediately in loop, we get Tsumo + Riichi.
    // Let's set winning tile z5 at "My Next Draw".
    // Loop 1: Opp1(pop), Opp2(pop), Me(pop).
    // live needs z5 at index live.length - 3.
    live[live.length - 3] = TILES.z5;

    // Action: Discard m1, Riichi.
    const action: Action = { type: 'discard', tile: TILES.m1, riichi: true };

    // Use Dora Indicator m9 -> m1 Dora. Hand has 3 m1. (3 Dora).
    // Double Riichi (2) + Ippatsu (1) + Tsumo (1) + Haku (1) + Dora (3) = 8 Han (Baiman).
    // Normal Riichi (1) + Ippatsu (1) + Tsumo (1) + Haku (1) + Dora (3) = 7 Han (Haneman).

    // Current Turn = 1.
    const score = runSinglePath([...hand14], [], action, live, dead, 0, [TILES.m9], 1, false).point;
    console.log(`Score Double Riichi: ${score}`);

    // Normal Riichi (Turn 2)
    console.log("--- Test Case 2: Normal Riichi (Turn 2) ---");
    // All same, but Turn = 2.
    const { live: live2, dead: dead2 } = createWalls();
    live2[live2.length - 3] = TILES.z5;

    const scoreNormal = runSinglePath([...hand14], [], action, live2, dead2, 0, [TILES.m9], 2, false).point;
    console.log(`Score Normal Riichi: ${scoreNormal}`);

    // Double Riichi (2 han) vs Riichi (1 han).
    // Score should differ by roughly 1 han value (e.g. 2000 -> 3900 or similar).
    if (score > scoreNormal) {
        console.log("[PASS] Double Riichi score > Normal Riichi score.");
    } else {
        console.error(`[FAIL] Double Riichi score ${score} vs Normal ${scoreNormal}.`);
    }
}

function testHaitei() {
    console.log("--- Test Case 3: Haitei ---");
    // Setup Live Wall such that next draw is the LAST tile.
    // Me(1), Opp1(1), Opp2(1)? No, 3 players.
    // Consumption: Opp1(1), Opp2(1)?
    // Engine: 
    // if (currentLiveWall.length >= 2) { pop; pop; }
    // pop();
    // So 3 tiles consumed per "Sim Turn".

    // We want liveWall such that after 1 Sim Turn, it is empty.
    // Stack: [TILES.z5, TILES.s1, TILES.s1]
    // Pop: s1 (Opp1), s1 (Opp2), z5 (Me and Last).
    // Then currentLiveWall.length === 0.

    const liveSmall = [TILES.z5, TILES.s1, TILES.s1];
    const dead = new Array(14).fill(TILES.z2);

    const action: Action = { type: 'discard', tile: TILES.m1, riichi: true };

    const scoreHaitei = runSinglePath([...hand14], [], action, liveSmall, dead, 0, [TILES.z2], 1, false).point;
    console.log(`Score Haitei: ${scoreHaitei}`);

    // Normal Tsumo (Not Haitei)
    // Wall has 6 tiles. 
    // [s1, s1, s1, z5, s1, s1]
    // Sim Turn 1: Consumes top 3 (s1, s1, z5).
    // Wait. My draw is the 3rd pop.
    // Stack is popped from End.
    // [0, 1, 2, 3, 4, 5]
    // Pop: 5, 4. My pop: 3.
    // If 3 is z5.
    // Remaining: 0, 1, 2. Length = 3. Not Haitei.
    const liveNormal = [TILES.s1, TILES.s1, TILES.s1, TILES.z5, TILES.s1, TILES.s1];

    const scoreNormal = runSinglePath([...hand14], [], action, liveNormal, dead, 0, [TILES.z2], 1, false).point;
    console.log(`Score Normal Tsumo: ${scoreNormal}`);

    if (scoreHaitei > scoreNormal) {
        console.log("[PASS] Haitei score > Normal score.");
    } else {
        console.log(`[FAIL] Haitei score ${scoreHaitei} vs Normal ${scoreNormal}`);
    }
}

testDoubleRiichi();
testHaitei();
