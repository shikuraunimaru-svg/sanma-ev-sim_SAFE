import { runBatchSimulations } from './src/simulation/simulator.worker.ts';
import { TILES, tileToString } from './src/core/tile.ts';
import { DEBUG } from './src/simulation/engine.ts';

DEBUG.performance = true;
DEBUG.wall = false;
DEBUG.actionGen = false;

// 23344789p 23赤5678s (ドラ5s)
const myHand = [
    TILES.p2, TILES.p3, TILES.p3, TILES.p4, TILES.p4, TILES.p7, TILES.p8, TILES.p9,
    TILES.s2, TILES.s3, TILES.s5r, TILES.s6, TILES.s7, TILES.s8
];

// ドラ5sにするため、表示牌は4s (TILES.s4)
const config: any = {
    myHand,
    fixedMentsu: [],
    myDiscards: [],
    doraIndicators: [TILES.s4],
    myKita: 0,
    otherKita: 0,
    trials: 100,
    currentTurn: 3,
    isDealer: false,
    useLookahead: false
};

const fakeMessageEvent = {
    data: { type: 'START_SIMULATION', config }
};

// @ts-ignore
global.self = {
    postMessage: (msg: any) => {
        if (msg.type === 'RESULT') {
            console.log("\n=== RESULT ===");
            msg.results.slice(0, 3).forEach((r: any) => {
                let nodeStr = r.action.type === 'discard' ? tileToString(r.action.tile) : r.action.type;
                console.log(`${nodeStr}: EV=${r.evMean.toFixed(2)}, trials=${r.trialCount}`);
            });
            console.log(`Summary Time: ${msg.summary.totalTimeMs}ms\n`);
        }
    }
};

async function test() {
    console.log("--- WITHOUT LOOKAHEAD ---");
    config.useLookahead = false;
    runBatchSimulations(config);

    setTimeout(() => {
        console.log("--- WITH LOOKAHEAD ---");
        config.useLookahead = true;
        runBatchSimulations(config);
    }, 1000); // 雑な遅延で出力を分ける
}

test();
