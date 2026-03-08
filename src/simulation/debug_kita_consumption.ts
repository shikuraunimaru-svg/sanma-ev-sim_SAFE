// @ts-nocheck

import { drawTileWithAutoKita, getInitialCounts, TILE_TYPES, TILES, countDora, toNormalFive } from './engine';
// Note: We need to access internal variables of runSinglePath, but we can't easily.
// I'll simulate the logic here.

const NORTH = TILES.z4;

function simulateConsumption() {
    console.log("--- North Consumption Test ---");

    let mountainSize = 50;
    let counts = new Array(TILE_TYPES.length).fill(4); // Many tiles available
    let totalInvisibleCount = counts.reduce((a, b) => a + b, 0);

    const drawTileCore = () => {
        if (mountainSize <= 0) return null;
        let rand = 0; // Force first tile to be what we want by manipulating counts
        for (let i = 0; i < TILE_TYPES.length; i++) {
            if (counts[i] > 0) {
                counts[i]--;
                totalInvisibleCount--;
                mountainSize--;
                return TILE_TYPES[i];
            }
        }
        return null;
    };

    const drawWithKita = () => {
        let draws = 0;
        while (true) {
            if (mountainSize <= 0) break;
            draws++;
            let t = drawTileCore();
            if (t === NORTH) continue;
            break;
        }
        return draws;
    };

    // Test case 1: Draw a normal tile
    counts = new Array(TILE_TYPES.length).fill(4);
    counts[TILE_TYPES.indexOf(NORTH)] = 0; // No Norths
    totalInvisibleCount = counts.reduce((a, b) => a + b, 0);
    mountainSize = 50;
    console.log("Normal Draw: draws required =", drawWithKita(), "Remaining mountain =", mountainSize);

    // Test case 2: Draw a North, then a normal tile
    counts = new Array(TILE_TYPES.length).fill(0);
    const m1Idx = TILE_TYPES.indexOf(TILES.m1);
    const nIdx = TILE_TYPES.indexOf(NORTH);
    counts[nIdx] = 1;
    counts[m1Idx] = 1;
    totalInvisibleCount = counts.reduce((a, b) => a + b, 0);
    mountainSize = 50;
    // We need to force drawTileCore to pick North first. 
    // My simple mock picks in order of TILE_TYPES.
    // Let's check order.
    console.log("NORTH index:", nIdx, "m1 index:", m1Idx);
    // If nIdx < m1Idx, it picks North first.
}

simulateConsumption();
