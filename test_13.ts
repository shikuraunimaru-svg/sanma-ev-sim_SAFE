import './src/simulation/simulator.worker';
import { TILES, tileToString } from './src/core/tile';
import { DEBUG } from './src/simulation/engine';

DEBUG.performance = false;
DEBUG.wall = false;
DEBUG.actionGen = false;

// 13枚の手牌: 23344789p 23赤567s (1枚少ない)
const myHand = [
    TILES.p2, TILES.p3, TILES.p3, TILES.p4, TILES.p4, TILES.p7, TILES.p8, TILES.p9,
    TILES.s2, TILES.s3, TILES.s5r, TILES.s6, TILES.s7
];

const config: any = {
    myHand,
    fixedMentsu: [],
    myDiscards: [],
    doraIndicators: [TILES.s4],
    myKita: 0,
    otherKita: 0,
    trials: 5000,
    currentTurn: 3,
    isDealer: false,
    useLookahead: false
};

const fakeMessageEvent: any = {
    data: { type: 'START_SIMULATION', config }
};

// @ts-ignore
global.self = {
    postMessage: (msg: any) => {
        if (msg.type === 'RESULT') {
            console.log("\n=== POST_MESSAGE CAUGHT ===");
            console.log(msg.results);
            console.log(`Summary Time: ${msg.summary?.totalTimeMs}ms\n`);
        } else if (msg.type === 'error') {
            console.error("Worker sent error:", msg.error);
        }
    }
};

// load worker module which sets up self.onmessage
import * as workerModule from './src/simulation/simulator.worker';

async function test() {
    console.log("--- START TO TEST 13 TILES ---");
    // @ts-ignore
    if (global.self.onmessage) {
        // @ts-ignore
        global.self.onmessage(fakeMessageEvent);
    } else {
        console.log("fallback directly calling onmessage not found.");
    }
}

test();
