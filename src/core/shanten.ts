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

export const DEBUG_SHANTEN_KEY = false;
const debugOldCache = new Map<string, number>();

// Cache for shanten results
// Key: packed BigInt of 27-tile counts and fixedCount
const shantenCache = new Map<bigint, number>();

export let suitCacheHit = 0;
export let suitCacheMiss = 0;
export let solveSuitCallCount = 0;
export const suitCache = new Map<number, [number, number][]>();
const taatsuTemp = new Int32Array(27); // Used in zero-allocation taatsu calculation

export function resetSuitStats() {
    suitCacheHit = 0;
    suitCacheMiss = 0;
    solveSuitCallCount = 0;
}

export function clearShantenCache() {
    resetSuitStats();
    if (DEBUG_SHANTEN_KEY) {
        debugOldCache.clear();
    }
}

/**
 * Packs 27 tile counts (max 4 each, 3 bits) and fixedMentsuCount (top bits) into a BigInt.
 */
export function packCounts27(counts27: number[] | Int32Array | Uint8Array, fixedMentsuCount: number): bigint {
    let packed = BigInt(fixedMentsuCount) << 81n;
    for (let i = 0; i < 27; i++) {
        // limit count to 4 (fits in 3 bits) safely
        packed |= (BigInt(counts27[i]) & 7n) << BigInt(i * 3);
    }
    return packed;
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
    const key = packCounts27(counts27, fixedMentsuCount);
    const cached = shantenCache.get(key);

    if (DEBUG_SHANTEN_KEY) {
        const oldKey = counts27.join(',') + '|' + fixedMentsuCount;
        console.log(`[Shanten] Old Key: ${oldKey} | New Key: ${key}`);
        
        const oldCached = debugOldCache.get(oldKey);
        if (cached !== undefined && oldCached !== undefined && cached !== oldCached) {
            console.error(`[ERROR] Shanten Cache mismatch! Old: ${oldCached}, New: ${cached} (OldKey: ${oldKey})`);
        }
    }

    if (cached !== undefined) {
        return cached;
    }

    const breakdown = getShantenBreakdown27(counts27, fixedMentsuCount);
    const result = Math.min(breakdown.normal, breakdown.chiitoi, breakdown.kokushi);

    shantenCache.set(key, result);

    if (DEBUG_SHANTEN_KEY) {
        const oldKey = counts27.join(',') + '|' + fixedMentsuCount;
        debugOldCache.set(oldKey, result);
    }

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
export function getShantenBreakdown27(counts: number[] | Int32Array | Uint8Array, fixedMentsuCount: number, logTile?: string): { normal: number, chiitoi: number, kokushi: number } {
    const normal = calculateNormalShanten(counts, fixedMentsuCount);
    let chiitoi = 99;
    let kokushi = 99;

    if (fixedMentsuCount === 0) {
        chiitoi = calculateChiitoitsuShanten(counts, logTile);
        kokushi = calculateKokushiShanten(counts);
    }

    return { normal, chiitoi, kokushi };
}

export function calculateKokushiShanten(counts: number[] | Int32Array | Uint8Array): number {
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
export function calculateNormalShanten(counts: number[] | Int32Array | Uint8Array, fixedMentsuCount: number): number {
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

function runSearch(counts: number[] | Int32Array | Uint8Array, fixedMentsuCount: number): number {
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

function solveSuit(counts: number[] | Int32Array | Uint8Array, start: number, end: number, allowShuntsu: boolean): [number, number][] {
    solveSuitCallCount++;

    let key = allowShuntsu ? 1 : 0;
    const len = end - start + 1;
    key = key * 32 + len;
    let allZero = true;
    for (let i = start; i <= end; i++) {
        const c = counts[i];
        if (c > 0) allZero = false;
        key = key * 8 + c;
    }

    if (allZero) return [[0, 0]];

    const cached = suitCache.get(key);
    if (cached) {
        suitCacheHit++;
        return cached;
    }
    suitCacheMiss++;

    // Returns array of [M, T]
    // Backtracking to find all maximal configurations

    const results: [number, number][] = [];

    function calcTaatsu(canShuntsu: boolean): number {
        let t = 0;
        // Copy to global taatsuTemp to avoid GC, avoiding allocating new arrays
        for (let i = start; i <= end; i++) {
            taatsuTemp[i] = counts[i];
        }
        for (let i = start; i <= end; i++) {
            if (taatsuTemp[i] === 0) continue;

            // Pair
            if (taatsuTemp[i] >= 2) {
                taatsuTemp[i] -= 2;
                t++;
                i--; // check again
                continue;
            }

            // Penchan/Kanchan/Ryanmen (Only if Shuntsu allowed)
            if (canShuntsu) {
                if (i + 1 <= end && taatsuTemp[i + 1] > 0) {
                    taatsuTemp[i]--;
                    taatsuTemp[i + 1]--;
                    t++;
                    i--;
                    continue;
                }
                if (i + 2 <= end && taatsuTemp[i + 2] > 0) {
                    taatsuTemp[i]--;
                    taatsuTemp[i + 2]--;
                    t++;
                    i--;
                    continue;
                }
            }
        }
        return t;
    }

    function searchExhaustive(idx: number, currentM: number) {
        if (idx > end) {
            // Count Taatsu
            const t = calcTaatsu(allowShuntsu);
            results.push([currentM, t]);
            return;
        }

        const count = counts[idx];
        if (count === 0) {
            searchExhaustive(idx + 1, currentM);
            return;
        }

        // Try Koutsu
        if (count >= 3) {
            counts[idx] -= 3;
            searchExhaustive(idx, currentM + 1);
            counts[idx] += 3;
        }

        // Try Shuntsu
        if (allowShuntsu && idx + 2 <= end) {
            if (counts[idx] > 0 && counts[idx + 1] > 0 && counts[idx + 2] > 0) {
                counts[idx]--;
                counts[idx + 1]--;
                counts[idx + 2]--;
                searchExhaustive(idx, currentM + 1);
                counts[idx]++;
                counts[idx + 1]++;
                counts[idx + 2]++;
            }
        }

        // Ignore and move on (treat as part of Taatsu or floating)
        searchExhaustive(idx + 1, currentM);
    }

    searchExhaustive(start, 0);

    suitCache.set(key, results);
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

export function calculateChiitoitsuShanten(counts: number[] | Int32Array | Uint8Array, logTile?: string): number {
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
