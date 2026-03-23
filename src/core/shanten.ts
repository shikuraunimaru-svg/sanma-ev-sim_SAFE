import { toNormalFive } from './tile';
import type { Tile } from './tile';
import { SANMA_TILE_COUNT, toStandardTile, toSanmaTile } from './sanmaTiles';

/**
 * 27-ID (Sanma) Dictionary:
 * 0: 1m
 * 1: 9m
 * 2-10: pinzu
 * 11-19: souzu
 * 20-26: zihai
 * All calculations in this file MUST use exactly this 27-ID system.
 * 34-ID (0-33) is strictly prohibited to maintain 1m/9m symmetry.
 */

// Shanten calculator
// Returns -1 for Agari, 0 for Tenpai, >0 for Shanten

// Cache for shanten results
// Key: "c0,c1,...,c26|fixedCount"
const shantenCache = new Map<string, number>();

export function clearShantenCache() {
    shantenCache.clear();
}

export function calculateShanten(hand: Tile[], fixedMentsuCount: number = 0): number {
    const counts27 = new Int32Array(SANMA_TILE_COUNT);
    for (const t of hand) {
        const s = toSanmaTile(toNormalFive(t));
        if (s !== -1) counts27[s]++;
    }
    return calculateShanten27(counts27, fixedMentsuCount);
}

/**
 * High-performance shanten calculation using 27-tile count array.
 * This skips the 34->27 conversion and is optimized for simulation loops.
 */
export function calculateShanten27(counts27: number[] | Int32Array | Uint8Array, fixedMentsuCount: number = 0): number {
    // Check Cache
    // Using simple string key for now. 
    const key = counts27.join(',') + '|' + fixedMentsuCount;
    if (shantenCache.has(key)) {
        return shantenCache.get(key)!;
    }

    const breakdown = getShantenBreakdown27(Array.from(counts27), fixedMentsuCount);
    const result = Math.min(breakdown.normal, breakdown.chiitoi, breakdown.kokushi);

    // Set Cache
    shantenCache.set(key, result);

    return result;
}

export function getShantenBreakdown(hand: Tile[], fixedMentsuCount: number = 0) {
    const counts27 = new Array(SANMA_TILE_COUNT).fill(0);
    for (const t of hand) {
        const s = toSanmaTile(toNormalFive(t));
        if (s !== -1) counts27[s]++;
    }
    return getShantenBreakdown27(counts27, fixedMentsuCount);
}

// Internal function requiring 27-array
export function getShantenBreakdown27(counts: number[], fixedMentsuCount: number, logTile?: string): { normal: number, chiitoi: number, kokushi: number } {
    const normal = calculateNormalShanten(counts, fixedMentsuCount);
    let chiitoi = 99;
    let kokushi = 99;

    if (fixedMentsuCount === 0) {
        chiitoi = calculateChiitoitsuShanten(counts, logTile);
        kokushi = calculateKokushiShanten(counts);
    }

    return { normal, chiitoi, kokushi };
}

export function calculateKokushiShanten(counts: number[]): number {
    // 27-ID Yaochuu:
    // 1m(0), 9m(1)
    // 1p(2), 9p(10)
    // 1s(11), 9s(19)
    // 1z-7z(20-26)
    const yaochuu = [
        0, 1,
        2, 10,
        11, 19,
        20, 21, 22, 23, 24, 25, 26
    ];

    let uniqueYaochuu = 0;
    let hasPair = false;

    for (const t of yaochuu) {
        if (counts[t] >= 1) {
            uniqueYaochuu++;
            if (counts[t] >= 2) hasPair = true;
        }
    }

    // Shanten = 13 - uniqueYaochuu - (hasPair ? 1 : 0)
    return 13 - uniqueYaochuu - (hasPair ? 1 : 0);
}

// Normal Shanten (4 mentsu + 1 head)
export function calculateNormalShanten(counts: number[], fixedMentsuCount: number): number {
    let minShanten = 8;

    // Iterate 0-26 (SANMA_TILE_COUNT)
    for (let i = 0; i < SANMA_TILE_COUNT; i++) {
        if (counts[i] >= 2) {
            counts[i] -= 2;
            const shanten = runSearch(counts, fixedMentsuCount) - 1; // -1 for the head
            minShanten = Math.min(minShanten, shanten);
            counts[i] += 2;
        }
    }

    // Try without head
    const shantenNoHead = runSearch(counts, fixedMentsuCount);
    minShanten = Math.min(minShanten, shantenNoHead);

    return minShanten;
}

