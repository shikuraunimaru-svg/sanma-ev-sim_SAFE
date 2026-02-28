
// Sanma 27-tile mapping
// Removes 2m-8m.
// 0: 1m (Standard 0)
// 1: 9m (Standard 8)
// 2-10: 1p-9p (Standard 9-17)
// 11-19: 1s-9s (Standard 18-26)
// 20-26: 1z-7z (Standard 27-33)

export const SANMA_TILE_COUNT = 27;

// Mapping array: index = 34-ID, value = 27-ID (-1 if invalid)
const TO_SANMA_MAP = [
    0, -1, -1, -1, -1, -1, -1, -1, 1, // 0-8: 1m..9m (Only 1m, 9m valid)
    2, 3, 4, 5, 6, 7, 8, 9, 10,       // 9-17: 1p..9p
    11, 12, 13, 14, 15, 16, 17, 18, 19, // 18-26: 1s..9s
    20, 21, 22, 23, 24, 25, 26        // 27-33: 1z..7z
];

// Inverse mapping: index = 27-ID, value = 34-ID
const TO_STANDARD_MAP = [
    0, 8,                               // 0-1: 1m, 9m
    9, 10, 11, 12, 13, 14, 15, 16, 17,  // 2-10: 1p..9p
    18, 19, 20, 21, 22, 23, 24, 25, 26, // 11-19: 1s..9s
    27, 28, 29, 30, 31, 32, 33          // 20-26: 1z..7z
];

export function toSanmaTile(t34: number): number {
    if (t34 < 0 || t34 >= 34) return -1;
    return TO_SANMA_MAP[t34];
}

export function toStandardTile(t27: number): number {
    if (t27 < 0 || t27 >= 27) return 0; // Default or throw?
    return TO_STANDARD_MAP[t27];
}

