import { calculateScore } from './src/core/yaku';
import { simulateAllDiscards } from './src/simulation/simulator.worker';
import { TILES } from './src/core/tile';

// Hand with 0 fixed mentsu, 1 shanten, but when it draws it becomes Menzen Tenpai.
// 2 red tiles.
// 2m 3m 4m 5p(red) 6p 7p 2s 3s 4s 5s(red) 5s 6s 7s
const config = {
    myHand: [
        TILES.p1, TILES.p1,             // Pair
        TILES.p2, TILES.p3, TILES.p4,   // Set 1
        TILES.p5r, TILES.p6, TILES.p7,  // Set 2 (Red 5p)
        TILES.s2, TILES.s3, TILES.s4,   // Set 3
        TILES.s5r, TILES.s6,            // Wait 4-7s (Red 5s)
        TILES.z3                        // 14th tile
    ],
    fixedMentsu: [],
    doraIndicators: [],
    kitaCount: 0,
    myDiscards: [],
    trials: 5000,
    currentTurn: 5,
    isDealer: false,
    validationMode: false
};

const results = simulateAllDiscards(config);

if (results.results) {
    for (const res of results.results) {
        console.log(`Tile: (Action: ${JSON.stringify(res.action)})`);
        console.log(`  WinRate: ${res.winRate}, Avg Score: ${res.avgScore}, EV: ${res.ev}`);
        console.log(`  TenpaiRate: ${res.tenpaiRate}`);
    }
}
