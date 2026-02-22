import { runSinglePath } from './simulation/engine';
import { TILES } from './core/tile';

function testKitaSeparation() {
    console.log("=== Testing Kita-nuki vs Discard North Separation ===");

    const hand = [
        TILES.p1, TILES.p1, TILES.p1,
        TILES.p2, TILES.p2, TILES.p2,
        TILES.p3, TILES.p3, TILES.p3,
        TILES.p4, TILES.p4,
        TILES.p5, TILES.p5,
        TILES.z4  // North
    ];
    // This hand needs 1 tile to win (wait p4 or p5)

    const liveWall = [TILES.z2, TILES.z1];
    const deadWall = [TILES.p4];

    console.log("\n--- Case 1: Kita-nuki Action ---");
    const scoreKita = runSinglePath(
        hand,
        [],
        { type: 'kita' },
        liveWall,
        deadWall,
        0,
        [TILES.p9],
        0,
        true,
        true // debugLog
    );
    console.log(`Kita-nuki Result: ${scoreKita.point} points (Type: ${scoreKita.type})`);

    console.log("\n--- Case 2: Discard North Action ---");
    const scoreDiscard = runSinglePath(
        hand,
        [],
        { type: 'discard', tile: TILES.z4 },
        liveWall,
        deadWall,
        0,
        [TILES.p9],
        0,
        true,
        true // debugLog
    );
    console.log(`Discard North Result: ${scoreDiscard.point} points (Type: ${scoreDiscard.type})`);

    if (scoreKita.type === 'win' && Math.max(0, scoreKita.point) > 0 && scoreDiscard.type === 'draw') {
        console.log("\n✅ Correctly separated! Kita-nuki leads to immediate win, Discard North does not.");
    } else {
        console.log("\n❌ Separation failed or unexpected results.");
    }
}

testKitaSeparation();
