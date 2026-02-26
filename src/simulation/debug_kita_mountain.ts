
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

const visible = [...hand, TILES.p8]; // 15 tiles visible

function testKitaCombination(myKita: number, otherKita: number) {
    console.log(`\n--- Test: myKita=${myKita}, otherKita=${otherKita} ---`);
    const result = runSinglePath(
        hand,
        [],
        { type: 'discard', tile: TILES.p9 },
        visible,
        myKita,
        otherKita,
        [TILES.p8],
        1,
        true
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
    { type: 'discard', tile: TILES.p9 },
    [...hand, TILES.z4], // North as Dora indicator
    2,
    1,
    [TILES.z4],
    1,
    true
);
console.log(`Initial Remaining Tiles: ${resultDoraNorth.initialRemainingTiles}`);
// 94 - 39 - 1 (dora) - 3 (kita) = 51
// North count should be: Initial(4) - Dora(1) - Kita(3) = 0.
