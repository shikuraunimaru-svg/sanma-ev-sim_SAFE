import { getAgariPatterns, calculateShanten } from './core/shanten';
import { TILES } from './core/tile';

// Mock a hand with 1 Pon (Red Dragons)
// Hand: 111s 222s 333s 44s
// Calls: 中ポン (z7)
console.log("--- Reproduction Test: 1 Pon Hand ---");

const hand = [
    TILES.s1, TILES.s1, TILES.s1,
    TILES.s2, TILES.s2, TILES.s2,
    TILES.s3, TILES.s3, TILES.s3,
    TILES.s4, TILES.s4
]; // 11 tiles total (14 - 3 for 1 call)

const calls = [
    {
        type: 'koutsu' as const,
        tile: TILES.z7,
        tiles: [TILES.z7, TILES.z7, TILES.z7],
        isOpen: true,
        isKan: false
    }
];

const shanten = calculateShanten(hand, calls.length);
console.log("Shanten (expected -1):", shanten);

if (shanten === -1) {
    const patterns = getAgariPatterns(hand, calls);
    console.log("Patterns found:", patterns.length);
    if (patterns.length > 0) {
        patterns.forEach((p, i) => {
            console.log(`Pattern ${i + 1}: Head=${p.head}, Melds=${p.mentsu.length}`);
            p.mentsu.forEach((m, mi) => {
                console.log(`  Meld ${mi + 1}: ${m.type} of ${m.tile} (Open: ${m.isOpen})`);
            });
        });
    } else {
        console.log("FAILED: No patterns found for a clearly winning hand with 1 call.");
    }
} else {
    console.log("FAILED: Shanten is not -1 for a winning hand.");
}
