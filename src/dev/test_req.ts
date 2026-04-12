import { winProbTable } from '../data/winProbTable.js';

let hasUndefined = false;
let t1Extreme = false;

for (let t = 1; t <= 18; t++) {
    for (let k = 1; k <= 14; k++) {
        if ((winProbTable as any)[t]?.[k] === undefined) {
            console.log(`undefined found at t=${t}, k=${k}`);
            hasUndefined = true;
        }
        if (t === 1) {
            const val = (winProbTable as any)[t]?.[k];
            if (val > 0.3) { // What is "extremely small"? 1 - (1 - 14/68) = 0.205 max for t=1.
                console.log(`t=1, k=${k} is suspiciously large: ${val}`);
                t1Extreme = true;
            }
        }
    }
}

if (!hasUndefined) console.log("No undefined values found in 1..18, 1..14 range.");
if (!t1Extreme) console.log("t=1 values are correctly bounded (extremely small).");
