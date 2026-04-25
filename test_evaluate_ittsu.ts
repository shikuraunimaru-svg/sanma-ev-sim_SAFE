import { runBatchSimulations } from './src/simulation/simulator.worker';
import { TILES } from './src/core/tile';
import type { SimulationConfig } from './src/simulation/engine';

// Hand: 134567789p45677s
const config: SimulationConfig = {
    myHand: [
        TILES.p1, TILES.p3, TILES.p4, TILES.p5, TILES.p6,
        TILES.p7, TILES.p7, TILES.p8, TILES.p9,
        TILES.s4, TILES.s5, TILES.s6, TILES.s7, TILES.s7
    ],
    fixedMentsu: [],
    doraIndicators: [TILES.z5], // Dora Chun => Indicator Chun (simplification for test)
    myDiscards: [],
    myKita: 0,
    otherKita: 3,
    trials: 1, // 1 trial to trace deterministic logic
    currentTurn: 7,
    isDealer: false, // User said "を満貫(4000ALL=8000)" wait, 4000 ALL is dealer tsumo? "4000ALL=8000" means dealer! Let's set isDealer: true.
    selfEffectiveWallCount: 50,
    liveWallLimit: 70,
};

(global as any).self = {
    postMessage: (msg: any) => {
        console.log("Mock postMessage received:", msg.type);
        if (msg.type === 'RESULT') {
            console.log(JSON.stringify(msg.results, null, 2));
        }
    }
};

console.log("Starting test...");
// Make sure to set DEBUG.performance or console logs in engine.ts?
// Wait, I can just patch simulator.worker.ts or engine.ts temporarily,
// or I can do it in the test script by manually calling score logic?
// Yes, I can just call getAgariPatterns and evaluate directly.

import { getAgariPatterns } from './src/core/shanten';
import { scoreWinningHandFast } from './src/simulation/engine';
import { toNormalFive } from './src/core/tile';

const handAfterDiscard7p = [
    TILES.p1, TILES.p3, TILES.p4, TILES.p5, TILES.p6,
    TILES.p7, TILES.p8, TILES.p9,
    TILES.s4, TILES.s5, TILES.s6, TILES.s7, TILES.s7
];

const winningTile = TILES.p2; // kanchan wait 2p draws Ittsu
const completedHand = [...handAfterDiscard7p, winningTile].sort((a,b) => toNormalFive(a) - toNormalFive(b));

console.log("Completed Hand:", completedHand.map(t => t));

const patterns = getAgariPatterns(completedHand, []);
console.log("Found Patterns:", patterns.length);

for (const p of patterns) {
    console.log("Pattern:", JSON.stringify(p, null, 2));
    const state = {
        bakaze: TILES.z1, jikaze: TILES.z1,
        isRiichi: true, isDoubleRiichi: false, isIppatsu: false, isTsumo: true,
        isRinshan: false, isChankan: false, isHaitei: false, isHoutei: false,
        kitaCount: 0, doraCount: 0, uraDoraCount: 0,
        winningTile: winningTile, isDealer: true, turnCount: 7,
        hasCallOccurred: false, discardCount: 0
    };
    const info = scoreWinningHandFast(completedHand, p, state);
    console.log("Score Info:", info);
}
