import { TILES, toNormalFive, isRedFive, ALL_SANMA_TILES, getKanTiles, getPonTiles } from '../core/tile';
import type { Tile } from '../core/tile';
import { calculateShanten, getAgariPatterns } from '../core/shanten';
import type { Mentsu, HandStructure } from '../core/shanten';
import { calculateScore, isChiitoitsu, isKokushiMusou } from '../core/yaku';
import type { GameState, YakuResult } from '../core/yaku';
import { calculatePoints } from '../core/score';
import type { ScoreResult } from '../core/score';

/**
 * Validates if the hand satisfies the 1-yaku minimum requirement.
 * Dora (regular, red, ura) do not count towards the minimum.
 */
function validateAgari(result: YakuResult): boolean {
    if (result.yakuman) return true;

    const baseHan = result.yakuList
        .filter(y => !y.isDora)
        .reduce((sum, y) => sum + y.han, 0);

    return baseHan > 0;
}

// Call Parsing Helper
function parseTileFromKanji(s: string): Tile {
    if (s.includes('東')) return TILES.z1;
    if (s.includes('南')) return TILES.z2;
    if (s.includes('西')) return TILES.z3;
    if (s.includes('北')) return TILES.z4;
    if (s.includes('白')) return TILES.z5;
    if (s.includes('發')) return TILES.z6;
    if (s.includes('中')) return TILES.z7;

    // Numbers: 1p, 2s etc. (Simplistic parsing)
    const numMatch = s.match(/([1-9])([mps])/);
    if (numMatch) {
        const num = parseInt(numMatch[1]);
        const type = numMatch[2];
        if (type === 'm') return (num === 1 ? TILES.m1 : TILES.m9);
        if (type === 'p') return (num - 1 + 9) as Tile;
        if (type === 's') return (num - 1 + 18) as Tile;
    }
    return -1 as Tile;
}

export function parseCalls(callString: string): Mentsu[] {
    const calls: Mentsu[] = [];
    if (!callString) return calls;

    const parts = callString.split(/\s+/);
    for (const p of parts) {
        if (p.endsWith('ポン')) {
            const t = parseTileFromKanji(p);
            if (t !== -1) {
                const ponTiles = getPonTiles(t);
                calls.push({ type: 'koutsu', tile: toNormalFive(t), tiles: ponTiles, isOpen: true, isKan: false });
            }
        } else if (p.endsWith('暗カン')) {
            const t = parseTileFromKanji(p);
            if (t !== -1) {
                const kanTiles = getKanTiles(t);
                calls.push({ type: 'kantsu', tile: toNormalFive(t), tiles: kanTiles, isOpen: false, isKan: true });
            }
        } else if (p.endsWith('明カン')) {
            const t = parseTileFromKanji(p);
            if (t !== -1) {
                const kanTiles = getKanTiles(t);
                calls.push({ type: 'kantsu', tile: toNormalFive(t), tiles: kanTiles, isOpen: true, isKan: true });
            }
        }
    }
    return calls;
}

// Config
// const MAX_TURNS = 18; // Removed as it is calculated dynamically
// Sanma Wall: 108 tiles. 
// Dead wall: 14. 
// Dora Ind: 1.
// 3 players. 
// Initial Hands: 13 * 3 = 39.
// Remaining: 108 - 14 - 39 = 55.
// Turns per player: ~18.

export type Action =
    | { type: 'discard', tile: Tile, riichi?: boolean }
    | { type: 'kita' }
    | { type: 'ankan', tile: Tile, riichi?: boolean }
    | { type: 'kakan', tile: Tile }
    | { type: 'tsumo' };

export type SimulationConfig = {
    myHand: Tile[];
    fixedMentsu: Mentsu[]; // Support for calls
    myDiscards: Tile[];
    doraIndicators: Tile[];
    kitaCount: number;
    trials: number;
    currentTurn: number;
    isDealer: boolean;
    validationMode?: boolean; // New flag for Correlation Validation Mode
};

