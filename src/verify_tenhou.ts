import { evaluateWinningHand } from './simulation/engine';
import { TILES } from './core/tile';

const configDealerStart = {
    myHand: [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p1, TILES.p1, TILES.p1,
        TILES.s1, TILES.s1, TILES.s1,
        TILES.z1, TILES.z1, TILES.z1,
        TILES.z5, TILES.z5
    ],
    fixedMentsu: [],
    myDiscards: [],
    doraIndicators: [TILES.m9],
    kitaCount: 0,
    myKita: 0,
    otherKita: 0,
    northRemaining: 4,
    trials: 1,
    currentTurn: 1,
    isDealer: true
};

const configNonDealerFirstDraw = {
    myHand: [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p1, TILES.p1, TILES.p1,
        TILES.s1, TILES.s1, TILES.s1,
        TILES.z1, TILES.z1, TILES.z1,
        TILES.z5, TILES.z5
    ],
    fixedMentsu: [],
    myDiscards: [],
    doraIndicators: [TILES.m9],
    kitaCount: 0,
    myKita: 0,
    otherKita: 0,
    northRemaining: 4,
    trials: 1,
    currentTurn: 1, // First draw for non-dealer
    isDealer: false
};

const configWithKita = {
    ...configDealerStart,
    kitaCount: 1,
    myKita: 1,
    otherKita: 0
};

function test() {
    console.log("=== Testing Tenhou / Chiihou Detection ===");

    console.log("\n--- Case 1: Dealer Starting Hand Win (Tenhou) ---");
    const res1 = evaluateWinningHand(configDealerStart.myHand, configDealerStart);
    if (res1 && res1.bestYaku.yaku.includes("天和")) {
        console.log("✅ Tenhou detected!");
    } else {
        console.log("❌ Tenhou NOT detected.");
        console.log("Yaku list:", res1 ? res1.bestYaku.yaku : "null");
    }

    console.log("\n--- Case 2: Non-Dealer First Draw Win (Chiihou) ---");
    const res2 = evaluateWinningHand(configNonDealerFirstDraw.myHand, configNonDealerFirstDraw);
    if (res2 && res2.bestYaku.yaku.includes("地和")) {
        console.log("✅ Chiihou detected!");
    } else {
        console.log("❌ Chiihou NOT detected.");
        console.log("Yaku list:", res2 ? res2.bestYaku.yaku : "null");
    }

    console.log("\n--- Case 3: Dealer with Kita (Should NOT be Tenhou) ---");
    const res3 = evaluateWinningHand(configWithKita.myHand, configWithKita as any);
    if (res3 && res3.bestYaku.yaku.includes("天和")) {
        console.log("❌ Tenhou detected (ERROR: should be invalid after Kita).");
    } else {
        console.log("✅ Tenhou correctly NOT detected after call/kita.");
    }
}

test();
