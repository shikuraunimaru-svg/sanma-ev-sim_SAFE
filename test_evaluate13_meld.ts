import { evaluate13Internal } from './src/simulation/simulator.worker';
import { TILES } from './src/core/tile';
import type { SimulationConfig } from './src/simulation/engine';
import type { Mentsu } from './core/shanten';

// 1233赤5p24456s 中ポン ドラ2s 自北1 他北1 5巡目
const config: SimulationConfig = {
    // 10 tiles + 1 meld = 13 tiles equivalent
    myHand: [
        TILES.p1, TILES.p2, TILES.p3, TILES.p3, TILES.p5r,
        TILES.s2, TILES.s4, TILES.s4, TILES.s5, TILES.s6
    ],
    fixedMentsu: [
        {
            type: 'koutsu',
            tile: TILES.z7, // Chun (Red Dragon)
            tiles: [TILES.z7, TILES.z7, TILES.z7],
            isOpen: true,
            isKan: false
        }
    ],
    doraIndicators: [TILES.s1], // Dora 2s -> indicator is s1
    myDiscards: [],
    myKita: 1,
    otherKita: 1,
    trials: 50, // Keep trials low for test
    currentTurn: 5,
    isDealer: true,
    selfEffectiveWallCount: 50,
    liveWallLimit: 70,
};

// Mock postMessage
(global as any).self = {
    postMessage: (msg: any) => {
        console.log("Mock postMessage received:", msg.type);
    }
};

console.log("Starting test...");
try {
    const res = evaluate13Internal(config);
    console.log("Result:", res);
} catch (e) {
    console.error("Error!!!", e);
}
console.log("Test finished.");
