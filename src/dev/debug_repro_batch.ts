import { TILES } from '../core/tile.ts';
import { clearShantenCache } from '../core/shanten.ts';
import { runBatchSimulations } from './simulator.worker.ts';

// Mock self.postMessage since we are running in Node.js for debug
if (typeof globalThis.self === 'undefined') {
    (globalThis as any).self = {
        postMessage: (msg: any) => {
            if (msg.type === 'RESULT') {
                console.log("=== FINAL RESULT SUMMARY ===");
                // Further summary logging if needed
            }
        }
    };
}

async function runDebug() {
    clearShantenCache();

    // Hand: 1m 1m 1m, 1p 1p 1p, 1s 1s 1s, 1z 1z 1z, 2z 3z (Tenpai)
    const myHand = [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p1, TILES.p1, TILES.p1,
        TILES.s1, TILES.s1, TILES.s1,
        TILES.z1, TILES.z1, TILES.z1,
        TILES.z2, TILES.z3
    ];

    const config = {
        myHand,
        fixedMentsu: [],
        myDiscards: [],
        doraIcons: [], // added to satisfy engine
        doraIndicators: [TILES.m9],
        myKita: 0,
        otherKita: 0,
        trials: 1000,
        currentTurn: 1,
        isDealer: true
    };

    console.log("Starting 1000 trials Debug EV repro run...");

    // Trigger the batch simulation logic
    runBatchSimulations(config as any);

    console.log("\nDone repro run.");
}

runDebug();
