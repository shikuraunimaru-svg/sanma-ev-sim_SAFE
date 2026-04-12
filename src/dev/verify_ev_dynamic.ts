
import { runSinglePath, TILES, getInitialCounts, toSanmaTile } from './simulation/engine';

async function verify() {
    console.log("--- Dynamic Score EV Verification ---");

    const templateCounts = getInitialCounts();
    const workTrialCounts = new Int8Array(29);
    
    const mountain = new Uint8Array(108);
    for(let i=0; i<108; i++) mountain[i] = Math.floor(Math.random() * 29);

    const runTest = (hand: any[], label: string) => {
        for(let i=0; i<29; i++) workTrialCounts[i] = templateCounts[i];
        const workHand27 = new Int8Array(27);
        for(const t of hand) {
            const s = toSanmaTile(t);
            if(s !== -1) {
                workHand27[s]++;
                workTrialCounts[s]--; // Update counts for visibility
            }
        }
        // Remove one more for the "discard" or "draw" simulation context
        const trials = 1000;
        let wins = 0;
        let totalScore = 0;

        for (let i = 0; i < trials; i++) {
            const result = runSinglePath(
                hand,
                [],
                { type: 'discard', tile: hand[hand.length-1], tileInd: hand.length-1, riichi: false },
                0, 0, [TILES.p9], 1, true,
                mountain, 108, 70, 44,
                templateCounts, workTrialCounts, workHand27, new Int8Array(29),
                i, 2, true
            );
            if (result.win) {
                wins++;
                totalScore += result.score;
            }
        }
        console.log(`[${label}] WinRate: ${(wins/trials).toFixed(3)}, AvgScore: ${wins>0 ? Math.round(totalScore/wins) : 0}, EV: ${(totalScore/trials).toFixed(1)}`);
    };

    // 1. Cheap hand (Tanyao pinfu-ish but no dora)
    const cheapHand = [
        TILES.p2, TILES.p3, TILES.p4,
        TILES.p6, TILES.p7, TILES.p8,
        TILES.s2, TILES.s3, TILES.s4,
        TILES.s6, TILES.s7, TILES.z1, TILES.z1 
    ];
    runTest(cheapHand, "Cheap Hand");

    // 2. Expensive hand (Dora 3)
    const expensiveHand = [
        TILES.p2, TILES.p3, TILES.p4,
        TILES.p6, TILES.p7, TILES.p8,
        TILES.s2, TILES.s3, TILES.s4,
        TILES.s6, TILES.s7, TILES.p9, TILES.p9 // Assume p9 is dora (indicator p8 is not set but estimateScore considers indicators)
    ];
    // Set p9 as dora in the test call too
    runTest(expensiveHand, "Expensive Hand (?)");
}

verify().catch(console.error);
