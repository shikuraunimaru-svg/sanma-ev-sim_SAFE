
import { runSinglePath } from './engine';
import { TILES } from '../core/tile';

const hand = [
    TILES.p2, TILES.p3, TILES.p4,
    TILES.p5, TILES.p6, TILES.p7,
    TILES.s2, TILES.s3, TILES.s4,
    TILES.s5, TILES.s6, // 56s wait for 4s, 7s
    TILES.z1, TILES.z1, // East pair
    TILES.p9 // 9p is Dora in hand (indicator is 8p)
];

const config = {
    myHand: hand,
    fixedMentsu: [],
    kitaCount: 0,
    doraIndicators: [TILES.p8],
    currentTurn: 1,
    isDealer: true
};

function testAction(action: any, label: string) {
    let totalScore = 0;
    let wins = 0;
    const trials = 1000;

    for (let i = 0; i < trials; i++) {
        const result = runSinglePath(
            config.myHand,
            config.fixedMentsu,
            { ...action, tileInd: 0 },
            config.kitaCount,
            0,
            config.doraIndicators,
            config.currentTurn,
            config.isDealer,
            new Uint8Array(108), 108, 70, 44,
            new Int8Array(34),
            new Int8Array(29), new Int8Array(27), new Int8Array(29),
            12345, 0
        );

        if (result.type === 'win') {
            wins++;
            totalScore += result.point;
        }
    }

    console.log(`${label}:`);
    console.log(`  Wins: ${wins}/${trials}`);
    console.log(`  Average Points (per win): ${wins > 0 ? Math.round(totalScore / wins) : 0}`);
    console.log(`  Expected Value: ${Math.round(totalScore / trials)}`);
}

console.log("--- Comparing Riichi vs Dama ---");
testAction({ type: 'discard', tile: TILES.z3, riichi: false }, "Dama (z3 discard)");
testAction({ type: 'discard', tile: TILES.z3, riichi: true }, "Riichi (z3 discard)");