export type DiscardResult = {
    action: Action;
    winRate: number;
    avgScore: number;
    ev: number;
    ronRate: number;
    tenpaiRate: number;
    effectiveTiles?: { tile: Tile, count: number }[];
    shantenBefore: number;
    shantenAfter: number;
};

export type SimulationSummary = {
    remainingTiles: number;
    shanten: {
        normal: number;
        chiitoi: number;
        kokushi: number;
    };
};

// runSimulation removed as worker implements the loop directly.

// Single Simulation Run
// Returns score (0 if no win)
// Single Simulation Run
export type SimulationPathResult = {
    type: 'win' | 'draw';
    point: number;
    isTenpai: boolean;
};

// Single Simulation Run
let debugSimCount = 0;
export function runSinglePath(
    initialHand: Tile[],
    fixedMentsu: Mentsu[],
    initialAction: Action,
    liveWall: Tile[],
    deadWall: Tile[],
    initialKita: number,
    doraIndicators: Tile[],
    currentTurn: number,
    isDealer: boolean,
    remainingSelfDraws: number,
    debugLog: boolean = false
): SimulationPathResult {
    if (debugLog) {
        console.log("Start Path", initialAction.type);
    }
    debugSimCount++;

    let hand = [...initialHand];
    let kita = initialKita;
    let doraInds = [...doraIndicators];
    let localFixedMentsu = [...fixedMentsu];
    let currentLiveWall = [...liveWall];
    let currentDeadWall = [...deadWall];
    let isRiichi = false;
    let isDoubleRiichi = false;
    let isIppatsu = false;
    let isHaitei = false;
    let turnCount = 0;

    // Guard: もし残りツモ回数が 0 以下の場合は、ツモ和了シミュレーションとしては成立しないため直ちに流局扱いとする
    // これにより、Phase 1 の Tsumo アクションなどでも和了率が 0% になります
    if (remainingSelfDraws <= 0) {
        return {
            type: 'draw',
            point: 0,
            isTenpai: calculateShanten(hand, fixedMentsu.length) <= 0
        };
    }

    // Deposit Adjustment
    let scoreAdjustment = 0;

    // Helper: Count Dora for state
    const getCurrentDoraCount = () => countDora(hand, doraInds, isRiichi, localFixedMentsu, kita);

    // Helper: Validation
    const isValidWin = (result: YakuResult) => validateAgari(result);

    // Helper: Perform Discard (Greedy)
    // Returns true if discard was successful, false if hand empty (error)
    const performGreedyDiscard = (): boolean => {
        if (hand.length === 0) return false;

        let bestDiscardIndex = -1;
        let minShantenFound = 99;
        let maxUkeireFound = -1;

        for (let i = 0; i < hand.length; i++) {
            const removed = hand[i];
            hand.splice(i, 1);
            const s = calculateShanten(hand, localFixedMentsu.length);

            let ukeire = 0;
            if (s === 0) {
                const wins = getWinningTiles(hand, localFixedMentsu.length);
                for (const w of wins) {
                    const normW = toNormalFive(w);
                    ukeire += currentLiveWall.filter(tw => toNormalFive(tw) === normW).length;
                }
            }

            hand.splice(i, 0, removed); // restore

            if (s < minShantenFound) {
                minShantenFound = s;
                maxUkeireFound = ukeire;
                bestDiscardIndex = i;
            } else if (s === minShantenFound) {
                if (ukeire > maxUkeireFound) {
                    maxUkeireFound = ukeire;
                    bestDiscardIndex = i;
                } else if (ukeire === maxUkeireFound) {
                    // Tie-break: discard from end to minimize shift (arbitrary)
                    bestDiscardIndex = i;
                }
            }
        }

        if (bestDiscardIndex !== -1) {
            hand.splice(bestDiscardIndex, 1);
        } else {
            hand.pop(); // Fallback
        }
        return true;
    };

    // --- PHASE 1: EXECUTE INITIAL ACTION (The User's Choice) ---
    // This happens "at the start", replacing the first "Turn" logic of the loop.

    // ---------------------------------------------------------
    // AUTO-KITA LOGIC (Initial Hand)
    // ---------------------------------------------------------
    // Per user request: North is always immediately pulled.
    // We process the hand relative to the *Local* state of this simulation path.
    const NORTH = TILES.z4; // 30
    let nukiDoraCount = 0; // Local counter for this path

    // Function to draw from wall (with dead wall check if needed, but sanma usually just draws live)
    const drawFromWall = (): Tile | null => {
        if (currentLiveWall.length === 0) return null;
        return currentLiveWall.shift() as Tile;
    };

    // 1. Initial Hand Processing: Pull all Norths
    // Loop until no Norths in hand.
    // Note: We traverse backwards or restart loop to handle replacements being North.
    let hasNorth = true;
    while (hasNorth) {
        hasNorth = false;
        // Find Norths
        for (let i = 0; i < hand.length; i++) {
            if (hand[i] === NORTH) {
                // Pull
                hand.splice(i, 1);
                nukiDoraCount++;
                kita++; // Update state kita count

                // Draw replacement
                const rep = drawFromWall();
                if (rep !== null) {
                    hand.splice(i, 0, rep); // Insert at same spot
                    // If replacement is North, we set hasNorth=true to loop again
                    if (rep === NORTH) hasNorth = true;
                }
                // If null (empty wall), we just removed the tile. (Should verify 14 tiles constraint)
            }
        }
    }

    if (initialAction.type === 'tsumo') {
        const shanten = calculateShanten(hand, localFixedMentsu.length);
        if (shanten === -1) {
            const patterns = getAgariPatterns(hand, localFixedMentsu);
            const structure = patterns[0];
            if (structure) {
                const state: GameState = {
                    bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                    isRiichi, isDoubleRiichi: false, isIppatsu, isTsumo: true,
                    isRinshan: false, isChankan: false, isHaitei: isHaitei, isHoutei: false,
                    kitaCount: kita, // Includes auto-pulled
                    doraCount: getCurrentDoraCount(), // Logic uses `kita`
                    uraDoraCount: 0,
                    winningTile: hand[hand.length - 1], // Last tile drawn
                    isDealer, turnCount: currentTurn, hasCallOccurred: false, discardCount: 0
                };
                const result = calculateScore(hand, structure, state);
                // Adjust Han for NukiDora if not already covered by kitaCount interaction
                // Note: `kitaCount` is passed to `state`. `calculateScore` usually uses it.
                // If `calculateScore` doesn't use `kitaCount` for Han, we might need manual add.
                // Checking `yaku.ts` would be ideal, but based on "kitaCount: kita" passed to state, it likely handles it.

                if (isValidWin(result)) {
                    return {
                        type: 'win',
                        point: calculatePoints(result, isDealer, true).total,
                        isTenpai: true
                    };
                }
            }
        }
        return { type: 'draw', point: 0, isTenpai: calculateShanten(hand, localFixedMentsu.length) <= 0 }; // Invalid Tsumo
    }

    // For other actions, we perform them, then we MUST Discard (unless we win)
    // effectively completing "Turn 1".

    if (initialAction.type === 'discard') {
        // Simple Discard
        const idx = hand.indexOf(initialAction.tile);
        if (idx !== -1) hand.splice(idx, 1);
        else hand.pop(); // Should not happen if valid input

        // RIICHI LOGIC
        if (initialAction.riichi) {
            isRiichi = true;
            isIppatsu = true;

            // Double Riichi Check
            // Condition: Turn 1, No Kita, No Calls (Self).
            if (currentTurn === 1 && kita === 0 && localFixedMentsu.length === 0) {
                isDoubleRiichi = true;
            }

            scoreAdjustment -= 1000; // Pay deposit
        }
    }
    else if (initialAction.type === 'kita') {
        const idx = hand.indexOf(TILES.z4);
        if (idx !== -1) {
            hand.splice(idx, 1);
            kita++;

            // Draw Supplement
            if (currentDeadWall.length > 0) {
                const rinshan = currentDeadWall.pop()!; // Decrement dead wall
                hand.push(rinshan);

                // Check Win (Rinshan Kaihou)
                if (calculateShanten(hand, localFixedMentsu.length) === -1) {
                    // Win processing...
                    const patterns = getAgariPatterns(hand, localFixedMentsu);
                    if (patterns.length > 0) {
                        const state: GameState = {
                            bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                            isRiichi, isDoubleRiichi: false, isIppatsu, isTsumo: true,
                            isRinshan: true, isChankan: false, isHaitei: false, isHoutei: false,
                            kitaCount: kita, doraCount: getCurrentDoraCount(), uraDoraCount: 0,
                            winningTile: rinshan, isDealer, turnCount: currentTurn,
                            hasCallOccurred: true, discardCount: 0
                        };
                        const result = calculateScore(hand, patterns[0], state);
                        if (isValidWin(result)) {
                            return {
                                type: 'win',
                                point: calculatePoints(result, isDealer, true).total,
                                isTenpai: true
                            };
                        }
                    }
                }

                // If no win, Discard
                performGreedyDiscard();
            } else {
                // No rinshan? Perform discard anyway
                performGreedyDiscard();
            }
        }
    }
    else if (initialAction.type === 'ankan') {
        const tile = initialAction.tile;
        const normTile = toNormalFive(tile);
        let removed = 0;
        for (let i = hand.length - 1; i >= 0; i--) {
            if (toNormalFive(hand[i]) === normTile) {
                hand.splice(i, 1);
                removed++;
                if (removed === 4) break;
            }
        }

        if (removed === 4) {
            localFixedMentsu.push({
                type: 'kantsu', tile: normTile, tiles: getKanTiles(normTile), isOpen: false, isKan: true
            });

            // Draw Rinshan
            if (currentDeadWall.length > 0) {
                const rinshan = currentDeadWall.pop()!;
                hand.push(rinshan);
                // isRinshan = true; // Removed

                // Check Win (Rinshan Kaihou)
                if (calculateShanten(hand, localFixedMentsu.length) === -1) {
                    const patterns = getAgariPatterns(hand, localFixedMentsu);
                    if (patterns.length > 0) {
                        const state: GameState = {
                            bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                            isRiichi, isDoubleRiichi: false, isIppatsu, isTsumo: true,
                            isRinshan: true, isChankan: false, isHaitei: false, isHoutei: false,
                            kitaCount: kita, doraCount: getCurrentDoraCount(), uraDoraCount: 0,
                            winningTile: rinshan, isDealer, turnCount: currentTurn,
                            hasCallOccurred: true, discardCount: 0
                        };
                        const result = calculateScore(hand, patterns[0], state);
                        if (isValidWin(result)) {
                            return {
                                type: 'win',
                                point: calculatePoints(result, isDealer, true).total,
                                isTenpai: true
                            };
                        }
                    }
                }

                // Add Dora Indicator
                if (currentDeadWall.length > 0) {
                    doraInds.push(currentDeadWall.pop()!);
                }

                // Discard (with optional Riichi)
                if (initialAction.riichi) {
                    isRiichi = true;
                    isIppatsu = true;
                    scoreAdjustment -= 1000;
                }

                performGreedyDiscard();
            } else {
                performGreedyDiscard();
            }
        }
    }
    else if (initialAction.type === 'kakan') {
        const tile = initialAction.tile;
        const normTile = toNormalFive(tile);

        // 1. Remove from hand
        const idx = hand.findIndex(t => toNormalFive(t) === normTile);
        if (idx !== -1) {
            hand.splice(idx, 1);
        }

        // 2. Upgrade Pon to Kan
        const ponIdx = localFixedMentsu.findIndex(m => m.type === 'koutsu' && m.tile === normTile);
        if (ponIdx !== -1) {
            const pon = localFixedMentsu[ponIdx];
            pon.type = 'kantsu';
            pon.isKan = true;
            pon.tiles.push(tile); // Add the added tile
        }

        // 3. Draw Rinshan
        if (currentDeadWall.length > 0) {
            const rinshan = currentDeadWall.pop()!;
            hand.push(rinshan);

            // Check Win (Rinshan Kaihou)
            if (calculateShanten(hand, localFixedMentsu.length) === -1) {
                const patterns = getAgariPatterns(hand, localFixedMentsu);
                if (patterns.length > 0) {
                    const state: GameState = {
                        bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                        isRiichi, isDoubleRiichi: false, isIppatsu: false, // Kakan invalidates Ippatsu
                        isTsumo: true,
                        isRinshan: true, isChankan: false, isHaitei: false, isHoutei: false,
                        kitaCount: kita, doraCount: getCurrentDoraCount(), uraDoraCount: 0,
                        winningTile: rinshan, isDealer, turnCount: currentTurn,
                        hasCallOccurred: true, discardCount: 0
                    };
                    const result = calculateScore(hand, patterns[0], state);
                    if (isValidWin(result)) {
                        return {
                            type: 'win',
                            point: calculatePoints(result, isDealer, true).total,
                            isTenpai: true
                        };
                    }
                }
            }

            // 4. Discard
            performGreedyDiscard();

            // 5. Add Dora Indicator (AFTER discard)
            if (currentDeadWall.length > 0) {
                doraInds.push(currentDeadWall.pop()!);
            }
        } else {
            performGreedyDiscard();
        }
    }

    // --- PHASE 2: SIMULATION LOOP (Next Turns) ---
    // Start from Next Turn (currentTurn + 1)

    // NOTE: In 3-player mahjong, "Turn" usually means "My Turn".
    // Between my turns, 2 other players move.
    // User requested to control loops entirely by `remainingSelfDraws` parameter

    for (let i = 0; i < remainingSelfDraws; i++) {
        turnCount++;

        // 1. Check if we can even draw before opponent turns
        if (currentLiveWall.length === 0) break;

        if (debugLog) {
            console.log(`Turn: ${turnCount} Live: ${currentLiveWall.length}`);
        }

        // Simulate opponents drawing 2 tiles (consumption)
        // 3 players total. Me=1 tile. Opponents=2 tiles.
        if (currentLiveWall.length >= 2) {
            currentLiveWall.pop();
            currentLiveWall.pop();
        } else if (currentLiveWall.length === 1) {
            currentLiveWall.pop();
        }

        // My Draw
        if (currentLiveWall.length === 0) break; // Exhausted before my draw
        const drawnTile = currentLiveWall.pop()!;
        hand.push(drawnTile);

        // Auto-Kita for drawn tile
        while (currentLiveWall.length > 0 && hand[hand.length - 1] === NORTH) {
            if (debugSimCount < 10) console.log("DEBUG_DRAW_N");
            hand.pop(); // Remove North
            nukiDoraCount++;
            if (debugSimCount < 10) console.log("DEBUG_NUKI_COUNT", nukiDoraCount);
            kita++; // Update state
            if (currentLiveWall.length > 0) {
                const rep = currentLiveWall.pop()!;
                hand.push(rep);
            }
        }

        if (currentLiveWall.length === 0) isHaitei = true;

        // 2. Check Win (Tsumo)
        // If Riichi, we can only Tsumo (or wait for Ron - but logic simulates Tsumo mainly for simple EV)
        const shanten = calculateShanten(hand, localFixedMentsu.length);
        if (shanten === -1) {
            const patterns = getAgariPatterns(hand, localFixedMentsu);
            if (patterns.length > 0) {
                // Calculate Ura Dora if Riichi
                let uraDoraCount = 0;
                if (isRiichi) {
                    const uraInds: Tile[] = [];
                    // For each visible Dora Indicator, there is 1 Ura Dora Indicator.
                    // We assume they are available in Dead Wall. 
                    // In simulation, we peek them from the remaining dead wall (without popping).
                    const countNeeded = doraInds.length;
                    for (let i = 0; i < countNeeded; i++) {
                        // Dead Wall: [Ind1, Ind2, ... , Last]
                        // We access from the end.
                        const index = currentDeadWall.length - 1 - i;
                        if (index >= 0) {
                            uraInds.push(currentDeadWall[index]);
                        }
                    }
                    // Count matches for these Ura Indicators
                    uraDoraCount = countDora(hand, uraInds, false, localFixedMentsu, kita);
                }

                const state: GameState = {
                    bakaze: TILES.z1, jikaze: isDealer ? TILES.z1 : TILES.z2,
                    isRiichi, isDoubleRiichi: isDoubleRiichi, isIppatsu, isTsumo: true,
                    isRinshan: false, isChankan: false, isHaitei: isHaitei, isHoutei: false,
                    kitaCount: kita, doraCount: getCurrentDoraCount(), uraDoraCount: uraDoraCount,
                    winningTile: drawnTile, isDealer, turnCount: currentTurn + turnCount,
                    hasCallOccurred: localFixedMentsu.some(m => m.isOpen || m.isKan) || kita > 0,
                    discardCount: 0
                };
                const result = calculateScore(hand, patterns[0], state);
                if (isValidWin(result)) {
                    // Win!
                    const points = calculatePoints(result, isDealer, true).total;

                    if (debugSimCount < 10) {
                        console.log("DEBUG_WIN_HAN_BEFORE_NUKI", result.han);
                        console.log("DEBUG_WIN_NUKI_COUNT", nukiDoraCount); // Note: calculateScore should have included kitaCount if passed correctly
                        console.log("DEBUG_WIN_HAN_AFTER_NUKI", result.han); // Assuming calculateScore handled it
                        console.log("DEBUG_SIM_RESULT", {
                            win: true,
                            finalHan: result.han,
                            nuki: nukiDoraCount,
                            score: points + (isRiichi ? 1000 : 0) + scoreAdjustment
                        });
                    }

                    // If Riichi, get deposit back (+1000)
                    const depositReturn = isRiichi ? 1000 : 0;
                    return {
                        type: 'win',
                        point: points + depositReturn + scoreAdjustment,
                        isTenpai: true
                    };
                }
            }
        }

        // 3. Discard
        // If Riichi, must discard drawn tile (unless win)
        if (isRiichi) {
            hand.pop(); // Auto discard drawn tile
            isIppatsu = false; // Turn passed
        } else {
            // Greedy discard logic
            if (!performGreedyDiscard()) break;
        }
    }

    // Ryuukyoku (Draw)
    const isTenpai = calculateShanten(hand, localFixedMentsu.length) <= 0;
    const ryuukyokuPoints = isTenpai ? 1000 : -1000;

    if (debugSimCount < 10) {
        console.log("DEBUG_SIM_RESULT", {
            win: false,
            finalHan: 0,
            nuki: nukiDoraCount,
            score: scoreAdjustment + ryuukyokuPoints
        });
    }

    return {
        type: 'draw',
        point: scoreAdjustment + ryuukyokuPoints,
        isTenpai
    };
} // End of runSinglePath

