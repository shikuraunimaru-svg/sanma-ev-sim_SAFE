
import { calculateShanten } from '../core/shanten';
import { TILES } from '../core/tile';

function testAnkanEffective() {
    console.log("Running Ankan Effective Tile Verification...");

    // Hand: 3333456p 23789s WestWest
    // Ankan 3p -> Remove 3333p
    // Hand becomes: 456p 23789s WestWest
    const handStr = [
        TILES.p4, TILES.p5, TILES.p6,
        TILES.s2, TILES.s3, TILES.s7, TILES.s8, TILES.s9,
        TILES.z3, TILES.z3 // West
    ];

    // Fixed Mentsu = 1 (The Ankan 3p) implies we have 1 set.
    // Simulator worker passes fixedMentsu.length + 1.
    // Previously it might have passed 0?

    const fixedMentsuCount = 1;

    // 1. Calculate Baseline Shanten
    const baseline = calculateShanten(handStr, fixedMentsuCount);
    console.log(`Baseline Shanten (10 tiles, 1 fixed): ${baseline}`);

    // 2. Check 1s (Should be effective)
    const handWith1s = [...handStr, TILES.s1];
    const shanten1s = calculateShanten(handWith1s, fixedMentsuCount);
    console.log(`With 1s: ${shanten1s} (Effective: ${shanten1s < baseline})`);

    // 3. Check West (Should NOT be effective)
    const handWithWest = [...handStr, TILES.z3];
    const shantenWest = calculateShanten(handWithWest, fixedMentsuCount);
    console.log(`With West: ${shantenWest} (Effective: ${shantenWest < baseline})`);

    if (shanten1s < baseline && !(shantenWest < baseline)) {
        console.log("SUCCESS: Logic Correct.");
    } else {
        console.log("FAILURE: Logic Incorrect.");
    }
}

testAnkanEffective();
