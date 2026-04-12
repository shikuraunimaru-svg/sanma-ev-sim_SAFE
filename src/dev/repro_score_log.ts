import { TILES, toNormalFive, tileToString } from './core/tile';
import { scoreWinningHandFast, countDora, getAgariPatternsCached, GameState } from './simulation/engine';

const hand = [
    TILES.p2, TILES.p2, 
    TILES.p5r, TILES.p5,
    TILES.p9, TILES.p9,
    TILES.s6, TILES.s6,
    TILES.s7, TILES.s7,
    TILES.z7, TILES.z7
];
const winningTile = TILES.s5;
// The drawn tile is un-sorted in the real simulation because it's drawn from the mountain and appended
const fullHand = [...hand, TILES.s5, TILES.s5];

const doraInds = [TILES.p2]; // Dora indicator 2p -> Dora 3p (Wait, user said: "ドラ：2p". If Dora indicator is 1p, Dora is 2p. Let's assume Dora indicator is 1p. 
                             // If Dora indicator is 2p, Dora is 3p, so 0 Han from normal Dora.
                             // Let's assume user meant "Dora IS 2p", so indicator is 1p.
const doraIndicators = [TILES.p1]; 

const kitaCount = 1;

// Mentsu & hand27
const currentMentsu: any[] = [];
const hand27 = new Int32Array(27);
for(const t of fullHand) {
    const s = toNormalFive(t);
    // mapped to 27
    if (s <= TILES.m9) hand27[0]++; // dummy
    else if (s <= TILES.p9) hand27[s - 9 + 2]++;
    else if (s <= TILES.s9) hand27[s - 18 + 11]++;
    else hand27[s - 27 + 20]++;
}

const patterns = getAgariPatternsCached(fullHand, currentMentsu, hand27);

const finalDoraCount = countDora(fullHand, doraIndicators, currentMentsu, kitaCount);

const state: GameState = {
    isDealer: true,
    isTsumo: true,
    isRiichi: true,
    turnCount: 8,
    discardCount: 8,
    hasCallOccurred: false,
    doraCount: finalDoraCount,
    uraDoraCount: 0,
    kitaCount: kitaCount,
    bakaze: TILES.z1,
    jikaze: TILES.z1,
    winningTile: winningTile
};

console.log("=== 修正後の打点ログ ===");
console.log("和了時の手牌（14枚）:", fullHand.map(tileToString).join(' '));
console.log("和了牌:", tileToString(winningTile));
console.log("面子構造:", JSON.stringify(patterns));
console.log(`ドラ枚数 (通常・赤・北含む計): ${finalDoraCount} (※計算内訳: 赤1, 北1, 通常${finalDoraCount-2})`);

let fastPoints = 0;
for (const p of patterns) {
    const info = scoreWinningHandFast(fullHand, p, state);
    console.log(`\nパターン評価:`, info);
    if (info.score > fastPoints) fastPoints = info.score;
}

console.log(`\n最終打点: ${fastPoints} 点`);