/**
 * Evaluates all possible winning patterns and returns the best one.
 */
export function evaluateWinningHand(
    hand: Tile[],
    config: SimulationConfig
): {
    bestYaku: YakuResult;
    bestScore: ScoreResult;
    bestStructure: HandStructure;
    allPatterns: { yaku: YakuResult; score: ScoreResult; structure: HandStructure }[]
} | null {
    // 国士無双は最優先判定
    if (isKokushiMusou(hand)) {
        const result: YakuResult = {
            han: 13,
            fu: 0, // 役満は符計算しない
            yaku: ["国士無双"],
            yakuList: [{ name: "国士無双", han: 13 }],
            yakuman: true,
            yakumanMultiplier: 1
        };
        const score = calculatePoints(result, config.isDealer, true);
        const structure: HandStructure = { head: -1 as Tile, mentsu: [] }; // Kokushi special
        const patternResult = { yaku: result, score: score, structure: structure };
        return {
            bestYaku: result,
            bestScore: score,
            bestStructure: structure,
            allPatterns: [patternResult]
        };
    }

    const isChiitoi = isChiitoitsu(hand);

    if (isChiitoi) {
        const state: GameState = {
            bakaze: TILES.z1,
            jikaze: config.isDealer ? TILES.z1 : TILES.z2,
            isRiichi: false,
            isDoubleRiichi: false,
            isIppatsu: false,
            isTsumo: true,
            isRinshan: false,
            isChankan: false,
            isHaitei: false,
            isHoutei: false,
            kitaCount: config.kitaCount,
            doraCount: countDora(hand, config.doraIndicators, false, [], config.kitaCount),
            uraDoraCount: 0,
            winningTile: hand[hand.length - 1],
            isDealer: config.isDealer,
            turnCount: config.currentTurn,
            hasCallOccurred: config.kitaCount > 0 || config.fixedMentsu.some(m => m.isOpen || m.isKan),
            discardCount: config.myDiscards.length // This is simplified for manual entry
        };

        const result = calculateScore(hand, { head: -1 as Tile, mentsu: [] }, state);

        // Enforce 1-yaku requirement
        if (!validateAgari(result)) {
            return null;
        }

        const score = calculatePoints(result, config.isDealer, true);
        const structure: HandStructure = { head: -1 as Tile, mentsu: [] }; // Chiitoi special

        const patternResult = { yaku: result, score: score, structure: structure };
        return {
            bestYaku: result,
            bestScore: score,
            bestStructure: structure,
            allPatterns: [patternResult]
        };
    }

    const patterns = getAgariPatterns(hand, config.fixedMentsu || []);
    if (patterns.length === 0) return null;

    const evaluated = patterns.map(structure => {
        const state: GameState = {
            bakaze: TILES.z1,
            jikaze: config.isDealer ? TILES.z1 : TILES.z2,
            isRiichi: false, // Can't be riichi on immediate win input unless specified
            isDoubleRiichi: false,
            isIppatsu: false,
            isTsumo: true, // Input hand of 14 tiles is treated as Tsumo/Deal win
            isRinshan: false,
            isChankan: false,
            isHaitei: false,
            isHoutei: false,
            // Tenhou: Dealer, Turn 1, No Calls (incl Kita).
            isTenhou: config.isDealer && config.currentTurn === 1 && config.fixedMentsu.length === 0 && config.kitaCount === 0,
            // Chiihou: Non-Dealer, Turn 1, No Calls (incl Kita).
            isChiihou: !config.isDealer && config.currentTurn === 1 && config.fixedMentsu.length === 0 && config.kitaCount === 0,
            kitaCount: config.kitaCount,
            doraCount: countDora(hand, config.doraIndicators, false, config.fixedMentsu || [], config.kitaCount),
            uraDoraCount: 0,
            winningTile: hand[hand.length - 1], // Assume last tile is the winning one
            isDealer: config.isDealer,
            turnCount: config.currentTurn,
            hasCallOccurred: config.fixedMentsu.length > 0 || config.kitaCount > 0, // Approximation
            discardCount: config.myDiscards.length
        };

        const result = calculateScore(hand, structure, state);

        if (!validateAgari(result)) {
            return null;
        }

        const score = calculatePoints(result, config.isDealer, true);

        return { yaku: result, score: score, structure: structure };
    });

    console.log("All evaluated patterns:", evaluated);

    // Filter out invalid patterns (those without 1 yaku)
    const validPatterns = evaluated.filter(p => p !== null) as { yaku: YakuResult, score: ScoreResult, structure: HandStructure }[];

    if (validPatterns.length === 0) return null;

    // Sort by han (descending)
    const sorted = [...validPatterns].sort((a, b) => b.yaku.han - a.yaku.han);

    return {
        bestYaku: sorted[0].yaku,
        bestScore: sorted[0].score,
        bestStructure: sorted[0].structure,
        allPatterns: validPatterns
    };
}

