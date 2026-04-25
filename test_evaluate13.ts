import { evaluate13Internal } from './src/simulation/simulator.worker';
import { TILES } from './src/core/tile';
import type { SimulationConfig } from './src/simulation/engine';

const config: SimulationConfig = {
    myHand: [
        TILES.m1, TILES.m9,
        TILES.p1, TILES.p9,
        TILES.s1, TILES.s9,
        TILES.z1, TILES.z2, TILES.z3, TILES.z4, TILES.z5, TILES.z6, TILES.z7
    ],
    fixedMentsu: [],
    doraIndicators: [TILES.m1],
    myDiscards: [],
    myKita: 0,
    otherKita: 0,
    trials: 500,
    currentTurn: 1,
    isDealer: true,
    selfEffectiveWallCount: 50,
    liveWallLimit: 70,
};

// Also mock postMessage since simulator.worker calls it.
(global as any).self = {
    postMessage: (msg: any) => {
        console.log("Mock postMessage received:", msg);
    }
};

try {
    const res = evaluate13Internal(config);
    console.log("Result:", res);
} catch (e) {
    console.error("Error!!!", e);
}
