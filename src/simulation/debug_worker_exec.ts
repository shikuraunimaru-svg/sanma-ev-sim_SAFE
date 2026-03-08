// @ts-nocheck

import { runSinglePath, type Action } from './engine';
import { TILES } from '../core/tile';
import { calculateShanten } from '../core/shanten';
import { getPossibleActions } from './simulator.worker';

// Mocking self.postMessage for local test
const mockPostMessage = (msg: any) => {
    console.log("POST MESSAGE:", msg.type);
};

// Copy-pasting runBatchSimulations logic for local test
function runBatchSimulationsLocal(
    config: any,
    batchSize: number
) {
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
    const possibleActions = getPossibleActions(config as any);
    console.log("Possible actions count:", possibleActions.length);

    for (const action of possibleActions) {
        console.log("Running action:", action.type, (action as any).tileInd);
        let wins = 0;
        let totalScore = 0;
        let tenpaiCount = 0;

        const forcedBatchSize = 10;
        let totalAgariTurnSum = 0;
        let agariCount = 0;

        for (let i = 0; i < forcedBatchSize; i++) {
            const mountain = new Uint8Array(108);
            mountain[0] = 28; // TILES.z2
            mountain[3] = 28; // TILES.z2
            const result = runSinglePath(
                config.myHand,
                config.fixedMentsu,
                action,
                0, 0,
                config.doraIndicators,
                config.currentTurn,
                config.isDealer,
                mountain, 108, 108,
                108,
                new Int8Array(29), new Int8Array(29), new Int8Array(27), new Int8Array(29),
                i + 1, 0
            );

            if (result.type === 'win') {
                wins++;
                totalScore += result.point;
                totalAgariTurnSum += result.totalAgariTurnSum;
                agariCount++;
            }
            if (result.isTenpai) {
                tenpaiCount++;
            }
        }

        const avgTurn = agariCount > 0 ? totalAgariTurnSum / agariCount : 0;
        const avgJun = agariCount > 0 ? Math.max(0, avgTurn - config.currentTurn) : null;

        results.push({
            action,
            winRate: wins / forcedBatchSize,
            avgScore: wins > 0 ? totalScore / wins : 0,
            ev: totalScore / forcedBatchSize,
            tenpaiRate: tenpaiCount / forcedBatchSize,
            avgJun
        });

        console.log(`Action Result: ${action.type} ev: ${totalScore / forcedBatchSize} avgJun: ${avgJun}`);
    }

    console.log("Batch completed");
    mockPostMessage({ type: 'done', results });
}

const config = {
    myHand: [TILES.m1, TILES.m1, TILES.m1, TILES.p1, TILES.p1, TILES.p1, TILES.s1, TILES.s1, TILES.s1, TILES.z1, TILES.z1, TILES.z1, TILES.z2],
    fixedMentsu: [],
    myDiscards: [],
    doraIndicators: [TILES.p9, TILES.s9],
    kitaCount: 0,
    currentTurn: 1,
    isDealer: true
};

const start = Date.now();
runBatchSimulationsLocal(config, 100);
console.log("Time taken:", Date.now() - start, "ms");
