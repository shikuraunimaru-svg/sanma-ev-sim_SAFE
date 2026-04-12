
import { runSinglePath } from './engine';
import { TILES } from '../core/tile';

const hand = [
    TILES.m9, TILES.m9, TILES.m9,
    TILES.p2, TILES.p3,
    TILES.s3, TILES.s3,
    TILES.z7, TILES.z7, TILES.z7,
    TILES.z1, TILES.z1, TILES.z1,
    TILES.z2 // South (discard for Riichi, wait 1p/4p)
];
function testRiichiKita(otherKita: number) {
    console.log(`\n--- Test: otherKita=${otherKita} ---`);
    let totalScore = 0;
    let wins = 0;
    const trials = 10000;

    for (let i = 0; i < trials; i++) {
        const fakeMountain = new Uint8Array(108);
        const liveWallLimit = 70;

        // Discard 南 (z2) and Riichi
        const result = runSinglePath(
            hand,
            [],
            { type: 'discard', tile: TILES.z2, riichi: true, tileInd: 0 } as any,
            0, // myKita
            otherKita,
            [TILES.m9],
            1,
            true,
            fakeMountain, fakeMountain.length,
            liveWallLimit, 44,
            new Int8Array(34),
            new Int8Array(29), new Int8Array(27), new Int8Array(29),
            12345, 0
        );

        if (result.type === 'win') {
            wins++;
            totalScore += result.point;
        }
    }

    console.log(`  Wins: ${wins}/${trials}`);
    console.log(`  Average Points: ${wins > 0 ? Math.round(totalScore / wins) : 0}`);
}

testRiichiKita(0); // 4 North in wall
testRiichiKita(4); // 0 North in wall
