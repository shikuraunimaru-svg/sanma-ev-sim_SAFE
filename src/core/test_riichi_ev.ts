import { runSinglePath } from '../simulation/engine';
import type { Action } from '../simulation/engine';
import { TILES } from './tile';

console.log("=== Riichi EV Verification Test ===");

const LIVE_WALL_SIZE = 54;
const DEAD_WALL_SIZE = 14;

// Helper to create walls
const createWalls = () => {
    const live = new Array(LIVE_WALL_SIZE).fill(TILES.s1); // Safe tiles
    const dead = new Array(DEAD_WALL_SIZE).fill(TILES.z2);
    return { live, dead };
};

// Test 1: Immediate Win (Tsumo) after Riichi
function testRiichiCost() {
    console.log("Test 1: Riichi Cost & Return Check");

    // Use a normal hand (not Yakuman) to see Score difference.
    // Hand: 111m 123p 456p 78s 11z. Draw 9s.
    // Yaku Dama: Bakaze(1) + Tsumo(1) = 2 Han. (11z is East/Round Wind)
    // Yaku Riichi: Riichi(1) + Ippatsu(1) + Bakaze(1) + Tsumo(1) = 4 Han.

    const hand = [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p1, TILES.p2, TILES.p3,
        TILES.p4, TILES.p5, TILES.p6,
        TILES.z1, TILES.z1,
        TILES.s7, TILES.s8 // Wait 6s or 9s.
    ];

    // Winning Tile in Wall
    const { live, dead } = createWalls();
    live[live.length - 3] = TILES.s9;
    live[live.length - 4] = TILES.s9;

    const initialHand = [...hand, TILES.p1]; // Discard p1 to reach Tenpai
    const actionDama: Action = { type: 'discard', tile: TILES.p1, riichi: false };
    const actionRiichiTest: Action = { type: 'discard', tile: TILES.p1, riichi: true };

    // Run Dama
    const scoreDama = runSinglePath(initialHand, [], actionDama, live, dead, 0, [TILES.z2], 1, false);

    // Run Riichi
    const scoreRiichi = runSinglePath(initialHand, [], actionRiichiTest, live, dead, 0, [TILES.z2], 1, false);

    console.log(`Dama Score: ${scoreDama}`);
    console.log(`Riichi Score: ${scoreRiichi}`);

    if (scoreRiichi > scoreDama) {
        console.log("[PASS] Riichi Score > Dama Score (Ippatsu/Ura bonus)");
    } else {
        console.error("[FAIL] Riichi Score <= Dama Score");
    }
}

function testRyuukyokuLogic() {
    console.log("\nTest 2: Ryuukyoku (Draw) Return");

    // Construct a wall that yields NO wins.
    // Exhaustive draw.
    const { live, dead } = createWalls();
    // Fill live with useless tiles
    live.fill(TILES.s1);

    // Hand that cannot win with s1
    const hand = [TILES.m1, TILES.m9, TILES.p1, TILES.p9, TILES.s1, TILES.s9, TILES.z1, TILES.z2, TILES.z3, TILES.z4, TILES.z5, TILES.z6, TILES.z7, TILES.m1];
    // Kokushi-ish but bad.

    const actionRiichi: Action = { type: 'discard', tile: TILES.m1, riichi: true };
    const actionDama: Action = { type: 'discard', tile: TILES.m1, riichi: false };

    const scoreDama = runSinglePath(hand, [], actionDama, live, dead, 0, [], 17, false);
    // Exhaust -> 0.

    console.log(`Dama Ryuukyoku: ${scoreDama} (Expected 0)`);

    const scoreRiichi = runSinglePath(hand, [], actionRiichi, live, dead, 0, [], 17, false);
    // Exhaust -> -1000 (Cost) + 333 (Return) = -667.

    console.log(`Riichi Ryuukyoku: ${scoreRiichi} (Expected -667)`);

    if (scoreDama === 0 && scoreRiichi === -667) {
        console.log("[PASS] Ryuukyoku Logic Correct");
    } else {
        console.error(`[FAIL] Expected 0/-667, Got ${scoreDama}/${scoreRiichi}`);
    }
}

testRiichiCost();
testRyuukyokuLogic();
