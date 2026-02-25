
import { runSinglePath } from './engine';
import { TILES } from '../core/tile';
import { calculateShanten } from '../core/shanten';

// Mocking self.postMessage for local test
const mockPostMessage = (msg: any) => {
    console.log("POST MESSAGE:", msg.type);
};

// Copy-pasting runBatchSimulations logic for local test
function runBatchSimulationsLocal(
    config: any,
    batchSize: number
) {
    const { myHand, fixedMentsu, kitaCount, doraIndicators, currentTurn, isDealer } = config;
    console.log("Worker started");
    console.log("Original batchSize:", batchSize);

    const visible = [
        ...config.myHand,
        ...config.myDiscards,
        ...config.doraIndicators
    ];
    for (const m of config.fixedMentsu) {
        visible.push(...m.tiles);
    }

    const results: any[] = [];
    const possibleActions: any[] = [
        { type: 'discard', tile: TILES.z2 }
    ];
    console.log("Possible actions count:", possibleActions.length);

    for (const action of possibleActions) {
        console.log("Running action:", action.type);
        let wins = 0;
        let totalScore = 0;
        let tenpaiCount = 0;

        const forcedBatchSize = 1;
        for (let i = 0; i < forcedBatchSize; i++) {
            console.log("Running single path");
            const result = runSinglePath(
                myHand,
                fixedMentsu,
                action,
                visible,
                kitaCount,
                doraIndicators,
                currentTurn,
                isDealer
            );

            if (result.type === 'win') {
                wins++;
                totalScore += result.point;
            }
            if (result.isTenpai) {
                tenpaiCount++;
            }
        }

        results.push({
            action,
            winRate: wins / forcedBatchSize,
            avgScore: wins > 0 ? totalScore / wins : 0,
            ev: totalScore / forcedBatchSize,
            tenpaiRate: tenpaiCount / forcedBatchSize
        });
    }

    console.log("Batch completed");
    mockPostMessage({ type: 'done', results });
}

const config = {
    myHand: [TILES.m1, TILES.m1, TILES.m1, TILES.p1, TILES.p1, TILES.p1, TILES.s1, TILES.s1, TILES.s1, TILES.z1, TILES.z1, TILES.z1, TILES.z2],
    fixedMentsu: [],
    myDiscards: [],
    doraIndicators: [TILES.p9],
    kitaCount: 0,
    currentTurn: 1,
    isDealer: true
};

const start = Date.now();
runBatchSimulationsLocal(config, 100);
console.log("Time taken:", Date.now() - start, "ms");
