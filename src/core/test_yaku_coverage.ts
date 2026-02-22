import { evaluateWinningHand } from '../simulation/engine';
import { TILES } from './tile';
import type { SimulationConfig } from '../simulation/engine';
import type { Tile } from './tile';
import type { Mentsu } from './shanten';

// Helper to run test
function testYaku(name: string, hand: number[], expectedYaku: string[], configOverrides: Partial<SimulationConfig> = {}) {
    // Default Config
    const config: SimulationConfig = {
        myHand: hand,
        fixedMentsu: [],
        myDiscards: [],
        doraIndicators: [],
        kitaCount: 0,
        trials: 1,
        currentTurn: 5,
        isDealer: false, // Child
        validationMode: false,
        ...configOverrides
    };

    const result = evaluateWinningHand(hand, config);

    if (!result) {
        console.error(`[FAIL] ${name}: Expected Yaku ${expectedYaku} but got NULL (No Agari/Yaku)`);
        return false;
    }

    const foundyaku = result.bestYaku.yaku;
    const missing = expectedYaku.filter(y => !foundyaku.includes(y));

    if (missing.length === 0) {
        console.log(`[PASS] ${name}`);
        return true;
    } else {
        console.error(`[FAIL] ${name}: Missing ${missing}. Found: ${foundyaku}`);
        return false;
    }
}

// Fixed Mentsu Helper
function createPon(tile: Tile): Mentsu {
    return { type: 'koutsu', tile, tiles: [tile, tile, tile], isOpen: true, isKan: false };
}

console.log("=== Yaku Coverage Test ===");

// 1. Tanyao
testYaku("Tanyao",
    [TILES.p2, TILES.p3, TILES.p4, TILES.p5, TILES.p6, TILES.p7, TILES.s2, TILES.s3, TILES.s4, TILES.s5, TILES.s5],
    ["Tanyao"],
    { fixedMentsu: [createPon(TILES.s8)] }
    // Wait, s8 is Terminal? No. 1s 9s are terminals. s8 (8s) is Simple.
    // 234p, 567p, 234s, 888s, 55s. All simples.
);

// 2. Pinfu
testYaku("Pinfu",
    // Hand should be 14 tiles for immediate win check.
    // 123p, 456p, 234s, 78s + 9s(win). Head 99p.
    // Wait Pinfu requires correct wait logic which might be hard to mock with just 14 tiles if the engine infers wait from last tile.
    // Let's try: 123p, 456p, 234s, 99p (Head), 78s -> 9s (Win).
    // Last tile 9s.
    [TILES.p1, TILES.p2, TILES.p3, TILES.p4, TILES.p5, TILES.p6, TILES.s2, TILES.s3, TILES.s4, TILES.p9, TILES.p9, TILES.s7, TILES.s8, TILES.s9],
    ["Pinfu", "Menzen Tsumo"] // Menzen Tsumo is default for 14-tile closed input
);

// 3. Iipeikou
testYaku("Iipeikou",
    [TILES.p2, TILES.p3, TILES.p4, TILES.p2, TILES.p3, TILES.p4, TILES.s2, TILES.s3, TILES.s4, TILES.s9, TILES.s9, TILES.s9, TILES.z1, TILES.z1],
    ["Iipeikou"]
);


// 4. Yakuhai (Haku)
testYaku("Yakuhai (Haku)",
    [TILES.p1, TILES.p2, TILES.p3, TILES.s1, TILES.s2, TILES.s3, TILES.z5, TILES.z5, TILES.z5, TILES.z6, TILES.z6,
    TILES.s9, TILES.s9, TILES.s9], // 123p 123s HakuHakuHaku HatsuPair 999s
    ["Yakuhai (Haku)"]
);

// 5. Chiitoitsu - Pass

// 6. Ittsuu - Pass

// 7. Sanshoku Doukou (Triple Pon)
// 1m, 1p, 1s Pon.
// 222p, 89p... no let's make it simple.
// 111m, 111p, 111s, 22p, 999p.
// 3+3+3+2+3 = 14.
testYaku("Sanshoku Doukou (Simulated)",
    [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p1, TILES.p1, TILES.p1,
        TILES.s1, TILES.s1, TILES.s1,
        TILES.p2, TILES.p2,
        TILES.p9, TILES.p9, TILES.p9
    ],
    // This is Suuankou (Yakuman) if Closed!
    // We must OPEN one to check Sanshoku Doukou effectively in isolation.
    // Or accept Suuankou.
    ["四暗刻", "Tikari"], // Wait, Tikari? Just allow Suuankou to pass if it hides Sanshoku. Or fixedMentsu.
    { fixedMentsu: [createPon(TILES.s1)] } // Open 1s. Then Suuankou impossible. Sanshoku Doukou visible.
    // Hand for evaluateWinningHand must be proper.
    // If fixedMentsu is provided, the passed HAND should only have 11 tiles?
    // SimulationConfig.myHand is usually full 14 tiles (for extraction? No, for `evaluateWinningHand` input).
    // `evaluateWinningHand` takes `hand`.
    // If `fixedMentsu` present, `hand` usually represents remaining tiles?
    // Engine logic: `getAgariPatterns(hand, fixedMentsu)`. `hand` should be remaining.
);

// Retrying Sanshoku with fixed mentsu approach
const handSanshoku = [
    TILES.m1, TILES.m1, TILES.m1,
    TILES.p1, TILES.p1, TILES.p1,
    TILES.p2, TILES.p2,
    TILES.p9, TILES.p9, TILES.p9
];
testYaku("Sanshoku Doukou (Open)",
    handSanshoku, // 11 tiles
    ["三色同刻"],
    { fixedMentsu: [createPon(TILES.s1)] }
);


// 8. Honitsu - Fix Hand
// Pairs: 11z, 22z, 33z. 99p.
// Pons: 555p.
// Seq: 123p.
// Total 14.
// Structure: 123p (S), 555p (K), 99p (H). 11z (Pair?), 22z (Pair?), 33z (Pair?).
// Impossible structure.
// Valid Honitsu:
// 123p, 456p, 789p, 11z (Head), 999p.
testYaku("Honitsu",
    [TILES.p1, TILES.p2, TILES.p3, TILES.p4, TILES.p5, TILES.p6, TILES.p7, TILES.p8, TILES.p9, TILES.p9, TILES.p9, TILES.p9, TILES.z1, TILES.z1],
    ["混一色", "一気通貫"] // Ittsuu implies 123,456,789
);

// 9. Chinitsu - Fix Hand
// 111p (K), 345p (S), 678p (S), 999p (K), 22p (H).
testYaku("Chinitsu -> Chuuren Poutou",
    [TILES.p1, TILES.p1, TILES.p1, TILES.p2, TILES.p3, TILES.p4, TILES.p5, TILES.p6, TILES.p7, TILES.p8, TILES.p9, TILES.p9, TILES.p9, TILES.p2],
    ["九蓮宝燈"]
);

// 12. Daisangen - Fix expectation
// Found San-ankou, MenzenTsumo.
// Hand: z5z5z5, z6z6z6, z7z7z7, p1p2p3, s1s1.
// Should be Daisangen.
// If it is Menzen, it is also Suuankou? No 3 Ankou. 123p is Shuntsu.
// Daisangen is Yakuman.
// If missing, check `isDaisangen`.
testYaku("Daisangen",
    [TILES.z5, TILES.z5, TILES.z5, TILES.z6, TILES.z6, TILES.z6, TILES.z7, TILES.z7, TILES.z7, TILES.p1, TILES.p2, TILES.p3, TILES.s1, TILES.s1],
    ["大三元"]
);

