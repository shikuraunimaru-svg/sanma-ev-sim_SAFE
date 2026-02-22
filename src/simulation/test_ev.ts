
import { runSinglePath } from './engine';
import type { Action } from './engine';
import { TILES } from '../core/tile';

function testEv() {
    console.log("Running EV Verification...");

    // Hand: 111m 456p 789s 555z 1z (Tenpai waiting for Head)
    const hand = [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p4, TILES.p5, TILES.p6,
        TILES.s7, TILES.s8, TILES.s9,
        TILES.z5, TILES.z5, TILES.z5,
        TILES.z1, TILES.z1
    ];

    // Action: Discard z1 (breaks tenpai? No, assume we want to discard something else?)
    // Actually, if we discard z1, we are left with 4 complete melds. 
    // This is effectively "Naked Tanki" wait? No, we need a pair.
    // If we have 12 tiles (4 sets), we need a pair to win.
    // So current hand is 13 tiles. 
    // If we discard z1, we have 12 tiles.
    // Next draw... if we draw z1, we have pair?
    // 111m 456p 789s 555z + z1 + z1 = Win?
    // Yes.

    const action: Action = { type: 'discard', tile: TILES.z1 };

    // Create ample wall of winning tiles
    const wall = Array(50).fill(TILES.z1);
    const deadWall = Array(14).fill(TILES.z2);

    // Run multiple trials? runSinglePath is single.
    let totalScore = 0;
    const trials = 10;

    for (let i = 0; i < trials; i++) {
        const score = runSinglePath(
            hand,
            [],
            action,
            [...wall],
            [...deadWall],
            0,
            [TILES.p1],
            0,
            true,
            false // debugLog off for loop
        );
        totalScore += score;
    }

    console.log("Average Score:", totalScore / trials);
    if (totalScore > 0) {
        console.log("SUCCESS: EV > 0");
    } else {
        console.log("FAILURE: EV is 0");
    }
}

testEv();
