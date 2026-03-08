// @ts-nocheck
import { runSinglePath } from '../simulation/engine';
import type { Action } from '../simulation/engine';
import { TILES } from './tile';

console.log("=== Ankan EV Verification Test ===");

const LIVE_WALL_SIZE = 50;
const DEAD_WALL_SIZE = 14;

const createWalls = () => {
    const live = new Array(LIVE_WALL_SIZE).fill(TILES.s1);
    const dead = new Array(DEAD_WALL_SIZE).fill(TILES.z2); // Rinshan will be z2
    return { live, dead };
};

function testAnkanRiichiEV() {
    console.log("Test: Ankan + Riichi vs Ankan + Dama");

    // Hand: 111m 444p 777s 11z. (Tenpai for 11z? No, 4 sets + 1 pair)
    // 111m (3), 444p (3), 777s (3), 11z (2). 11 tiles.
    // Ankan requires 4 tiles. 
    // Let's say we have 1111m in hand.
    // Hand: 1111m 444p 777s 11z. 13 tiles? No, 14 tiles.
    // 1111m (4), 444p (3), 777s (3), 11z (2) = 12 tiles. Need 2 more?
    // Sanma hand is 14 tiles.
    // 1111m 444p 777s 11z 22z. 14 tiles.

    // If we Ankan 1m:
    // Hand becomes: [1111m] fixed. 
    // Remaining hand: 444p 777s 11z 22z.
    // 444p (3), 777s (3), 11z (2), 22z (2). 10 tiles.
    // Draw Rinshan (z2).
    // Hand: 444p 777s 11z 222z.
    // Fixed: [1111m].
    // Total 14 tiles equivalent.
    // Structure: 444p + 777s + 222z + 11z (Head).
    // Tenpai? Yes, complete hand? Yes.
    // Wait, if Rinshan is z2, it's Tsumo Win (Rinshan Kaihou).

    // To test Riichi vs Dama, we need Rinshan to NOT win, but leave us Tenpai.
    // Hand: 1111m 444p 78s 11z 22z 99p.
    // Ankan 1m -> Fixed [1111m].
    // Hand: 444p 78s 11z 22z 99p. (10 tiles).
    // Draw Rinshan: 1s.
    // Hand: 444p 78s 1s 11z 22z 99p.
    // Discard 1s? No, we want to Riichi.
    // We want to be Tenpai.
    // 444p (Set), 11z (Head?), 22z (Head?), 99p (Head?).
    // Too many pairs. Chiitoi?

    // Simple Pinfu-ish shape.
    // 1111m 23p 456p 789s 11z. (13 tiles + draw = 14).
    // Ankan 1m.
    // Hand: 23p 456p 789s 11z. (9 tiles).
    // Draw Rinshan: 1p.
    // Hand: 123p 456p 789s 11z (Head).
    // Fixed: [1111m].
    // Tenpai: Yes (waiting for... wait, 123 456 789 11 + [1111]. That's 4 sets + 1 pair. AGARI!)
    // So Rinshan 1p makes it Agari.

    // We want Rinshan to NOT be Agari.
    // Rinshan = 9p.
    // Hand: 23p 456p 789s 11z 9p.
    // Discard 9p.
    // Hand: 23p 456p 789s 11z. (Tenpai waiting 1p/4p).
    // Here we can Riichi.

    const hand = [
        TILES.m1, TILES.m1, TILES.m1, TILES.m1,
        TILES.p2, TILES.p3,
        TILES.p4, TILES.p5, TILES.p6,
        TILES.s7, TILES.s8, TILES.s9,
        TILES.z1, TILES.z1
    ];

    // Set Rinshan to 9p (Safe tile, not improving).
    const { live, dead } = createWalls();
    if (dead.length > 0) dead[dead.length - 1] = TILES.p9; // Rinshan is popped from end?
    // Engine: currentDeadWall.pop()

    // Winning tile (1p) in Live wall for Ippatsu
    live[live.length - 3] = TILES.p1;
    live[live.length - 4] = TILES.p1;

    // Action: Ankan 1m
    const actionDama: Action = { type: 'ankan', tile: TILES.m1, riichi: false };
    const actionRiichi: Action = { type: 'ankan', tile: TILES.m1, riichi: true };

    const scoreDama = runSinglePath(hand, [], actionDama, live, dead, 0, [TILES.z2], 1, false);
    const scoreRiichi = runSinglePath(hand, [], actionRiichi, live, dead, 0, [TILES.z2], 1, false);

    console.log(`Ankan Dama Score: ${scoreDama}`);
    console.log(`Ankan Riichi Score: ${scoreRiichi}`);

    if (scoreRiichi > scoreDama) {
        console.log("[PASS] Ankan+Riichi Score > Ankan+Dama Score");
    } else {
        console.error("[FAIL] Ankan+Riichi Score <= Ankan+Dama Score");
    }
}

testAnkanRiichiEV();
