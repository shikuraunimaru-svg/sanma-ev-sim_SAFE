import { calculateShanten } from './core/shanten';
import { isValidSanmaTile, TILES } from './core/tile';
import type { Tile } from './core/tile';

function calculateEffectiveTiles(hand: Tile[], fixedMentsuCount: number, visibleTiles: number[]): { tile: Tile, count: number }[] {
    const currentShanten = calculateShanten(hand, fixedMentsuCount);
    const effective: { tile: Tile, count: number }[] = [];

    for (let t = 0; t <= 33; t++) {
        if (!isValidSanmaTile(t)) continue;

        const nextHand = [...hand, t];
        if (calculateShanten(nextHand, fixedMentsuCount) < currentShanten) {
            const inVisible = visibleTiles.filter(v => v === t).length;
            const count = Math.max(0, 4 - inVisible);
            if (count > 0) {
                effective.push({ tile: t, count });
            }
        }
    }

    return effective;
}

function verifyEffectiveTiles() {
    console.log("=== Testing Effective Tiles Calculation ===");

    // Case 1: 3p-6p Ryanyan (Wait for 3p, 6p)
    const hand1 = [
        TILES.p4, TILES.p5,
        TILES.s1, TILES.s1, TILES.s1,
        TILES.z1, TILES.z1, TILES.z1,
        TILES.z2, TILES.z2, TILES.z2,
        TILES.z3, TILES.z3
    ];
    // visibleTiles: hand itself + dora
    const visible1 = [...hand1, TILES.p9];
    const eff1 = calculateEffectiveTiles(hand1, 0, visible1);

    console.log("\nCase 1: 4p5p (Wait 3p, 6p)");
    eff1.forEach(e => console.log(`Tile: ${e.tile} (3p=11, 6p=14), Count: ${e.count}`));

    const has3p = eff1.some(e => e.tile === TILES.p3 && e.count === 4);
    const has6p = eff1.some(e => e.tile === TILES.p6 && e.count === 4);

    if (has3p && has6p && eff1.length === 2) {
        console.log("✅ Case 1 Passed!");
    } else {
        console.log("❌ Case 1 Failed!");
    }

    // Case 2: Partial hand with some tiles visible
    // const hand2 = [TILES.p1, TILES.p2]; // Wait 3p (or wait for 1p/2p to make pair/triple? No, 12 wait 3)
    // Actually 1p2p wait 3p is only for shanten reduction if it completes a mentsu.
    // If hand is [1p, 2p], shanten is 0 (Tenpai) if we need 1 mentsu? No.
    // Let's use a standard 13-tile hand.
    const hand3 = [
        TILES.p1, TILES.p2,
        TILES.s7, TILES.s8,
        TILES.z1, TILES.z1, TILES.z1,
        TILES.z2, TILES.z2, TILES.z2,
        TILES.z3, TILES.z3, TILES.z3
    ];
    // This is 1-shanten. Completing 1p2p with 3p OR 7s8s with 6s/9s reduces shanten to 0.
    const visible3 = [...hand3, TILES.p3, TILES.p3]; // 2 3p's are visible
    const eff3 = calculateEffectiveTiles(hand3, 0, visible3);

    console.log("\nCase 3: 1p2p + 7s8s (Wait 3p, 6s, 9s) with 2x 3p visible");
    eff3.forEach(e => console.log(`Tile: ${e.tile}, Count: ${e.count}`));

    const count3p = eff3.find(e => e.tile === TILES.p3)?.count;
    if (count3p === 2 && eff3.length === 3) {
        console.log("✅ Case 3 Passed! Correctly calculated remaining counts.");
    } else {
        console.log("❌ Case 3 Failed!");
    }
}

verifyEffectiveTiles();