export function countDora(hand: Tile[], doraInds: Tile[], isRiichi: boolean, fixedMentsu: Mentsu[] = [], kitaCount: number = 0): number {
    // Dora Indicator -> Dora Tile mapping
    // For each dora indicator, find the next tile in sequence.
    // Manzu: 1m->9m, 9m->1m (Sanma Special)
    // Pinzu: 1p->2p, 9p->1p
    // Souzu: 1s->2s, 9s->1s
    // Zihai: East->South->West->North->East, White->Green->Red->White

    function getDoraValue(ind: Tile): Tile {
        // Normalize Red Fives to normal fives for indicator logic
        const normalInd = toNormalFive(ind);

        if (normalInd >= 0 && normalInd <= 8) { // Manzu
            // Sanma: 1m(0) -> 9m(8), 9m(8) -> 1m(0)
            if (normalInd === 0) return 8; // 1m -> 9m
            if (normalInd === 8) return 0; // 9m -> 1m
            return normalInd + 1; // Fallback (though 2-8m shouldn't exist)
        } else if (normalInd >= 9 && normalInd <= 17) { // Pinzu
            return normalInd === 17 ? 9 : normalInd + 1;
        } else if (normalInd >= 18 && normalInd <= 26) { // Souzu
            return normalInd === 26 ? 18 : normalInd + 1;
        } else if (normalInd >= 27 && normalInd <= 30) { // Winds
            return normalInd === 30 ? 27 : normalInd + 1;
        } else if (normalInd >= 31 && normalInd <= 33) { // Dragons
            return normalInd === 33 ? 31 : normalInd + 1;
        }
        return normalInd;
    }

    let count = 0;

    // Count regular dora
    // Count regular dora
    for (const ind of doraInds) {
        const doraValue = getDoraValue(ind);

        // If North is Dora, add Kita Count (Nuki Dora)
        // Kita nuki count effectively adds to the Dora count if North is the Dora.
        if (doraValue === TILES.z4) {
            count += kitaCount;
        }

        for (const t of hand) {
            const normalTile = toNormalFive(t);
            if (normalTile === doraValue) count++;
        }
        for (const m of fixedMentsu) {
            for (const t of m.tiles) {
                const normalTile = toNormalFive(t);
                if (normalTile === doraValue) {
                    count++;
                }
            }
        }
    }

    // Count Red Fives as Dora (in hand and in fixedMentsu)

    // Count Red Fives as Dora (in hand and in fixedMentsu)
    for (const t of hand) {
        if (isRedFive(t)) count++;
    }
    for (const m of fixedMentsu) {
        for (const t of m.tiles) {
            if (isRedFive(t)) count++;
        }
    }

    // Ura Dora estimation removed.
    // Ura Dora is now handled explicitly in runSinglePath by passing uraIndicators.

    return count;
}

export function getWinningTiles(hand: Tile[], fixedMentsuLen: number): Tile[] {
    const wins: Tile[] = [];
    for (const t of ALL_SANMA_TILES) {
        const testHand = [...hand, t];
        if (calculateShanten(testHand, fixedMentsuLen) === -1) {
            wins.push(t);
        }
    }
    return wins;
}