function runSearch(counts: number[], fixedMentsuCount: number): number {
    /*
      Returns standard shanten value for the remaining tiles.
      Formula: 8 - 2*(M_found + M_fixed) - T
    */

    // Ranges in 27-array:
    // Manzu: 0-1 (No Shuntsu)
    // Pinzu: 2-10 (Shuntsu allowed)
    // Souzu: 11-19 (Shuntsu allowed)
    // Zihai: 20-26 (No Shuntsu)

    const mRes = solveSuit(counts, 0, 1, false);     // Manzu
    const pRes = solveSuit(counts, 2, 10, true);     // Pinzu
    const sRes = solveSuit(counts, 11, 19, true);    // Souzu
    const zRes = solveSuit(counts, 20, 26, false);   // Zihai

    let bestShanten = 8; // Max

    for (const [mM, mT] of mRes) {
        for (const [pM, pT] of pRes) {
            for (const [sM, sT] of sRes) {
                for (const [zM, zT] of zRes) {
                    const totalM = mM + pM + sM + zM + fixedMentsuCount;
                    const totalT = mT + pT + sT + zT;

                    // Adjust if total blocks > 4
                    let validM = totalM;
                    let validT = totalT;
                    if (validM + validT > 4) {
                        validT = 4 - validM;
                        if (validT < 0) validT = 0;
                    }

                    // Formula: 8 - 2*M - T
                    const s = 8 - 2 * validM - validT;
                    if (s < bestShanten) bestShanten = s;
                }
            }
        }
    }

    return bestShanten;
}

function solveSuit(counts: number[], start: number, end: number, allowShuntsu: boolean): [number, number][] {
    // Returns array of [M, T]
    // Backtracking to find all maximal configurations

    const results: [number, number][] = [];
    const localCounts = counts.slice(start, end + 1);

    function calcTaatsu(arr: number[], canShuntsu: boolean): number {
        let t = 0;
        const temp = [...arr];
        for (let i = 0; i < temp.length; i++) {
            if (temp[i] === 0) continue;

            // Pair
            if (temp[i] >= 2) {
                temp[i] -= 2;
                t++;
                i--; // check again
                continue;
            }

            // Penchan/Kanchan/Ryanmen (Only if Shuntsu allowed)
            if (canShuntsu) {
                if (i + 1 < temp.length && temp[i + 1] > 0) {
                    temp[i]--;
                    temp[i + 1]--;
                    t++;
                    i--;
                    continue;
                }
                if (i + 2 < temp.length && temp[i + 2] > 0) {
                    temp[i]--;
                    temp[i + 2]--;
                    t++;
                    i--;
                    continue;
                }
            }
        }
        return t;
    }

    function searchExhaustive(idx: number, currentM: number) {
        if (idx >= localCounts.length) {
            // Count Taatsu
            const t = calcTaatsu(localCounts, allowShuntsu);
            results.push([currentM, t]);
            return;
        }

        const count = localCounts[idx];
        if (count === 0) {
            searchExhaustive(idx + 1, currentM);
            return;
        }

        // Try Koutsu
        if (count >= 3) {
            localCounts[idx] -= 3;
            searchExhaustive(idx, currentM + 1);
            localCounts[idx] += 3;
        }

        // Try Shuntsu
        if (allowShuntsu && idx + 2 < localCounts.length) {
            if (localCounts[idx] > 0 && localCounts[idx + 1] > 0 && localCounts[idx + 2] > 0) {
                localCounts[idx]--;
                localCounts[idx + 1]--;
                localCounts[idx + 2]--;
                searchExhaustive(idx, currentM + 1);
                localCounts[idx]++;
                localCounts[idx + 1]++;
                localCounts[idx + 2]++;
            }
        }

        // Ignore and move on (treat as part of Taatsu or floating)
        searchExhaustive(idx + 1, currentM);
    }

    searchExhaustive(0, 0);

    return results;
}

// Helper to get mentsu composition for Yaku check
// Only called when Shanten is -1 (Agari)

export type Mentsu = {
    type: 'shuntsu' | 'koutsu' | 'kantsu' | 'pair';
    tiles: Tile[];
    isOpen: boolean;
    isKan: boolean;
    kanType?: 'added' | 'minkan' | 'ankan';
    tile: Tile; // Keep for compatibility with existing yaku logic for now
};

export type HandStructure = {
    head: Tile;
    mentsu: Mentsu[];
};


export function getAgariPatterns(hand: Tile[], fixedMentsu: Mentsu[] = []): HandStructure[] {
    // Convert directly to 27-ID counts
    const counts = new Array(SANMA_TILE_COUNT).fill(0);
    for (const t of hand) {
        const s = toSanmaTile(toNormalFive(t));
        if (s !== -1) counts[s]++;
    }

    // Only Chiitoitsu and Kokushi if we are Menzen (no calls)
    const isMenzen = fixedMentsu.length === 0;

    const results: HandStructure[] = [];

    // Check Normal
    // For normal patterns, we need to decompose the PRIVATE hand into (4 - fixed) mentsu + 1 head.
    const targetMentsuCount = 4 - fixedMentsu.length;

    // Iterate over possible heads (0 to 26 for Sanma)
    for (let i = 0; i < SANMA_TILE_COUNT; i++) {
        if (counts[i] >= 2) {
            counts[i] -= 2;

            const mentsuFound: Mentsu[][] = [];
            searchMentsuDecomposition(counts, [], mentsuFound);

            for (const m of mentsuFound) {
                if (m.length === targetMentsuCount) {
                    const combined = [...fixedMentsu, ...m];
                    results.push({ head: toStandardTile(i) as Tile, mentsu: combined });
                }
            }

            counts[i] += 2;
        }
    }

    // Check Chiitoitsu
    if (isMenzen) {
        const chiitoi = getChiitoitsuStructure(counts);
        if (chiitoi) results.push(chiitoi);
    }

    // Check Kokushi
    if (isMenzen) {
        const kokushi = getKokushiStructure(counts);
        if (kokushi) results.push(kokushi);
    }

    // Duplicate Normal block removed.

    return results;
}

