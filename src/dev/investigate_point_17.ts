import { stringToTile, TILES } from '../core/tile';
import type { SimulationConfig } from './engine';
import { runBatchSimulations } from './simulator.worker';

async function runInvestigation() {
    console.log("Starting investigation with hand: 9m9m9m1p2p3p3p5p1s1s4s6s7s8s at Turn 17");

    const handStr = "9m 9m 9m 1p 2p 3p 3p 5p 1s 1s 4s 6s 7s 8s".split(" ").map(s => stringToTile(s.trim()));
    const initialHand = handStr.map(t => typeof t === 'number' ? t : TILES.z1);

    const config: SimulationConfig = {
        myHand: initialHand,
        fixedMentsu: [],
        otherOpenMelds: [],
        myDiscards: [],
        doraIndicators: [TILES.z3],
        myKita: 2,
        otherKita: 1,
        trials: 3000, 
        currentTurn: 17,
        isDealer: true,
        selfEffectiveWallCount: 3,
        liveWallLimit: 4, // Make sure it breaks quickly
        myKanCount: 0,
        otherKanCount: 0,
        northInWall: 1,
        doraValueTotal: 0
    };

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
        } else {
            console.error("Error during simulation:", e);
        }
    }
}

runInvestigation();
