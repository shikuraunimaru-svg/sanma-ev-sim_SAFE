import { isValidSanmaTile, TILES } from '../core/tile';
import type { Tile } from '../core/tile';

export function generateWall(): Tile[] {
    const wall: Tile[] = [];
    // 4 of each valid tile
    // Sanma Wall Generation
    // Original loop was 0..33. Now TILE_COUNT is 36.
    // We only iterate up to 33 (TILES.z7) to avoid double counting red fives which are > 33.
    // Red fives (34, 35) are added specifically when we hit 5p (13) and 5s (22).

    const Z7_INDEX = 33;

    for (let t = 0; t <= Z7_INDEX; t++) {
        if (isValidSanmaTile(t)) {
            // Is it 5p or 5s?
            if (t === TILES.p5) {
                // 3 Normal + 1 Red
                for (let i = 0; i < 3; i++) wall.push(t);
                wall.push(TILES.p5r);
            } else if (t === TILES.s5) {
                // 3 Normal + 1 Red
                for (let i = 0; i < 3; i++) wall.push(t);
                wall.push(TILES.s5r);
            } else {
                // 4 Normal
                for (let i = 0; i < 4; i++) wall.push(t);
            }
        }
    }
    return shuffle(wall);
}

// Fisher-Yates shuffle
function shuffle(array: Tile[]): Tile[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Helper to remove tiles from wall (for fixed hand simulation)
// Input: full wall, tiles to remove. Returns remaining wall.
export function removeTilesFromWall(wall: Tile[], tilesToRemove: Tile[]): Tile[] {
    const newWall = [...wall];
    for (const t of tilesToRemove) {
        const idx = newWall.indexOf(t);
        if (idx !== -1) {
            newWall.splice(idx, 1);
        } else {
            // If tile not found in wall (e.g. user input 5 of same tile? or invalid tile), ignore or warn.
            // For simulation robustness, we ignore.
        }
    }
    return newWall;
}
