import { runSinglePath } from './simulation/engine';
import { TILES } from './core/tile';

function testRinshan() {
    console.log("=== Testing Kita-nuki and Rinshan Kaihou ===");

    // Correct 14 tiles: 234p 234p 567s 22s 44s + 北
    const handCorrect = [
        TILES.p2, TILES.p3, TILES.p4,
        TILES.p2, TILES.p3, TILES.p4,
        TILES.s5, TILES.s6, TILES.s7,
        TILES.s2, TILES.s2,
        TILES.s4, TILES.s4,
        TILES.z4  // North
    ];

    const liveWall = [TILES.z1];
    const deadWall = [TILES.s4];

    console.log("\n--- Case 1: Kita-nuki -> Rinshan Kaihou ---");

    const score = runSinglePath(
        handCorrect,
        [],
        { type: 'kita' }, // Initial action is Kita-nuki
        liveWall,
        deadWall,
        0,
        [TILES.p9],
        0,
        true,
        true // debugLog
    );

    if (score.type === 'win' && Math.max(0, score.point) > 0) {
        console.log("✅ Rinshan win detected! Score:", score.point);
    } else {
        console.log("❌ Rinshan win NOT detected.");
    }
}

testRinshan();
