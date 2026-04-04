
import { TILES, toNormalFive, tileToString } from './core/tile';
import { calculateShanten, getShantenBreakdown27 } from './core/shanten';
import { getUkeireInfo27 } from './simulation/engine';

// Hand: 22r5599p 56677s 中中中 (14 tiles)
// Discard 5s -> 22r5599p 6677s 中中中 (13 tiles)
const hand = [
    TILES.p2, TILES.p2, 
    TILES.p5r, TILES.p5,
    TILES.p9, TILES.p9,
    TILES.s6, TILES.s6,
    TILES.s7, TILES.s7,
    TILES.z7, TILES.z7, TILES.z7 // 中中中
];

const fixedMentsuCount = 1; // 1 Nuki-Kita

const hand27 = new Int32Array(27);
for (const t of hand) {
    const s = (t as any); // Simplified for test
    // Need to mapped to our 27-id
    // 2p: 3, 5p: 6, 9p: 10, 6s: 16, 7s: 17, z7: 26
    if (t === TILES.p2) hand27[3]++;
    if (t === TILES.p5 || t === TILES.p5r) hand27[6]++;
    if (t === TILES.p9) hand27[10]++;
    if (t === TILES.s6) hand27[16]++;
    if (t === TILES.s7) hand27[17]++;
    if (t === TILES.z7) hand27[26]++;
}

console.log("Hand:", hand.map(tileToString).join(' '));
console.log("Fixed Mentsu Count:", fixedMentsuCount);

const breakdown = getShantenBreakdown27(Array.from(hand27), fixedMentsuCount);
console.log("Shanten Breakdown:", breakdown);

const currentS = Math.min(breakdown.normal, breakdown.chiitoi, breakdown.kokushi);
console.log("Current Shanten:", currentS);

// Dummy invisible counts: 4 of each except what's in hand
const invisible27 = new Int32Array(27).fill(4);
for (let i = 0; i < 27; i++) invisible27[i] -= hand27[i];

const ukeire = getUkeireInfo27(hand27, fixedMentsuCount, invisible27);
console.log("Ukeire Info:", ukeire);
