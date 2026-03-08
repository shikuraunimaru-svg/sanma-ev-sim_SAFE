// @ts-nocheck

import { runSinglePath } from './engine';
import { TILES } from '../core/tile';

async function debugFreeze() {
    console.log("Starting Debug Simulation...");

    const hand = [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p4, TILES.p5, TILES.p6,
        TILES.s7, TILES.s8, TILES.s9,
        TILES.z1, TILES.z1, TILES.z1,
        TILES.z2
    ];

    const action = { type: 'discard' as const, tile: TILES.z2 };

    // Visible tiles (minimal for testing)
    const visible = [...hand];

    try {
        const result = runSinglePath(hand,
            [],
            action,
            visible,
            0,
            [TILES.p1],
            1,
            true, new Uint8Array(108), 108, 70, 44, new Int8Array(34), new Int8Array(29), new Int8Array(27), new Int8Array(29), 12345, 0);
        console.log("Simulation finished successfully:", result);
    } catch (e: any) {
        console.error("FREEZE DETECTED OR ERROR:", e.message);
    }
}

debugFreeze();
