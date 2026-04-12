
import { calculateShanten } from '../core/shanten';
import { TILES } from '../core/tile';

function testShantenLogic() {
    console.log("=== Shanten Logic Verification ===");

    // 1. Chiitoitsu Tenpai
    // 11223344556677 (using Pinzu for simplicity)
    const chiitoiHand = [
        TILES.p1, TILES.p1, TILES.p2, TILES.p2,
        TILES.p3, TILES.p3, TILES.p4, TILES.p4,
        TILES.p5, TILES.p5, TILES.p6, TILES.p6,
        TILES.p7
    ];
    // Tenpai means 13 tiles. If we have 6 pairs and 1 single, shanten is 0.
    // Wait, standard 13 tiles for tenpai check? No, shanten calc usually takes 13 or 14.
    // If 13 tiles: 6 pairs + 1 single = 0 shanten (waiting for pair match).
    // If 14 tiles: 7 pairs = -1 shanten (agari).
    // User asked: "11223344556677 -> 0 shanten?" 
    // This is 14 tiles. If it's a complete hand, it should be -1.
    // However, if the user means "13 tiles tenpai state", let's test that too.
    // Explicitly: 11223344556677 is 14 tiles.

    // User input: "11223344556677" (14 tiles).
    // If logic returns -1, that's Agari. If user expects 0 (Tenpai), then maybe they mean 13?
    // Usually "Tenpai" means shanten=0. "Agari" means shanten=-1.
    // Let's test 14 tiles first.

    const chiitoiCompleted = [
        ...chiitoiHand, TILES.p7
    ];
    console.log("Chiitoitsu (14 tiles, completed):", calculateShanten(chiitoiCompleted));

    const chiitoiTenpai = [
        TILES.p1, TILES.p1, TILES.p2, TILES.p2,
        TILES.p3, TILES.p3, TILES.p4, TILES.p4,
        TILES.p5, TILES.p5, TILES.p6, TILES.p6,
        TILES.p7
    ];
    console.log("Chiitoitsu (13 tiles, tenpai):", calculateShanten(chiitoiTenpai));


    // 2. Kokushi 1-shanten
    // 19m 19p 19s Ton Nan Xia Pei Haku Hatsu (10 varieties)
    // + say 1 duplicate or random.
    // User case: "19m19p19sTonNanXiaPeiHakuHatsu" -> 10 tiles?
    // Needs 13 tiles for testing shanten.
    // Let's construct a 1-shanten Kokushi (12 orphans + 1 trash OR 11 orphans + 1 pair)

    // Case A: 12 distinct orphans + 1 non-orphan (trash)
    // Missing 1 orphan for tenpai. Shanten = 0?
    // No, Kokushi shanten = 13 - unique - pairBonus.
    // Max unique = 13.
    // If 12 unique: 13 - 12 - 0 = 1 shanten.

    const kokushi1Shanten = [
        TILES.m1, TILES.m9,
        TILES.p1, TILES.p9,
        TILES.s1, TILES.s9,
        TILES.z1, TILES.z2, TILES.z3, TILES.z4,
        TILES.z5, TILES.z6, // 12 unique
        TILES.p2 // Trash
    ];
    console.log("Kokushi 1-Shanten (12 unique + trash):", calculateShanten(kokushi1Shanten));

    // 3. Fixed Mentsu check
    // Hand: 1p1p + 3x Fixed (Pon/Pon/Pon)
    // Total 14 tiles equivalent (2 in hand + 9 fixed = 11? No)
    // Standard: 13 tiles in hand - 3*3 = 4 tiles in hand + 3 fixed sets.
    // Hand: 1p 1p 2p 3p (Tenpai for 1p/4p) + 3 fixed.
    // fixedMentsuCount = 3.

    const fixedHand = [TILES.p1, TILES.p1, TILES.p2, TILES.p3];
    console.log("Fixed Mentsu Test (Hand: 1123p, Fixed: 3):", calculateShanten(fixedHand, 3));
    // Should be 0 shanten (Tenpai).
}

testShantenLogic();
