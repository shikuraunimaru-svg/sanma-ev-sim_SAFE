
import { calculateShanten } from '../core/shanten';
import { TILES, tileToString, isValidSanmaTile } from '../core/tile';

function testEffective() {
    console.log("=== Effective Tile Verification ===");

    // Hand: 3333456p 23789s WestWest
    // Action: Ankan 3p
    // Hand after Ankan: 456p 23789s WestWest

    // Construct hand
    const handStr = [
        TILES.p4, TILES.p5, TILES.p6,
        TILES.s2, TILES.s3, TILES.s7, TILES.s8, TILES.s9,
        TILES.z3, TILES.z3 // West
    ];

    const fixedMentsuCount = 1; // 3p Ankan
    // const visibleTiles: Tile[] = []; // Not used in this test

    // 1. Calculate Baseline
    const baseline = calculateShanten(handStr, fixedMentsuCount);
    console.log(`Baseline Shanten: ${baseline} (Should be 0/Tenpai)`);

    // 2. Search all tiles
    console.log("Searching effective tiles...");
    const effectiveLines: string[] = [];

    for (let t = 0; t <= 33; t++) {
        if (!isValidSanmaTile(t)) continue;

        // Try adding
        const nextHand = [...handStr, t];
        const newShanten = calculateShanten(nextHand, fixedMentsuCount);

        if (newShanten < baseline) {
            effectiveLines.push(`Tile ${tileToString(t)}: NewShanten ${newShanten}`);
        }
    }

    console.log(`Found ${effectiveLines.length} effective tile types.`);
    effectiveLines.forEach(l => console.log(l));
}

testEffective();
