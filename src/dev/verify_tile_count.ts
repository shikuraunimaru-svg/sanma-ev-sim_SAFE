import { countVisibleTiles, isTileLimitReached } from './utils/tileCount';
import type { TileCountState } from './utils/tileCount';
import { TILES } from './core/tile';

function test() {
    console.log("=== Testing Tile Count Logic ===");

    // Case 1: 4 Kita, 0 Hand
    const state1: TileCountState = {
        hand: [],
        fixedMentsu: [],
        doraIndicators: [],
        kitaCount: 4
    };
    console.log("Case 1: Kita=4");
    console.log("Count for 4z:", countVisibleTiles(TILES.z4, state1), "Expected: 4");
    console.log("Limit Reached for 4z:", isTileLimitReached(TILES.z4, state1), "Expected: true");

    // Case 2: 3 Kita, 1 Hand
    const state2: TileCountState = {
        hand: [TILES.z4],
        fixedMentsu: [],
        doraIndicators: [],
        kitaCount: 3
    };
    console.log("\nCase 2: Kita=3, Hand=1(4z)");
    console.log("Count for 4z:", countVisibleTiles(TILES.z4, state2), "Expected: 4");
    console.log("Limit Reached for 4z:", isTileLimitReached(TILES.z4, state2), "Expected: true");

    // Case 3: 0 Kita, 3 Hand
    const state3: TileCountState = {
        hand: [TILES.z4, TILES.z4, TILES.z4],
        fixedMentsu: [],
        doraIndicators: [],
        kitaCount: 0
    };
    console.log("\nCase 3: Kita=0, Hand=3(4z)");
    console.log("Count for 4z:", countVisibleTiles(TILES.z4, state3), "Expected: 3");
    console.log("Limit Reached for 4z:", isTileLimitReached(TILES.z4, state3), "Expected: false");

    // Case 4: Other tiles (1m)
    const state4: TileCountState = {
        hand: [TILES.m1, TILES.m1, TILES.m1],
        fixedMentsu: [],
        doraIndicators: [TILES.m1],
        kitaCount: 0
    };
    console.log("\nCase 4: Hand=3(1m), Dora=1(1m)");
    console.log("Count for 1m:", countVisibleTiles(TILES.m1, state4), "Expected: 4");
    console.log("Limit Reached for 1m:", isTileLimitReached(TILES.m1, state4), "Expected: true");

    // Case 5: Pon
    const state5: TileCountState = {
        hand: [],
        fixedMentsu: [{ type: 'koutsu', tile: TILES.z4, tiles: [TILES.z4, TILES.z4, TILES.z4], isOpen: true, isKan: false }],
        doraIndicators: [],
        kitaCount: 0
    };
    console.log("\nCase 5: Pon(4z)");
    console.log("Count for 4z:", countVisibleTiles(TILES.z4, state5), "Expected: 3");

    // Case 6: Pon(4z) + Kita=1 => Total 4
    const state6: TileCountState = {
        ...state5,
        kitaCount: 1
    };
    console.log("\nCase 6: Pon(4z) + Kita=1");
    console.log("Count for 4z:", countVisibleTiles(TILES.z4, state6), "Expected: 4");
    console.log("Limit Reached for 4z:", isTileLimitReached(TILES.z4, state6), "Expected: true");
}

test();
