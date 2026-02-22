import { runSinglePath } from '../simulation/engine';
import type { Action } from '../simulation/engine';
import { TILES } from './tile';

console.log("=== Kan Dora EV Verification Test ===");

const LIVE_WALL_SIZE = 50;
const DEAD_WALL_SIZE = 14;

const createWalls = () => {
    const live = new Array(LIVE_WALL_SIZE).fill(TILES.s1);
    const dead = new Array(DEAD_WALL_SIZE).fill(TILES.z2);
    return { live, dead };
};

function testKanDoraEffect() {
    console.log("Test: Ankan increases score via Kan Dora");

    // Hand: 1111m 456p 789s 11z 55z. (14 tiles).
    // Structure: 1111m (Quad potential), 456p (Set), 789s (Set), 11z (Pair), 55z (Pair).
    // This is Shanpon wait (Tenpai).

    const hand = [
        TILES.m1, TILES.m1, TILES.m1, TILES.m1,
        TILES.p4, TILES.p5, TILES.p6,
        TILES.s7, TILES.s8, TILES.s9,
        TILES.z1, TILES.z1, TILES.z5, TILES.z5
    ];

    const { live, dead } = createWalls();

    // Setup Dead Wall.
    // Ankan pops 2 tiles: 1. Rinshan (Last), 2. Kan Dora Ind (Second Last).
    // So we need m9 at dead[dead.length - 2].
    dead[dead.length - 2] = TILES.m9; // Kan Dora Ind -> m1 Dora.

    // Also setup Ura Dora for Bonus check
    // dead[length-1] = Rinshan (Popped)
    // dead[length-2] = Kan Dora Ind (Popped)
    // Remaining Dead Wall End:
    // dead[length-3] = Ura for Init (matches doraInds[0]) ?
    // dead[length-4] = Ura for Kan (matches doraInds[1]) ?
    // Based on loop: i=0 (Init) gets dead[last]. 
    // So dead[dead.length - 3] should be Ura Ind 1.
    // dead[dead.length - 4] should be Ura Ind 2 (Kan Ura).

    // Let's set Kan Ura (Ura 2) to m9 as well to boost score further.
    dead[dead.length - 4] = TILES.m9;

    // Setup Winning Tile (Z5) in Live Wall (for Tsumo)
    // Opponent 1 (1), Opponent 2 (1), Me (1).
    // Me draws at index length - 3.
    live[live.length - 3] = TILES.z5;

    // Case 1: Ankan m1
    // - Remove 1111m.
    // - Draw Rinshan (random). Discard random.
    // - Hand: 456p 789s 11z 55z.
    // - Draw z5 -> 555z. Agari!
    // - Dora: 1m x4 (Kan Dora).
    // Case 1: Ankan m1 + Riichi
    // We expect 4 Kan Dora + Ura Dora.
    const actionAnkan: Action = { type: 'ankan', tile: TILES.m1, riichi: true };
    const scoreAnkan = runSinglePath([...hand], [], actionAnkan, live, dead, 0, [TILES.z2], 1, false).point;

    // Case 2: Normal Riichi (Discard m1)
    // We expect 0 Kan Dora + Ura Dora (1 indicator).
    const actionRiichi: Action = { type: 'discard', tile: TILES.m1, riichi: true };
    const scoreRiichi = runSinglePath([...hand], [], actionRiichi, live, dead, 0, [TILES.z2], 1, false).point;

    console.log(`Score Normal Riichi: ${scoreRiichi}`);
    console.log(`Score Ankan Riichi: ${scoreAnkan}`);

    // Score should be much higher.
    // 0 Dora -> ~3000 pts?
    // 4 Dora -> ~12000 pts (Haneman/Mangan)?

    if (scoreAnkan > scoreRiichi * 2 && scoreAnkan > 0) {
        console.log("[PASS] Kan Dora dramatically increased score.");
    } else {
        console.error("[FAIL] Kan Dora did not increase score as expected.");
    }
}

testKanDoraEffect();
