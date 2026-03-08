// @ts-nocheck

import { runSinglePath } from '../simulation/engine';
import type { Action, Tile } from '../simulation/engine';
import { TILES } from './tile';
import { getMentsu, Mentsu } from '../simulation/engine'; // Helper ? No, Mentsu is type.

console.log("=== Kakan Verification Test ===");

const createWalls = (liveSize: number = 50) => {
    const live = new Array(liveSize).fill(TILES.s1);
    const dead = new Array(14).fill(TILES.z2);
    return { live, dead };
};

function testKakan() {
    console.log("--- Test Case: Kakan ---");
    // Hand: 111m (Pon) + 1m (in hand). 456p 789s 11z. (10 tiles in hand + 1 fixed pon)
    // Structure: Pon(1m), 1m, 456p, 789s, 11z.
    // Length: 10.

    const hand = [
        TILES.m1, // The 4th tile
        TILES.p4, TILES.p5, TILES.p6,
        TILES.s7, TILES.s8, TILES.s9,
        TILES.z1, TILES.z1, TILES.s1 // Random tile to discard
    ];

    const fixedMentsu: any[] = [{
        type: 'koutsu',
        tile: 0, // m1 normal
        tiles: [TILES.m1, TILES.m1, TILES.m1],
        isOpen: true,
        isKan: false
    }];

    const { live, dead } = createWalls();
    // Setup Rinshan Tile: z5 (Win)
    // Rinshan is popped from dead wall.
    // dead[dead.length - 1] is Rinshan.
    dead[dead.length - 1] = TILES.z5;

    // Changing hand waiting tile to z5
    // Hand: 1m, 456p, 789s, 11z, s1.
    // Discard s1 -> 1m, 456p, 789s, 11z. 
    // Wait for what? Single wait on 1m? No, 1m is Kakan candidate.
    // Wait: 1m is NOT part of hand structure if it's meant for Kakan.
    // Proper structure:
    // Fixed: Pon(1m).
    // Hand: 456p 789s 11z (Wait starts here?).
    // If we have 10 tiles. 3 sets = 9. 1 left.
    // We need 13 tiles total usually (13 - 3*1 = 10).
    // Hand: 456p, 789s, 11z, z5 (Wait). + 1m (for Kakan).
    // Total 10 tiles.

    const handKakan = [
        TILES.m1,
        TILES.p4, TILES.p5, TILES.p6,
        TILES.s7, TILES.s8, TILES.s9,
        TILES.z1, TILES.z1,
        TILES.z5 // Winning tile match
    ];

    // Action: Kakan m1.
    // Logic:
    // 1. Remove m1. Hand: 456p...z5.
    // 2. Upgrade Pon to Kan.
    // 3. Draw Rinshan.
    //    Rinshan is z5.
    //    Hand: 456p...z5 + z5 = Pair.
    //    Win? 456p 789s 11z 55z.
    //    Wait, 11z and 55z. Two pairs.
    //    Sets: 456p, 789s, 11z(Pair). 55z(Pair).
    //    This is Shanpon/Tanki? No.
    //    If we have 456p 789s 11z and draw z5... we need 1 more z5 to win?
    //    No. 3 (Fixed) + 3 + 3 + 2 (Pair) + 2 (Pair).
    //    This is not a win with just one z5.
    //    We need: 456p 789s 11z 55z ? That's 14 tiles (incl fixed).
    //    Fixed: 1 kan (3 actual, 4 visual).
    //    Hand: 3+3+2+2 = 10. Total 13?
    //    Standard: 13 tiles + Draw = 14.
    //    Fixed Kan counts as 3 for "hand size" logic usually (or 0 if stripped).
    //    In this engine, fixedKan is independent.
    //    Start Hand: 10 tiles.
    //    Kakan -> Remove 1. 9 tiles.
    //    Draw Rinshan -> 10 tiles.
    //    Goal: 4 sets + 1 pair.
    //    Fixed: 1 set.
    //    Hand needs 3 sets + 1 pair.
    //    Current: 456p (Set), 789s (Set), 11z (Pair).
    //    We just need 1 more Set or Pair? 
    //    Wait, 1 Set + 1 Set + 1 Pair = 8 tiles.
    //    We have 9 tiles after removal.
    //    z5 is floating.
    //    If Rinshan is z5, we have z5 z5 (Pair).
    //    Structure: Set, Set, Pair, Pair. 7-pairs? No, need sets.
    //    We have 2 Pairs (11z, 55z). Not a win.

    // Let's make it a Tanki wait.
    // Hand: 456p, 789s, 111z (Pon).
    // Fixed: Pon(1m).
    // Hand: 9 tiles. + 1m for Kakan. = 10 tiles.
    // Kakan -> Remove 1m. 9 tiles.
    // Draw Rinshan (z5). 10 tiles.
    // Hand: 456p, 789s, 111z, z5.
    // This is valid win (Tanki z5).

    // Hand Setup
    const handTarget = [
        TILES.m1,
        TILES.p4, TILES.p5, TILES.p6,
        TILES.s7, TILES.s8, TILES.s9,
        TILES.z1, TILES.z1, TILES.z1
    ];

    // Action
    const action: Action = { type: 'kakan', tile: TILES.m1 };

    // Run
    const result = runSinglePath([...handTarget], fixedMentsu, action, live, dead, 0, [TILES.z2], 1, false);

    console.log(`Kakan Score: ${result.point}`);
    console.log(`Type: ${result.type}`);

    if (result.type === 'win' && result.point > 0) {
        console.log("[PASS] Kakan Rinshan Kaihou Win.");
    } else {
        console.error(`[FAIL] Expected win, got ${result.type}`);
    }
}

testKakan();
