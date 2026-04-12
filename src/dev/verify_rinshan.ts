// @ts-nocheck
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
    const result = runSinglePath(handCorrect,
        [],
        { type: 'kita' }, // Initial action is Kita-nuki
        0, // myKita
        0, // otherKita
        [TILES.p9], // doraInds
        0, // currentTurn
        true, // isDealer
        new Uint8Array(liveWall, new Uint8Array(108), 108, 70, 44, new Int8Array(34), new Int8Array(29), new Int8Array(27), new Int8Array(29), 12345, 0),
        liveWall.length,
        new Uint8Array(29), // templateCounts
        new Int8Array(29),  // trialCounts
        new Int8Array(27),  // counts27
        new Int8Array(29),  // workUraCounts
        12345, // seed
        0 // tenpaiDepth
    );

    if (result.type === 'win' && Math.max(0, result.point) > 0) {
        console.log("✅ Rinshan win detected! Score:", result.point);
    } else {
        console.log("❌ Rinshan win NOT detected.");
    }
}

testRinshan();
