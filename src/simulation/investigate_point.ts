import { getPossibleActions } from '../core/discard';
import { calculateShanten27 } from '../core/shanten';
import { toSanmaTile, toStandardTile } from '../core/sanmaTiles';
import { stringToTile, TILES, toNormalFive } from '../core/tile';
import { toSanmaHand27 } from '../core/shanten';
import type { SimulationConfig } from './engine';
import { Worker } from 'worker_threads';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runInvestigation() {
    console.log("Starting investigation with hand: 9m9m9m1p2p3p3p5p1s1s4s6s7s8s");

    // 999m 123 35 p 114678 s
    const handStr = "9m 9m 9m 1p 2p 3p 3p 5p 1s 1s 4s 6s 7s 8s".split(" ").map(s => stringToTile(s.trim()));
    const initialHand = handStr.map(t => typeof t === 'number' ? t : TILES.z1);

    const config: SimulationConfig = {
        myHand: initialHand,
        fixedMentsu: [],
        otherOpenMelds: [],
        myDiscards: [],
        doraIndicators: [TILES.z3], // West indicates North
        myKita: 2,
        otherKita: 1,
        trials: 3000, 
        currentTurn: 3,
        isDealer: true,
        selfEffectiveWallCount: 50,
        liveWallLimit: 60,
        myKanCount: 0,
        otherKanCount: 0,
        northInWall: 1, // 4 - 3 = 1
        doraValueTotal: 0
    };

    console.log(`Dora Indicator: z3 (West), Turn: ${config.currentTurn}, Kita: ${config.myKita}/${config.otherKita}, Dealer: ${config.isDealer}`);

    // Call the worker
    const workerPath = path.resolve(__dirname, 'simulator.worker.ts');
    
    // Using simple Ts-Node approach or directly invoking import for the function if we can.
    // Wait, let's just use the simulator logic directly in single-thread to see logs synchronously!
    const Engine = await import('./engine');
    const { runBatchSimulations } = await import('./simulator.worker');

    try {
        const results = runBatchSimulations(config);
        
        console.log("\n--- RESULTS RECEIVED ---");
        results.forEach((r: any) => {
            const tileStr = typeof r.action.tile === 'number' ? r.action.tile : '?';
            const actionStr = r.action.type === 'discard' ? `discard ${tileStr}` : r.action.type;
            if (actionStr === 'discard 21') {
                console.log(`\nTARGET ACTION (discard 4s - 21): EV: ${r.ev}, WinRate: ${r.winRate}, Trials: ${r.trialCount}`);
                console.log(`avgWinPoint: ${r.avgWinPoint}`);
            }
        });

    } catch (e) {
        if (e instanceof ReferenceError && e.message.includes('self is not defined')) {
            console.log("Caught expected self.postMessage error. Simulation finished.");
            // Normally self.postMessage throws here in test script unless mocked.
            // If it does, we can't easily extract results array. 
            // So we mock it quickly.
        } else {
            console.error("Error during simulation:", e);
        }
    }
}

runInvestigation();
