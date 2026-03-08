// @ts-nocheck

import { runSinglePath } from '../simulation/engine';
import type { Action, Tile } from '../simulation/engine';
import { TILES } from './tile';

console.log("=== Kakan Dora EV Verification Test ===");

// Scenario:
// Hand is Tenpai for Tsumo Win.
// We make a Kakan.
// The new Dora Indicator triggers MORE Dora for the hand to increase score.
// If EV does not change, then Dora is not being applied.

// Hand: 456p 789s 11z 55z. (Wait for any Tsumo? No, need valid form).
// Let's use:
// Fixed: Pon(1m).
// Hand: 1m (for kakan). 22p 333s 789p 11z.
// Kakan 1m.
// Draw Rinshan (doesn't matter, say 1z).
// Discard 1z.
// New Dora Indicator: 1p -> 2p is Dora.
// Hand has 22p (2 Dora). Score should boost.

function testKakanDora() {
    console.log("--- Test Case: Kakan Increases Dora ---");

    const createWalls = () => {
        const live = new Array(50).fill(TILES.s1); // Dummy
        const dead = new Array(14).fill(TILES.z2);
        return { live, dead };
    };

    const hand = [
        TILES.m1, // For Kakan
        TILES.p2, TILES.p2, // Potential Dora
        TILES.s3, TILES.s3, TILES.s3,
        TILES.p7, TILES.p8, TILES.p9,
        TILES.z1, TILES.z1 // Pair
    ];

    const fixedMentsu: any[] = [{
        type: 'koutsu', tile: 0, tiles: [TILES.m1, TILES.m1, TILES.m1], isOpen: true, isKan: false
    }];

    // 1. Without Kakan (Discard m1)
    // Dora Ind: None (or initial).
    // Let's say initial Dora Ind is z2 -> z3. No effect.
    {
        const { live, dead } = createWalls();
        // Setup Tsumo win later
        live[0] = TILES.z1; // Next draw matches pair -> Win

        const action: Action = { type: 'discard', tile: TILES.m1 };

        // Initial Dora: z2
        const scoreNoKakan = runSinglePath([...hand], fixedMentsu, action, live, dead, 0, [TILES.z2], 1, false).point;
        console.log(`Score No Kakan: ${scoreNoKakan}`);
    }

    // 2. With Kakan
    // Logic:
    // Kakan m1.
    // Draw Rinshan (s1). Discard s1.
    // New Dora Ind added.
    // We want New Dora Ind to be 1p (so 2p becomes Dora).
    // Dead Wall:
    // [Ind1, Ind2 (Kakan), Rinshan, ...]
    // Rinshan is popped from End.
    // Dora Ind is popped from End-1? Or Start?
    // In engine: `doraInds.push(currentDeadWall.pop()!)`
    // So it pops from the "End" of the array (which represents the physical 'dead wall' stack top).

    // Setup Dead Wall:
    // Top (End): Rinshan (s1).
    // Next (End-1): New Dora Ind (1p).

    // After Kakan:
    // Hand has 22p. 1p -> 2p Dora. 2 Han added.
    // Next Draw: z1 (Win).

    {
        const { live, dead } = createWalls();
        live[0] = TILES.z1; // Win on next draw

        // Setup Dead Wall
        const deadLen = dead.length;
        dead[deadLen - 1] = TILES.s1; // Rinshan
        dead[deadLen - 2] = TILES.p1; // New Dora Indicator -> 2p is Dora

        const action: Action = { type: 'kakan', tile: TILES.m1 };

        const scoreKakan = runSinglePath([...hand], JSON.parse(JSON.stringify(fixedMentsu)), action, live, dead, 0, [TILES.z2], 1, false).point;
        console.log(`Score With Kakan: ${scoreKakan}`);

        if (scoreKakan > 5000 && scoreKakan > 0) { // Rough check
            console.log("[PASS] Kakan score is high (likely includes Dora).");
        } else {
            console.log("[FAIL] Kakan score is low.");
        }
    }
}

testKakanDora();
