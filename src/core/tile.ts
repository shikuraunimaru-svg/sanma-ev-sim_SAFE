export type TileType = 'm' | 'p' | 's' | 'z';
export type Tile = number; // 0-33

// IDs:
// 0-8:   1m-9m (Sanma: only 0(1m) and 8(9m) are valid)
// 9-17:  1p-9p
// 18-26: 1s-9s
// 27-33: 1z-7z (Ton, Nan, Sha, Pei, Haku, Hatsu, Chun)

export const TILES = {
    // Manzu
    m1: 0, m9: 8,
    // Pinzu
    p1: 9, p2: 10, p3: 11, p4: 12, p5: 13, p6: 14, p7: 15, p8: 16, p9: 17,
    // Souzu
    s1: 18, s2: 19, s3: 20, s4: 21, s5: 22, s6: 23, s7: 24, s8: 25, s9: 26,
    // Zihai
    z1: 27, z2: 28, z3: 29, z4: 30, z5: 31, z6: 32, z7: 33, // East, South, West, North, White, Green, Red
    // Red Fives
    p5r: 34,
    s5r: 35,
} as const;

export const TILE_COUNT = 36;

export function isManzu(t: Tile): boolean { return t >= 0 && t <= 8; }
export function isPinzu(t: Tile): boolean { return (t >= 9 && t <= 17) || t === TILES.p5r; }
export function isSouzu(t: Tile): boolean { return (t >= 18 && t <= 26) || t === TILES.s5r; }
export function isZihai(t: Tile): boolean { return t >= 27 && t <= 33; }
export function isRedFive(t: Tile): boolean { return t === TILES.p5r || t === TILES.s5r; }

export function getTileType(t: Tile): TileType {
    if (isManzu(t)) return 'm';
    if (isPinzu(t)) return 'p';
    if (isSouzu(t)) return 's';
    return 'z';
}

export function getTileNumber(t: Tile): number {
    if (t === TILES.p5r) return 5;
    if (t === TILES.s5r) return 5;
    if (isManzu(t)) return t + 1;
    if (isPinzu(t)) return t - 9 + 1;
    if (isSouzu(t)) return t - 18 + 1;
    return t - 27 + 1;
}

// Normalize Red Five to Normal Five ID
export function toNormalFive(t: Tile): Tile {
    if (t === TILES.p5r) return TILES.p5;
    if (t === TILES.s5r) return TILES.s5;
    return t;
}

export function isValidSanmaTile(t: Tile): boolean {
    if (t < 0 || t >= TILE_COUNT) return false;
    if (isManzu(t)) {
        return t === TILES.m1 || t === TILES.m9;
    }
    return true;
}

export function isYaochuu(t: Tile): boolean {
    if (!isValidSanmaTile(t)) return false;
    if (isZihai(t)) return true;
    const num = getTileNumber(t);
    return num === 1 || num === 9;
}

export function tileToString(t: Tile): string {
    const type = getTileType(t);
    const num = getTileNumber(t);
    if (isRedFive(t)) return `r5${type}`;
    return `${num}${type}`;
}

export function stringToTile(str: string): Tile {
    // Handle r5p, r5s
    if (str === 'r5p') return TILES.p5r;
    if (str === 'r5s') return TILES.s5r;

    if (str.length !== 2) throw new Error(`Invalid tile string: ${str}`);
    const num = parseInt(str[0], 10);
    const type = str[1] as TileType;

    if (isNaN(num)) throw new Error(`Invalid tile number: ${str}`);

    let offset = 0;
    switch (type) {
        case 'm': offset = 0; break;
        case 'p': offset = 9; break;
        case 's': offset = 18; break;
        case 'z': offset = 27; break;
        default: throw new Error(`Invalid tile type: ${type}`);
    }

    const tile = offset + num - 1;
    if (!isValidSanmaTile(tile)) {
        // Warning logic same as before
    }
    return tile;
}

export const ALL_SANMA_TILES: Tile[] = [];
for (let i = 0; i < TILE_COUNT; i++) {
    if (isValidSanmaTile(i)) {
        ALL_SANMA_TILES.push(i);
    }
}

// AKA DORA handling for simulation (red 5p, red 5s)
// Handled by isRedFive check now.

export function sortHand(hand: Tile[]): Tile[] {
    return [...hand].sort((a, b) => {
        const na = toNormalFive(a);
        const nb = toNormalFive(b);
        if (na !== nb) return na - nb;
        return a - b;
    });
}

/**
 * Returns the 4 tiles for a Kan based on a representative tile.
 * If the tile is a 5 (p/s), it includes exactly one red tile.
 */
export function getKanTiles(t: Tile): Tile[] {
    const norm = toNormalFive(t);
    const num = getTileNumber(norm);
    const type = getTileType(norm);

    if (num === 5 && (type === 'p' || type === 's')) {
        const red = type === 'p' ? TILES.p5r : TILES.s5r;
        return [red, norm, norm, norm];
    }
    return [norm, norm, norm, norm];
}

/**
 * Returns 3 tiles for a Pon.
 * Includes a red tile only if the input tile 't' is a red five.
 */
export function getPonTiles(t: Tile): Tile[] {
    const norm = toNormalFive(t);
    if (isRedFive(t)) {
        return [t, norm, norm];
    }
    return [norm, norm, norm];
}
