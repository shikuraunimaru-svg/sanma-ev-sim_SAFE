
import { TILES, toStandardTile } from './core/tile';
import { calculateShanten, getShantenBreakdown27, getAgariPatterns } from './core/shanten';
import { getWinningTiles27, getUkeireInfo27 } from './simulation/engine';

const hand = [
    TILES.p2, TILES.p2, 
    TILES.p5r, TILES.p5,
    TILES.p9, TILES.p9,
    TILES.s6, TILES.s6,
    TILES.s7, TILES.s7,
    TILES.z7, TILES.z7, TILES.z7 // 中中中
];
const fixedMentsuCount = 0; // Sanma Nuki-kita is NOT fixed mentsu generally or it is 0 for chiitoi testing

const hand27 = new Int32Array(27);
[3, 3, 6, 6, 10, 10, 16, 16, 17, 17, 26, 26, 26].forEach(idx => hand27[idx]++);

const breakdown = getShantenBreakdown27(Array.from(hand27), fixedMentsuCount);
console.log("Current Shanten Breakdown:", breakdown);

const wins = getWinningTiles27(hand27, fixedMentsuCount);
console.log("Winning Tiles:", wins.map(t => toStandardTile(t)));

let ukeireUserLogic = 0;
let winCountUserLogic = 0;

for (let t = 0; t < 27; t++) {
    hand27[t]++;
    const nextS = Math.min(...Object.values(getShantenBreakdown27(Array.from(hand27), fixedMentsuCount)));
    const agari = getAgariPatterns(hand27.map((v, i) => Array(v).fill(toStandardTile(i))).flat() as any, []);
    
    // User logic:
    if (breakdown.chiitoi === 0 || breakdown.normal === 0 || breakdown.kokushi === 0) {
        if (agari.length > 0) winCountUserLogic++;
    } else {
        if (nextS < 0) ukeireUserLogic++; // or nextS < currentS
    }
    hand27[t]--;
}

console.log("Win Count User Logic:", winCountUserLogic);
