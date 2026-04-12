import { runBatchSimulations } from './simulator.worker';
import { TILES } from './engine';

// Mock postMessage
(global as any).self = {
    postMessage: (msg: any) => {
        if (msg.type === 'RESULT') {
            console.log("\n--- SIMULATION RESULTS ---");
            msg.results.slice(0, 5).forEach((r: any, i: number) => {
                const action = r.action;
                const tileStr = action.tile !== undefined ? `Tile ID: ${action.tile}` : action.type;
                console.log(`${i+1}. ${tileStr}${action.riichi ? ' (Riichi)' : ''}: EV=${r.ev.toFixed(2)}, Trials=${r.trialCount}, CI=[${r.ciLower.toFixed(2)}, ${r.ciUpper.toFixed(2)}]`);
            });
            console.log("\nSummary:", msg.summary);
        } else {
            console.log("Worker message:", msg.type);
        }
    }
};

const config = {
    myHand: [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p1, TILES.p2, TILES.p3,
        TILES.s7, TILES.s8, TILES.s9,
        TILES.z1, TILES.z1, TILES.z1,
        TILES.z2
    ],
    fixedMentsu: [],
    doraIndicators: [TILES.p9],
    myKita: 0,
    otherKita: 0,
    currentTurn: 1,
    isDealer: true,
    validationMode: false
};

console.log("Starting CI Racing Verification...");
try {
    runBatchSimulations(config as any);
} catch (e) {
    console.error("Simulation failed:", e);
}
