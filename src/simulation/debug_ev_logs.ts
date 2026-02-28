import { simulateAllDiscards } from './simulator.worker';
import { TILES } from '../core/tile';
import { clearShantenCache } from '../core/shanten';

async function runDebug() {
    clearShantenCache();

    // A sample 14-tile hand that is in Tenpai to ensure we see Win logs
    const myHand = [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p1, TILES.p1, TILES.p1,
        TILES.s1, TILES.s1, TILES.s1,
        TILES.z1, TILES.z1, TILES.z1,
        TILES.z2, TILES.z3 // Tenpai for z2, z3
    ];

    const config = {
        myHand,
        fixedMentsu: [],
        myDiscards: [],
        doraIndicators: [TILES.m9], // Dora is m1
        myKita: 0,
        otherKita: 0,
        trials: 1000,
        currentTurn: 1,
        isDealer: true,
        validationMode: true
    };

    console.log("Starting 1000 trials Debug EV run...");

    // Simulate all discards synchronously (uses the same loop logic as worker, triggering our logs)
    const result = simulateAllDiscards(config);

    console.log("\nDone Debug Run.");
}

runDebug();
