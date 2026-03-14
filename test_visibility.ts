
import { TILES, toSanmaTile } from './src/core/tile';
import { getInitialCounts, TILE_TYPES } from './src/simulation/engine';

const myHand = [
    TILES.p1, TILES.p2, TILES.p2, TILES.p3, TILES.p3, TILES.p5,
    TILES.s5, TILES.s5, TILES.s6, TILES.s7, TILES.s7, TILES.s8,
    TILES.z3, TILES.z3
];
const doraIndicators = [TILES.p4];
const visible = [...myHand, ...doraIndicators];

const visibilityCounts29 = getInitialCounts();
for (const t of visible) {
    const idx = TILE_TYPES.indexOf(t);
    if (idx !== -1 && visibilityCounts29[idx] > 0) {
        visibilityCounts29[idx]--;
    }
}

const ukeireCounts27 = new Int8Array(27);
for (let i = 0; i < 29; i++) {
    const s = toSanmaTile(TILE_TYPES[i]);
    if (s !== -1) ukeireCounts27[s] += visibilityCounts29[i];
}

console.log("Ukeire Counts 27:");
for (let i = 0; i < 27; i++) {
    if (ukeireCounts27[i] !== 4) {
        // Find which tile it is
        let tileName = "unknown";
        for(let t34=0; t34<34; t34++) {
            if (toSanmaTile(t34) === i) {
                // Find name
                tileName = `${t34}`;
                break;
            }
        }
        console.log(`Index ${i} (${tileName}): ${ukeireCounts27[i]}`);
    }
}