export function calculateChiitoitsuShanten(counts: number[], logTile?: string): number {
    let pairCount = 0;
    let singleCount = 0;
    let tripleCount = 0;

    // RULE: Evaluate full array without early break
    for (let i = 0; i < SANMA_TILE_COUNT; i++) {
        const c = counts[i];
        if (c === 1) {
            singleCount++;
        } else if (c === 2) {
            pairCount++;
        } else if (c === 3) {
            pairCount++;
            singleCount++;
            tripleCount++;
        } else if (c === 4) {
            pairCount++;
        }
    }

    if (logTile) {
        console.log("CHIITOI_COUNT", logTile, pairCount, singleCount, tripleCount);
    }

    let shanten = 6 - pairCount;
    // ensure unique requirements
    const types = pairCount + singleCount;
    if (types < 7) {
        shanten += (7 - types);
    }

    return shanten;
}

function getChiitoitsuStructure(counts: number[]): HandStructure | null {
    let pairCount = 0;
    let hasFour = false;
    for (let i = 0; i < SANMA_TILE_COUNT; i++) {
        if (counts[i] === 2) pairCount++;
        else if (counts[i] === 3) pairCount++;
        else if (counts[i] === 4) hasFour = true;
    }
    if (pairCount === 7 && !hasFour) {
        const allPairs: Mentsu[] = [];
        for (let i = 0; i < SANMA_TILE_COUNT; i++) {
            if (counts[i] === 2 || counts[i] === 3) {
                const stdTile = toStandardTile(i) as Tile;
                allPairs.push({
                    type: 'pair',
                    tile: stdTile,
                    tiles: [stdTile, stdTile],
                    isOpen: false,
                    isKan: false
                });
            }
        }
        return { head: allPairs[0].tile, mentsu: allPairs.slice(1) };
    }
    return null;
}

function getKokushiStructure(counts: number[]): HandStructure | null {
    const yaochuu = [0, 1, 2, 10, 11, 19, 20, 21, 22, 23, 24, 25, 26];
    let hasPair = false;
    let uniqueCount = 0;
    for (const t of yaochuu) {
        if (counts[t] >= 1) uniqueCount++;
        if (counts[t] >= 2) hasPair = true;
    }
    if (uniqueCount === 13 && hasPair) {
        return { head: -1 as Tile, mentsu: [] };
    }
    return null;
}

// This function is for finding all possible mentsu decompositions of a given set of tiles.
// It's a recursive backtracking function.
function searchMentsuDecomposition(counts: number[], currentMentsu: Mentsu[], results: Mentsu[][]) {
    // Find the smallest tile index that still has counts
    let idx = 0;
    while (idx < counts.length && counts[idx] === 0) idx++;

    // DEBUG LOG
    // console.log("searchMentsuDecomposition visiting idx:", idx, "counts:", counts.toString());

    // Base Case: No more tiles left
    if (idx >= counts.length) {
        results.push([...currentMentsu]);
        return;
    }

    // Try Koutsu
    if (counts[idx] >= 3) {
        counts[idx] -= 3;
        currentMentsu.push({
            type: 'koutsu',
            tile: toStandardTile(idx) as Tile,
            tiles: [toStandardTile(idx) as Tile, toStandardTile(idx) as Tile, toStandardTile(idx) as Tile],
            isOpen: false,
            isKan: false
        });
        searchMentsuDecomposition(counts, currentMentsu, results);
        currentMentsu.pop();
        counts[idx] += 3;
    }

    // Try Shuntsu (Only Pinzu/Souzu)
    // 27-ID ranges: Pinzu(2-10), Souzu(11-19)
    // Check if idx is start of a sequence
    const isPinzuStart = idx >= 2 && idx <= 8;
    const isSouzuStart = idx >= 11 && idx <= 17;

    if (isPinzuStart || isSouzuStart) {
        if (counts[idx] > 0 && counts[idx + 1] > 0 && counts[idx + 2] > 0) {
            counts[idx]--;
            counts[idx + 1]--;
            counts[idx + 2]--;
            currentMentsu.push({
                type: 'shuntsu',
                tile: toStandardTile(idx) as Tile,
                tiles: [toStandardTile(idx) as Tile, toStandardTile(idx + 1) as Tile, toStandardTile(idx + 2) as Tile],
                isOpen: false,
                isKan: false
            });
            searchMentsuDecomposition(counts, currentMentsu, results);
            currentMentsu.pop();
            counts[idx]++;
            counts[idx + 1]++;
            counts[idx + 2]++;
        }
    }
}
