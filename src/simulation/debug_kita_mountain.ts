
import { runSinglePath } from './engine';
import { TILES } from '../core/tile';

const hand = [
    TILES.p2, TILES.p3, TILES.p4,
    TILES.p5, TILES.p6, TILES.p7,
    TILES.s2, TILES.s3, TILES.s4,
    TILES.s5, TILES.s6,
    TILES.z1, TILES.z1,
    TILES.p9
];

function testKitaCombination(myKita: number, otherKita: number) {
    console.log(`\n--- Test: myKita=${myKita}, otherKita=${otherKita} ---`);
    const result = runSinglePath(
        hand,
        [],
        { type: 'discard', tile: TILES.p9, tileInd: 0, riichi: false },
        myKita,
        otherKita,
        [TILES.p8],
        1,
        true,
        new Uint8Array(108), 108, 70, 44,
        new Int8Array(34),
        new Int8Array(29), new Int8Array(27), new Int8Array(29),
        12345, 0
    );
    console.log(`Initial Remaining Tiles: ${result.initialRemainingTiles}`);
}

testKitaCombination(0, 0); // initial: 54
testKitaCombination(2, 0); // initial: 52
testKitaCombination(0, 2); // initial: 52
testKitaCombination(2, 2); // initial: 50 (all North extracted)

console.log(`\n--- Test: Dora=NORTH, myKita=2, otherKita=1 ---`);
const resultDoraNorth = runSinglePath(
    hand,
    [],
    { type: 'discard', tile: TILES.p9, tileInd: 0, riichi: false },
    2,
    1,
    [TILES.z4],
    1,
    true,
    new Uint8Array(108), 108, 70, 44,
    new Int8Array(34),
    new Int8Array(29), new Int8Array(27), new Int8Array(29),
    12345, 0
);
console.log(`Initial Remaining Tiles: ${resultDoraNorth.initialRemainingTiles}`);
// 94 - 39 - 1 (dora) - 3 (kita) = 51
// North count should be: Initial(4) - Dora(1) - Kita(3) = 0.
