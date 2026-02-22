/*
import { simulateAllDiscards } from './simulation/simulator.worker';
import { TILES } from './core/tile';
import type { SimulationConfig } from './simulation/engine';

console.log("=== Testing Multi-Stage Monte Carlo Simulation ===");

// Create a scenario with obvious bad choices and good choices
// Hand: 1p 2p 3p 4p 5p 6p 7p 8p 9p 1z 1z 2z 2z + Draw 3z
// Wait 1z/2z pair, or discard 3z.
// Actually let's make it more obvious.
// Full flush vs distinct non-flush discard.

const hand = [
    TILES.m1, TILES.m9, // Orphans
    TILES.p1, TILES.p2, TILES.p3, // Meld
    TILES.s1, TILES.s1, TILES.s1, // Meld
    TILES.z1, TILES.z1, TILES.z1, // Meld
    TILES.z5, TILES.z5, TILES.z5  // Meld (almost)
];
// Hand length 14.
// Discard m1 or m9 should be good?
// Wait, m1 m9 are isolated. 
// If we discard m1, we have [m9, p123, s111, z111, z555]. tenpai?
// p123 + s111 + z111 + z555 + m9 (tanki).
// Discarding m1 or m9 leads to Tenpai.
// Discarding p1 breaks a meld.
// So m1, m9 should be high EV. p1 should be lower.

const config: SimulationConfig = {
    myHand: hand,
    fixedMentsu: [],
    myDiscards: [],
    doraIndicators: [TILES.p9],
    kitaCount: 0,
    northRemaining: 4,
    trials: 5000, // This is ignored by worker logic now, but valid for config type
    currentTurn: 5,
    isDealer: true
};

const results = simulateAllDiscards(config);

console.log("\n=== Test Results Summary ===");
// Check trials count for top and bottom actions
const sorted = [...results].sort((a, b) => b.ev - a.ev);

const best = sorted[0];

console.log(`Best: ${best.action.type === 'discard' ? best.action.tile : 'kita'} EV: ${best.ev}`);
// We can't see the internal trial count from result result,
// BUT the worker logs it. So we rely on the console output of the test.
*/
