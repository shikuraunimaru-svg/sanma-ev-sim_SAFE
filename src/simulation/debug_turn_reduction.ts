
import { runSinglePath } from './engine';
import { TILES } from '../core/tile';

const baseConfig = {
    myHand: [TILES.m1, TILES.m1, TILES.m1, TILES.p1, TILES.p1, TILES.p1, TILES.s1, TILES.s1, TILES.s1, TILES.z1, TILES.z1, TILES.z1, TILES.z2],
    fixedMentsu: [],
    myDiscards: [],
    doraIndicators: [TILES.p9],
    kitaCount: 0,
    isDealer: true,
    trials: 1
};

async function testTurn(turn: number) {
    console.log(`--- Testing Turn ${turn} ---`);
    const config = { ...baseConfig, currentTurn: turn };

    // Add dummy discards for me to match the turn
    const dummyDiscards = new Array(turn - 1).fill(TILES.z3);
    const visible = [...config.myHand, ...dummyDiscards, ...config.doraIndicators];

    const result = runSinglePath(
        config.myHand,
        config.fixedMentsu,
        { type: 'discard', tile: TILES.z2 },
        visible,
        config.kitaCount,
        config.doraIndicators,
        config.currentTurn,
        config.isDealer
    );
    console.log(`Initial remainingTotal: ${result.initialRemainingTiles}`);
}

async function run() {
    await testTurn(1);
    await testTurn(10);
    await testTurn(17);
}

run();
