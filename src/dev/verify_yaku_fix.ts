import { getAgariPatterns } from './core/shanten';
import { TILES } from './core/tile';
import { calculateScore } from './core/yaku';

// Mock the problematic hand: 22334478999p + Chun Pon
// Expected: Yakuhai (Chun) 1, Honitsu (Open) 2 = 3 han.
// Currently showing Chinitsu and Tsumo.

console.log("--- Yaku Verification: Open Honitsu Hand ---");

const hand = [
    TILES.p2, TILES.p2,
    TILES.p3, TILES.p3,
    TILES.p4, TILES.p4,
    TILES.p7, TILES.p8, TILES.p9,
    TILES.p9, TILES.p9
]; // 11 tiles (14 - 3 for 1 call)

const calls = [
    {
        type: 'koutsu' as const,
        tile: TILES.z7,
        tiles: [TILES.z7, TILES.z7, TILES.z7],
        isOpen: true,
        isKan: false
    }
];

const patterns = getAgariPatterns(hand, calls);
console.log("Patterns found:", patterns.length);

if (patterns.length > 0) {
    const structure = patterns[0];
    const state = {
        bakaze: TILES.z1,
        jikaze: TILES.z2,
        isRiichi: false,
        isDoubleRiichi: false,
        isIppatsu: false,
        isTsumo: true,
        isRinshan: false,
        isChankan: false,
        isHaitei: false,
        isHoutei: false,
        kitaCount: 0,
        doraCount: 0,
        uraDoraCount: 0,
        winningTile: TILES.p2
    };

    const result = calculateScore(hand, structure, state);

    console.log("=== Yaku Result ===");
    console.log("Han:", result.han);
    console.log("Fu:", result.fu);
    console.log("Yaku List:");
    result.yakuList.forEach(y => console.log(`  - ${y.name}: ${y.han}`));

    const hasChinitsu = result.yakuList.some(y => y.name === "清一色");
    const hasHonitsu = result.yakuList.some(y => y.name === "混一色");
    const hasTsumo = result.yakuList.some(y => y.name === "Menzen Tsumo");
    const hasYakuhai = result.yakuList.some(y => y.name.includes("Yakuhai"));

    console.log("\n--- Integrity Check ---");
    console.log("Has Chinitsu (Wrong):", hasChinitsu);
    console.log("Has Honitsu (Correct):", hasHonitsu);
    console.log("Has Menzen Tsumo (Wrong on Open):", hasTsumo);
    console.log("Has Yakuhai (Correct):", hasYakuhai);
}
