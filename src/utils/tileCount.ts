import { toNormalFive, getTileType, isRedFive, TILES } from '../core/tile';
import type { Tile } from '../core/tile';
import type { Mentsu } from '../core/shanten';

export type TileCountState = {
    hand: Tile[];
    fixedMentsu: Mentsu[];
    doraIndicators: Tile[];
    kitaCount: number;
    // Future expansion: discards, other players' calls
};

export function countVisibleTiles(tile: Tile, state: TileCountState): number {
    const normTarget = toNormalFive(tile);
    let count = 0;

    // 1. Hand
    for (const t of state.hand) {
        if (toNormalFive(t) === normTarget) count++;
    }

    // 2. Fixed Mentsu
    for (const m of state.fixedMentsu) {
        for (const t of m.tiles) {
            if (toNormalFive(t) === normTarget) count++;
        }
    }

    // 3. Dora Indicators
    for (const t of state.doraIndicators) {
        if (toNormalFive(t) === normTarget) count++;
    }

    // 4. Kita (North - 4z)
    /*
      Kita count is a number (0-4).
      If the target tile is North (4z, ID 30), add kitaCount.
      Note: TILES.z4 is 30.
    */
    if (normTarget === TILES.z4) {
        count += state.kitaCount;
    }

    return count;
}

export function isTileLimitReached(tile: Tile, state: TileCountState): boolean {
    return countVisibleTiles(tile, state) >= 4;
}

export function isRedLimitReached(tile: Tile, state: TileCountState): boolean {
    if (!isRedFive(tile)) return false;
    const suit = getTileType(tile);

    // Check Hand
    let used = 0;
    for (const t of state.hand) {
        if (isRedFive(t) && getTileType(t) === suit) used++;
    }
    // Check Mentsu
    for (const m of state.fixedMentsu) {
        for (const t of m.tiles) {
            if (isRedFive(t) && getTileType(t) === suit) used++;
        }
    }
    // Check Dora
    for (const t of state.doraIndicators) {
        if (isRedFive(t) && getTileType(t) === suit) used++;
    }

    // Max 1 red per 5p/5s in generic rules?
    // Sanma usually has 2 red 5p and 2 red 5s? Or 1?
    // The previous HandInput logic checked ">= 1". Let's stick to that for now unless specified.
    // "赤${suitT === 'p' ? '5p' : '5s'}は既に1枚使用されています" -> implied max 1.
    return used >= 1;
}
