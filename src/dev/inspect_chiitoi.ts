import { TILES, toNormalFive, tileToString } from './core/tile';
import { scoreWinningHandFast, countDora, getAgariPatternsCached, GameState } from './simulation/engine';

async function test() {
    // Hand: 22p, r55p, 99p, 66s, 77s, 55s, z7z7 (7 pairs)
    const hand = [
        TILES.p2, TILES.p2, 
        TILES.p5r, TILES.p5,
        TILES.p9, TILES.p9,
        TILES.s6, TILES.s6,
        TILES.s7, TILES.s7,
        TILES.s5, TILES.s5,
        TILES.z7, TILES.z7
    ];
    
    const hand27 = new Int32Array(27);
    for (const t of hand) {
        const s = toNormalFive(t);
        const idx = [0,8, 9,10,11,12,13,14,15,16,17, 18,19,20,21,22,23,24,25,26, 27,28,29,30,31,32,33]
            .indexOf(s);
        if (idx !== -1) hand27[idx]++;
    }

    const currentMentsu: any[] = [];
    const patterns = getAgariPatternsCached(hand, currentMentsu, hand27);

    console.log("Found Patterns count:", patterns.length);
    for (const p of patterns) {
        console.log("Pattern:", {
            head: p.head !== -1 ? tileToString(p.head) : -1,
            mentsu: p.mentsu.map(m => ({ type: m.type, tile: tileToString(m.tile) }))
        });
    }

    const state: GameState = {
        isDealer: true,
        isTsumo: true,
        isRiichi: true,
        turnCount: 8,
        discardCount: 8,
        hasCallOccurred: false,
        doraCount: 4, // 2p x2, Red 1, Normal 1? No, 2p x2, Red 1 + something.
        uraDoraCount: 0,
        kitaCount: 1,
        bakaze: TILES.z1,
        jikaze: TILES.z1,
        winningTile: TILES.z7
    };

    for (const p of patterns) {
        const info = scoreWinningHandFast(hand, p, state);
        console.log("Result:", info);
    }
}

test();
