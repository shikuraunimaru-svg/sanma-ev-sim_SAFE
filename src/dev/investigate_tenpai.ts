
import { TILES, tileToString } from '../core/tile';
import { runBatchSimulations } from './simulator.worker';

async function runInvestigation() {
    // Mock the global environment for worker
    (global as any).self = {
        postMessage: (msg: any) => {
            if (msg.type === 'RESULT') {
                console.log("\n--- RESULTS RECEIVED ---");
                console.log("Candidate Stats (CRN Check):");
                msg.results.forEach((c: any) => {
                    const actionName = (c.action.tile !== undefined) ? tileToString(c.action.tile) : c.action.type;
                    const riichiStr = c.action.riichi ? "(リーチ)" : "";
                    const ukeireStr = `Ukeire: ${c.effectiveTileTypes}種${c.effectiveTileCount}枚`;
                    console.log(`Action: ${actionName}${riichiStr}, Visits: ${c.trialCount}, EV: ${c.evMean.toFixed(2)}, ${ukeireStr}, Tenpai: ${c.tenpaiRate.toFixed(3)}`);
                });
            }
        },
        performance: performance
    };
    (global as any).performance = performance;

    const hand = [
        TILES.p1, TILES.p2, TILES.p2, TILES.p3, TILES.p3, TILES.p5,
        TILES.s5, TILES.s5, TILES.s6, TILES.s7, TILES.s7, TILES.s8,
        TILES.z3, TILES.z3
    ];
    const config: any = {
        myHand: hand,
        fixedMentsu: [],
        doraIndicators: [TILES.p4],
        currentTurn: 6,
        isDealer: false,
        myKita: 0,
        otherKita: 1,
        validationMode: false,
        maxTrials: 1000
    };

    console.log("Starting investigation with hand:", config.myHand.map(tileToString).join(''));
    console.log("Dora: p5, Turn: 6, Kita: 0/1");
    
    try {
        runBatchSimulations(config as any);
    } catch (e) {
        console.error("Error during simulation:", e);
    }
}

runInvestigation().catch(console.error);
