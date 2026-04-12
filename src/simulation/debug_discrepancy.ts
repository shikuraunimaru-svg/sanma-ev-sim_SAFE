
import * as Engine from './engine';
import { TILES, tileToString, toNormalFive, toSanmaTile } from '../core/tile';

async function investigate() {
    console.log("=== Hypothesis Test: Dora Indicator vs Wait Quality ===");

    const hand14 = [
        TILES.p2, TILES.p3, TILES.p3, TILES.p4, TILES.p4, TILES.p7, TILES.p8, TILES.p9,
        TILES.s2, TILES.s3, TILES.s5r, TILES.s6, TILES.s7, TILES.s8
    ];

    const action3s = { type: 'discard', tile: TILES.s3, tileInd: 9, riichi: false } as const;
    const action2s = { type: 'discard', tile: TILES.s2, tileInd: 8, riichi: false } as const;

    const handAfter3s = [...hand14]; handAfter3s.splice(9, 1);
    const handAfter2s = [...hand14]; handAfter2s.splice(8, 1);

    console.log("\n[TEST 1] Original (Indicator s4, Dora s5)");
    await runSim(handAfter3s, handAfter2s, action3s, action2s, [TILES.s4]);

    console.log("\n[TEST 2] Neutral (Indicator z1, Dora z2)");
    await runSim(handAfter3s, handAfter2s, action3s, action2s, [TILES.z1]);
}

async function runSim(h3s: any, h2s: any, a3s: any, a2s: any, indicators: any[]) {
    const trials = 3000;
    const stats3s = await simulate(h3s, a3s, indicators, trials, 0);
    const stats2s = await simulate(h2s, a2s, indicators, trials, 1);
    
    console.log(`Results:`);
    console.log(`  打3s: EV=${stats3s.ev.toFixed(2)}, WinRate=${(stats3s.winRate*100).toFixed(1)}%`);
    console.log(`  打2s: EV=${stats2s.ev.toFixed(2)}, WinRate=${(stats2s.winRate*100).toFixed(1)}%`);
    console.log(`  Diff: ${(stats3s.ev - stats2s.ev).toFixed(2)}`);
}

async function simulate(hand: any, action: any, indicators: any[], trials: number, seedOffset: number) {
    let sumEV = 0;
    let wins = 0;
    const poolCounts = Engine.getInitialCounts();
    // Simplified visible
    const visible = [...hand, ...indicators];
    for(const t of visible) {
        const idx = Engine.TILE_TYPES.indexOf(t);
        if (idx !== -1 && poolCounts[idx] > 0) poolCounts[idx]--;
    }
    const wallBase: number[] = [];
    for(let i=0; i<poolCounts.length; i++) for(let j=0; j<poolCounts[i]; j++) wallBase.push(i);

    for(let i=0; i<trials; i++) {
        const mountain = new Uint8Array(wallBase);
        shuffle(mountain, i + seedOffset * 10000);
        const res = Engine.runSinglePath(
            hand, [], action, 0, 0, indicators, 4, false,
            mountain, mountain.length, 60, 40,
            poolCounts, new Int8Array(29), new Int8Array(27), new Int8Array(29),
            i, 0, 0, 9999
        );
        sumEV += res.point;
        if (res.win) wins++;
    }
    return { ev: sumEV / trials, winRate: wins / trials };
}

function shuffle(arr: Uint8Array, seed: number) {
    let state = seed >>> 0;
    for (let i = arr.length - 1; i > 0; i--) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const j = state % (i + 1);
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
}

investigate();
