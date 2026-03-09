import { scoreWinningHandFast } from './src/simulation/engine';
import { getAgariPatterns } from './src/core/shanten';
import { calculateShanten } from './src/core/shanten';
import { getUkeireCount27 } from './src/simulation/engine';
import { TILES, Tile, toStandardTile, tileToString } from './src/core/tile';
import type { GameState } from './src/simulation/engine';

import { toSanmaTile } from './src/core/tile';

import { calculateShanten27 } from './src/core/shanten';

const hand27 = new Int8Array(27);
const tiles = [
    TILES.p4, TILES.p5, TILES.p5, TILES.p6, TILES.p8, TILES.p8,
    TILES.s2, TILES.s3, TILES.s4, TILES.s5, TILES.s6, TILES.s7, TILES.s7
];
for (const t of tiles) {
    console.log("Tile", t, tileToString(t), "-> sanma:", toSanmaTile(t));
    hand27[toSanmaTile(t)]++;
}
console.log("hand27:", hand27.join(','));

console.log("Shanten:", calculateShanten27(hand27, 0));

// Simulate drawing tiles that improve the hand
for (let drawIdx = 0; drawIdx < 27; drawIdx++) {
    const drawT34 = toStandardTile(drawIdx);
    if ((drawT34 >= 0 && drawT34 <= 8) && !(drawT34 === 0 || drawT34 === 8)) continue;

    hand27[drawIdx]++;
    const sArrayObj = calculateShanten27(hand27, 0);
    // If it improved to Tenpai
    if (sArrayObj === 0) {
        // find discard
        for (let dropIdx = 0; dropIdx < 27; dropIdx++) {
            if (hand27[dropIdx] === 0) continue;
            hand27[dropIdx]--;
            if (calculateShanten27(hand27, 0) === 0) {
                // reached tenpai by discarding dropIdx
                // now find what wins
                for (let winIdx = 0; winIdx < 27; winIdx++) {
                    const wT34 = toStandardTile(winIdx);
                    if ((wT34 >= 0 && wT34 <= 8) && !(wT34 === 0 || wT34 === 8)) continue;
                    hand27[winIdx]++;
                    if (calculateShanten27(hand27, 0) === -1) {
                        const fullHand = [];
                        for (let i = 0; i < 27; i++) {
                            for (let j = 0; j < hand27[i]; j++) fullHand.push(toStandardTile(i));
                        }
                        const patterns = getAgariPatterns(fullHand, []);
                        const state: GameState = {
                            bakaze: TILES.z1, jikaze: TILES.z1, isRiichi: true, isDoubleRiichi: false, isIppatsu: false, isTsumo: true,
                            isRinshan: false, isChankan: false, isHaitei: false, isHoutei: false,
                            kitaCount: 1, doraCount: 0, uraDoraCount: 0, winningTile: wT34, isDealer: true, turnCount: 8, hasCallOccurred: true, discardCount: 0
                        };
                        const pts = scoreWinningHandFast(fullHand, patterns[0], state);
                        console.log(`Draw ${tileToString(drawT34)}, Discard ${tileToString(toStandardTile(dropIdx))}, Win on ${tileToString(wT34)} -> Points: ${pts}`);
                    }
                    hand27[winIdx]--;
                }
            }
            hand27[dropIdx]++;
        }
    }
    hand27[drawIdx]--;
}
