
import { runSinglePath, countDora } from './engine';
import { TILES } from '../core/tile';

const hand = [
    TILES.m9, TILES.m9, TILES.m9,
    TILES.p2, TILES.p3,
    TILES.s3, TILES.s3,
    TILES.z7, TILES.z7, TILES.z7,
    TILES.z1, TILES.z1, TILES.z1,
    TILES.z2 // South (discard for Riichi, wait 1p/4p)
];

const visible = [...hand, TILES.m9]; // 9m indicator

function testRiichiKita(otherKita: number) {
    console.log(`\n--- Test: otherKita=${otherKita} ---`);
    let totalScore = 0;
    let wins = 0;
    let totalNukidora = 0;
    const trials = 10000;

    for (let i = 0; i < trials; i++) {
        // Discard 南 (z2) and Riichi
        const result = runSinglePath(
            hand,
            [],
            { type: 'discard', tile: TILES.z2, riichi: true },
            visible,
            0, // myKita
            otherKita,
            [TILES.m9],
            1,
            true
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
