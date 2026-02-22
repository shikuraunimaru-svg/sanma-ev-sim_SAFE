import { simulateAllDiscards } from './simulator.worker';
import { TILES } from '../core/tile';
import type { SimulationConfig } from './engine';

// Mock Config
const config: SimulationConfig = {
    myHand: [TILES.m1, TILES.m1, TILES.m1, TILES.p1, TILES.p2, TILES.p3, TILES.s1, TILES.s2, TILES.s3, TILES.z1, TILES.z1, TILES.z2, TILES.z2, TILES.z3],
    fixedMentsu: [],
    myDiscards: [],
    doraIndicators: [TILES.z5], // Red 5s as dora indicator
    kitaCount: 0,
    trials: 100, // Not used by simulateAllDiscards in validation mode (it uses 2000/5000 constants)
    currentTurn: 1,
    isDealer: true,
    validationMode: true
};

console.log("Running Validation Mode Test...");
const result = simulateAllDiscards(config);

console.log("Result keys:", Object.keys(result));
if (result.csvReport) {
    console.log("CSV Report Generated!");
    const lines = result.csvReport.split('\n');
    console.log(`CSV Lines: ${lines.length}`);
    console.log("Header:", lines[0]);
    console.log("First Row:", lines[1]);

    if (lines.length > 2) {
        console.log("Test Passed: CSV content present.");
    } else {
        console.error("Test Failed: CSV is empty or too short.");
        throw new Error("Test Failed");
    }
} else {
    console.error("Test Failed: No CSV Report returned.");
    throw new Error("Test Failed");
}
