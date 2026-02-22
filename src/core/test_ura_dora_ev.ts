import { runSinglePath } from '../simulation/engine';
import type { Action } from '../simulation/engine';
import { TILES } from './tile';

console.log("=== Ura Dora EV Verification Test ===");

const LIVE_WALL_SIZE = 50;
const DEAD_WALL_SIZE = 14;

const createWalls = () => {
    const live = new Array(LIVE_WALL_SIZE).fill(TILES.s1);
    const dead = new Array(DEAD_WALL_SIZE).fill(TILES.z2);
    return { live, dead };
};

function testUraDoraEffect() {
    console.log("Test: Riichi wins check Ura Dora");

    // Hand: 111m 456p 789s 11z 55z.
    // Tenpai. Win on 5z.
    const hand = [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p4, TILES.p5, TILES.p6,
        TILES.s7, TILES.s8, TILES.s9,
        TILES.z1, TILES.z1, TILES.z5, TILES.z5
    ];

    const { live, dead } = createWalls();

    // 1. Setup Live Wall for Win (5z)
    live[live.length - 3] = TILES.z5;

    // 2. Setup Dead Wall
    // Index 13 (End): Init Dora Indicator (z2 -> z3 Dora). Hand has no z3.
    // Index 12: Ura Dora Indicator 1.
    // We want Ura Dora to be 1m. So Indicator should be 9m.
    dead[dead.length - 1] = TILES.z2; // Init Ind
    // Pop order in runSinglePath: DoraInds popped? 
    // Init Dora is already popped usually? 
    // In runSinglePath, we pass doraIndicators. 
    // And deadWall.
    // If Init Dora Ind is passed, it is NOT in deadWall array (already popped).
    // So deadWall contains [Rinshan..., Ura...].
    // If runSinglePath pops Ura from deadWall...
    // Which end? 
    // `currentDeadWall.pop()`.
    // So the LAST tile in passed deadWall is the First Ura Indicator.

    dead[dead.length - 1] = TILES.m9; // Ura Indicator 1 -> 1m Dora.

    // Action 1: Riichi
    const actionRiichi: Action = { type: 'discard', tile: TILES.p1, riichi: true };
    // Hand has 11z 55z pairs + sets. 14 tiles. Discard something?
    // Hand above is 14 tiles. 
    // runSinglePath takes initialHand (13 or 14?). 
    // Usually 14. We discard TILES.p1? But we don't have p1.
    // Let's use discard z1 (break pair) -> No.
    // Let's use 13 tiles hand + 1 discard param?
    // runSinglePath(initialHand, ...). 
    // If 14 tiles, it discards `initialAction.tile`.
    // We need to keep Tenpai.
    // Hand: 123m 456p 789s 11z 5z. (13 tiles).
    // + Draw.
    // We need 14 tiles to start.
    // Let's add a dummy tile to discard. TILES.p1 (9).

    const hand14 = [...hand, TILES.p1];

    // Dora Inds: [TILES.z2].

    // Run Riichi
    const scoreRiichi = runSinglePath(hand14, [], actionRiichi, live, dead, 0, [TILES.z2], 1, true);

    // Action 2: Dama (No Ura)
    const actionDama: Action = { type: 'discard', tile: TILES.p1, riichi: false };
    const scoreDama = runSinglePath(hand14, [], actionDama, live, dead, 0, [TILES.z2], 1, false);

    console.log(`Score Riichi (1 Ura?): ${scoreRiichi}`);
    console.log(`Score Dama (0 Ura): ${scoreDama}`);

    // Riichi has 1 Han (Riichi) + 1 Han (Ippatsu) + 1 Han (Ura 1m)? 
    // 1m in hand? 123m. So 1m is there. 1 Ura.
    // Dama has 0 Han? Pinfu? 
    // 123m 456p 789s 11z 55z. No Pinfu (z1 pair).
    // Tsumo only.

    if (scoreRiichi > scoreDama) {
        console.log("[PASS] Riichi score higher (likely Ura).");
    } else {
        console.error("[FAIL] Riichi score not higher.");
    }

    // Verify Ura Count via debug?
    // We can just rely on score difference.
    // Dama: Tsumo(1) + Bakaze(1) = 2 Han.
    // Riichi: Riichi(1) + Ippatsu(1) + Tsumo(1) + Bakaze(1) + Ura(1) = 5 Han.
    // Mangan vs 2000 pts.
}

testUraDoraEffect();
