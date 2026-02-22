import { generateWall, removeTilesFromWall } from './wall';
import { tileToString, toNormalFive } from '../core/tile';
import type { Tile } from '../core/tile';
import type { SimulationConfig, DiscardResult, Action } from './engine';
import { runSinglePath, evaluateWinningHand } from './engine';
import { calculateShanten, getShantenBreakdown, clearShantenCache } from '../core/shanten';
import { SANMA_TILE_COUNT, toStandardTile } from '../core/sanmaTiles';
import type { YakuResult } from '../core/yaku';
import type { ScoreResult } from '../core/score';
import type { SimulationSummary } from './engine';

// Worker Message Types
type WorkerMessage = {
    type: 'START_SIMULATION';
    config: SimulationConfig;
};

type WorkerResponse = {
    type: 'RESULT' | 'PROGRESS' | 'WIN';
    results?: DiscardResult[];
    winResult?: {
        bestYaku: YakuResult;
        bestScore: ScoreResult;
        allPatterns: { yaku: YakuResult; score: ScoreResult }[];
    };
    progress?: number;
    summary?: SimulationSummary;
    csvReport?: string; // New CSV Report
};

if (typeof self !== 'undefined') {
    self.onmessage = (e: MessageEvent<WorkerMessage>) => {
        if (e.data.type === 'START_SIMULATION') {
            const config = e.data.config;
            const shantenBreakdown = getShantenBreakdown(config.myHand, config.fixedMentsu.length);
            // Wall formula: 108 - 14(dead) - 40(hands) - (turn-1)*3 - kits - kans
            // Note: 40 = 14 (Dealer) + 13 (Child) + 13 (Child)
            const myKans = config.fixedMentsu.filter(m => m.isKan).length;

            const remainingTiles = Math.max(0, 108 - 14 - 40 - (config.currentTurn - 1) * 3 - config.kitaCount - myKans);

            const summary: SimulationSummary = {
                remainingTiles,
                shanten: shantenBreakdown
            };

            // Step 4: Check for immediate win (14 tiles)
            if (config.myHand.length === (14 - config.fixedMentsu.length * 3)) {
                const shanten = calculateShanten(config.myHand, config.fixedMentsu.length);
                if (shanten === -1) {
                    let winResult = evaluateWinningHand(config.myHand, config);

                    if (!winResult) {
                        // Formally complete (shanten -1) but No Yaku (or other constraint failure)
                        // Per user request: DO NOT Enter Monte Carlo. Return "No Yaku" result immediately.
                        winResult = {
                            bestYaku: {
                                han: 0,
                                fu: 0,
                                yaku: ["役なし (No Yaku)"],
                                yakuList: [],
                                yakuman: false
                            },
                            bestScore: {
                                total: 0,
                                details: "役なし 0点",
                                payments: [0]
                            },
                            bestStructure: { head: -1 as Tile, mentsu: [] }, // Dummy
                            allPatterns: []
                        };
                    }

                    if (winResult) {
                        if (typeof self !== 'undefined') {
                            self.postMessage({ type: 'WIN', winResult, summary } as WorkerResponse);
                        }
                        return;
                    }
                }
            }

            const { results, csvReport } = simulateAllDiscards(config);
            self.postMessage({ type: 'RESULT', results, summary, csvReport } as WorkerResponse);
        }
    };
}

function getVisibleTiles(config: SimulationConfig, action: Action): number[] {
    const hand = [...config.myHand];

    // For discard/kita/ankan, we remove from hand to simulate "future state" for hand, 
    // but the tile itself is still "visible/known".
    const actionTiles: number[] = [];

    if (action.type === 'discard') {
        const dIdx = hand.indexOf(action.tile);
        if (dIdx > -1) {
            hand.splice(dIdx, 1);
            actionTiles.push(action.tile as number);
        }
    } else if (action.type === 'kita') {
        const dIdx = hand.indexOf(30 as any); // TILES.z4
        if (dIdx > -1) {
            hand.splice(dIdx, 1);
            actionTiles.push(30);
        }
    } else if (action.type === 'ankan') {
        const norm = toNormalFive(action.tile as Tile);
        let removed = 0;
        for (let i = hand.length - 1; i >= 0; i--) {
            if (toNormalFive(hand[i]) === norm) {
                actionTiles.push(hand[i] as number);
                hand.splice(i, 1);
                removed++;
                if (removed === 4) break;
            }
        }
    }

    // Hand after discard + Dora + Discards + ActionTiles
    // Called melds are handled below
    const visible: number[] = [...hand, ...config.doraIndicators, ...(config.myDiscards || []), ...actionTiles];

    // Called melds
    for (const m of config.fixedMentsu) {
        for (const t of m.tiles) {
            if (typeof t === 'number') visible.push(t);
        }
    }

    // North tiles (Kita)
    for (let i = 0; i < config.kitaCount; i++) {
        visible.push(30); // TILES.z4
    }

    return visible;
}

function calculateEffectiveTiles(hand: Tile[], fixedMentsuCount: number, visibleTiles: number[]): { tile: Tile, count: number }[] {
    const currentShanten = calculateShanten(hand, fixedMentsuCount);
    const effective: { tile: Tile, count: number }[] = [];

    // Check all Sanma tiles (0-26 in 27-ID) -> Convert to 34-ID
    for (let i = 0; i < SANMA_TILE_COUNT; i++) {
        const t = toStandardTile(i) as Tile;

        const nextHand = [...hand, t];
        if (calculateShanten(nextHand, fixedMentsuCount) < currentShanten) {
            // How many left?
            const inVisible = visibleTiles.filter(v => v === t).length;
            const count = Math.max(0, 4 - inVisible);
            if (count > 0) {
                effective.push({ tile: t, count });
            }
        }
    }

    return effective;
}

interface ActionStats {
    action: Action;
    wins: number;
    draws: number;
    tenpaiCount: number;

    // Point Breakdown
    winPoints: number;
    tenpaiPoints: number;
    notenPoints: number;

    totalScore: number;
    trials: number;
    pruned: boolean;
    effectiveTiles: { tile: Tile, count: number }[];
    sumSquaredScore: number;
    stats2000?: { wins: number, totalScore: number, ev: number };
}

function runBatchSimulations(
    config: SimulationConfig,
    action: Action,
    stats: ActionStats,
    batchSize: number,
    fullWall: number[]
) {
    const { myHand, fixedMentsu, kitaCount, doraIndicators, currentTurn, isDealer } = config;

    for (let i = 0; i < batchSize; i++) {
        let pathWall = [...fullWall];
        // Fisher-Yates shuffle
        for (let j = pathWall.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [pathWall[j], pathWall[k]] = [pathWall[k], pathWall[j]];
        }

        // 14枚を王牌 (末尾から取得)
        const deadWall = pathWall.slice(-14);

        // 残りを基本のライブ山として取得
        let liveWall = pathWall.slice(0, -14);

        // 他家配牌(26枚) + 経過巡目によるこれまでの追加ツモを消費
        const additionalDraws = 3 * (config.currentTurn - 1);
        const tilesToConsume = 26 + additionalDraws;

        // 実際に消費した分をスライス（牌が足りない場合は空配列になる）
        liveWall = liveWall.slice(tilesToConsume);

        if (stats.trials === 0 && action.type === 'discard' && action.tile === config.myHand[0]) {
            console.log("LIVE", liveWall.length);
            console.log("DEAD", deadWall.length);
        }

        // 1巡につき3枚（自分1＋他家2）が消費されるため、liveWallの残り枚数から実ツモ回数を算出
        const remainingSelfDraws = Math.floor(liveWall.length / 3);

        const result = runSinglePath(myHand, fixedMentsu, action, liveWall, deadWall, kitaCount, doraIndicators, currentTurn, isDealer, remainingSelfDraws);

        // Update Stats
        if (result.type === 'win') {
            stats.wins++;
            stats.winPoints += result.point;
        } else if (result.type === 'draw') {
            stats.draws++;
            if (result.isTenpai) {
                stats.tenpaiCount++;
                stats.tenpaiPoints += result.point;
            } else {
                stats.notenPoints += result.point;
            }
        }

        stats.totalScore += result.point;
        stats.sumSquaredScore += result.point * result.point;

        stats.trials++;
    }
}

export function simulateAllDiscards(config: SimulationConfig): { results: DiscardResult[], csvReport?: string } {
    // Clear cache at start of new simulation batch
    clearShantenCache();

    const { myHand, fixedMentsu, validationMode } = config;

    // Constants
    const INITIAL_TRIALS = 2000;
    const ADDITIONAL_TRIALS = 3000;

    // Identify valid actions
    const actions: Action[] = [];

    // Discards: Check for Tenpai to branch Riichi/Dama
    const distinctTiles = Array.from(new Set(myHand));
    const isMenzen = fixedMentsu.length === 0;

    for (const t of distinctTiles) {
        // Create a temporary hand to check Shanten AFTER discard
        const tempHand = [...myHand];
        const idx = tempHand.indexOf(t);
        if (idx > -1) tempHand.splice(idx, 1);

        const shantenAfter = calculateShanten(tempHand, fixedMentsu.length);

        // Branching: Tenpai (0 shanten) + Menzen => Riichi option + Dama option
        if (shantenAfter === 0 && isMenzen) {
            // Option A: Riichi
            actions.push({ type: 'discard', tile: t, riichi: true });
            // Option B: Dama
            actions.push({ type: 'discard', tile: t, riichi: false });
        } else {
            // Normal Discard
            actions.push({ type: 'discard', tile: t });
        }
    }

    // Kita
    if (myHand.includes(30 as any)) { // North (TILES.z4)
        actions.push({ type: 'kita' });
    }

    // Check Immediate Win (Tenhou / Chiihou / Tsumo)
    const initialInfo = calculateShanten(myHand, config.fixedMentsu.length);
    if (initialInfo === -1) {
        actions.push({ type: 'tsumo' });
    }

    // Ankan Detection
    const counts = new Map<number, number>();
    for (const t of myHand) {
        const norm = toNormalFive(t);
        counts.set(norm, (counts.get(norm) || 0) + 1);
    }
    for (const [tile, count] of counts.entries()) {
        if (count === 4) {
            if (tile === 30) continue; // Skip North Ankan

            // Check Shanten after Ankan (remove 4 tiles, assume standard structure)
            // Hand length will be N-4. We need to check if N-4 tiles + 1 Fixed Kan is Tenpai.
            // Fixed Kan counts as Mentsu.
            // We can treat it as: Remove 4 tiles from hand, increment fixedMentsu count.
            // (Strictly we rely on Rinshan tile to complete hand for 14 tiles, 
            // but checking Shanten of remaining 10 tiles + 1 set vs 13 tiles + 1 set is similar).

            const tempHand = myHand.filter(h => toNormalFive(h) !== tile);
            // After Ankan, we have 4 less tiles in hand, but 1 more fixed mentsu.
            // Normal Shanten: Hand + Fixed = 4 sets + 1 pair.

            const shantenAfterKan = calculateShanten(tempHand, config.fixedMentsu.length + 1);

            if (shantenAfterKan === 0 && isMenzen) {
                // Option A: Ankan then Riichi
                actions.push({ type: 'ankan', tile: tile as Tile, riichi: true });
                // Option B: Ankan then Dama
                actions.push({ type: 'ankan', tile: tile as Tile, riichi: false });
                actions.push({ type: 'ankan', tile: tile as Tile, riichi: false });
            } else {
                actions.push({ type: 'ankan', tile: tile as Tile });
            }
        }
    }

    // Kakan Detection
    // Check if we have an open Pon and the 4th tile in hand
    for (const m of fixedMentsu) {
        if (m.type === 'koutsu' && m.isOpen) {
            // Check if we have the same tile
            const tile = m.tile;
            // Scan hand
            for (const t of myHand) {
                if (toNormalFive(t) === tile) {
                    actions.push({ type: 'kakan', tile: t });
                    break;
                }
            }
        }
    }

    const statsList: ActionStats[] = [];
    const visibleTilesMap = new Map<string, number[]>();
    const fullWallMap = new Map<string, number[]>();

    // Phase 1: Screening (2000 trials)
    console.log(`\n=== Phase 1: Screening (${INITIAL_TRIALS} trials) ${validationMode ? '[VALIDATION MODE]' : ''} ===`);
    let debugPhase1Counter = 0;

    for (const action of actions) {
        let actionKey = "";
        if (action.type === 'kita') actionKey = 'kita';
        else if (action.type === 'ankan') {
            const rLabel = action.riichi ? '[Riichi]' : '';
            actionKey = `ankan-${toNormalFive(action.tile)}${rLabel}`;
        }
        else if (action.type === 'kakan') {
            actionKey = `kakan-${toNormalFive(action.tile)}`;
        }
        else if (action.type === 'tsumo') actionKey = 'tsumo';
        else {
            // Discard
            const rLabel = action.riichi ? '[Riichi]' : '';
            actionKey = `discard-${action.tile}${rLabel}`;
        }

        const visibleTiles = getVisibleTiles(config, action);
        console.log("DEBUG_VISIBLE_TILES_LENGTH", visibleTiles.length);
        visibleTilesMap.set(actionKey, visibleTiles);

        let fullWall = generateWall();
        console.log("DEBUG_GENERATE_WALL_LENGTH", fullWall.length);
        fullWall = removeTilesFromWall(fullWall, visibleTiles);

        debugPhase1Counter++;
        console.log("DEBUG_PHASE1_REBUILD_COUNT", debugPhase1Counter);

        // DEBUG LOG
        const nCheck = fullWall.filter(t => t === 30).length;
        // Limit log? We don't have global counter easily here across workers/calls but 
        // we can just log it since it happens per action (few times).
        // Or check loop index?
        // Using console.log freely as requested for "Phase 1" mainly.
        // User asked "10 simulations". This is outer loop (actions).
        // Let's just log it.
        if (config.currentTurn === 1) { // Reduce noise
            console.log("DEBUG_WALL_N_COUNT", nCheck);
        }

        fullWallMap.set(actionKey, fullWall);

        // Effective tiles
        const handAfterAction = [...myHand];
        if (action.type === 'discard') {
            const idx = handAfterAction.indexOf(action.tile);
            if (idx > -1) handAfterAction.splice(idx, 1);
        } else if (action.type === 'kita') {
            const idx = handAfterAction.indexOf(30 as any);
            if (idx > -1) handAfterAction.splice(idx, 1);
        } else if (action.type === 'ankan') {
            const norm = toNormalFive(action.tile);
            let removed = 0;
            for (let i = handAfterAction.length - 1; i >= 0; i--) {
                if (toNormalFive(handAfterAction[i]) === norm) {
                    handAfterAction.splice(i, 1);
                    removed++;
                    if (removed === 4) break;
                }
            }
        } else if (action.type === 'kakan') {
            const idx = handAfterAction.indexOf(action.tile);
            if (idx > -1) handAfterAction.splice(idx, 1);
        }

        const fixedCountForShanten = action.type === 'ankan' ? fixedMentsu.length + 1 : fixedMentsu.length;

        let effectiveTiles: { tile: Tile, count: number }[] = [];

        if (action.type === 'ankan' || action.type === 'kakan') {
            const baselineShanten = calculateShanten(handAfterAction, fixedCountForShanten);
            effectiveTiles = [];
            for (let i = 0; i < SANMA_TILE_COUNT; i++) {
                const t = toStandardTile(i) as Tile;
                const nextHand = [...handAfterAction, t];
                const newShanten = calculateShanten(nextHand, fixedCountForShanten);
                if (newShanten < baselineShanten) {
                    const inVisible = visibleTiles.filter(v => v === t).length;
                    const count = Math.max(0, 4 - inVisible);
                    if (count > 0) effectiveTiles.push({ tile: t, count });
                }
            }
        } else {
            effectiveTiles = calculateEffectiveTiles(handAfterAction, fixedCountForShanten, visibleTiles);
        }

        const stats: ActionStats = {
            action,
            wins: 0,
            draws: 0,
            tenpaiCount: 0,

            winPoints: 0,
            tenpaiPoints: 0,
            notenPoints: 0,

            totalScore: 0,
            trials: 0,
            pruned: false,
            effectiveTiles,
            sumSquaredScore: 0
        };

        runBatchSimulations(config, action, stats, INITIAL_TRIALS, fullWall);

        // Always save 2000 trial stats for comparison / CSV reporting
        stats.stats2000 = {
            wins: stats.wins,
            totalScore: stats.totalScore,
            ev: stats.totalScore / stats.trials
        };

        statsList.push(stats);

        // Report Progress
        if (typeof self !== 'undefined') {
            self.postMessage({
                type: 'PROGRESS',
                progress: (statsList.length / actions.length) * (validationMode ? 0.4 : 0.5)
            } as WorkerResponse);
        }
    }

    // Phase 2: Pruning
    let candidatesToRun = statsList;
    const sorted = [...statsList].sort((a, b) => (b.totalScore / b.trials) - (a.totalScore / a.trials));
    const bestEV = sorted[0].totalScore / sorted[0].trials;

    // Prune logic
    candidatesToRun = sorted.filter(s => {
        const ev = s.totalScore / s.trials;
        const keep = ev >= bestEV * 0.9 || (bestEV < 0 && ev >= bestEV * 1.1); // Keep if close
        s.pruned = !keep;
        return keep;
    });

    // Always keep Kita/Ankan/Kakan/Tsumo for variety if they have reasonable EV
    for (const s of statsList) {
        if (s.pruned && (s.action.type === 'kita' || s.action.type === 'ankan' || s.action.type === 'kakan' || s.action.type === 'tsumo')) {
            if (s.trials > 0 && (s.totalScore / s.trials) > bestEV * 0.5) { // Relaxed pruning
                s.pruned = false;
                if (!candidatesToRun.includes(s)) candidatesToRun.push(s);
            }
        }
    }

    // Phase 3: Detailed Simulation (3000 more)
    console.log(`\n=== Phase 3: Detailed Simulation (${ADDITIONAL_TRIALS} trials) ===`);
    candidatesToRun.sort((a, b) => (b.totalScore / b.trials) - (a.totalScore / a.trials));

    for (const s of candidatesToRun) {
        let actionKey = "";
        if (s.action.type === 'kita') actionKey = 'kita';
        else if (s.action.type === 'ankan') {
            const rLabel = s.action.riichi ? '[Riichi]' : '';
            actionKey = `ankan-${toNormalFive(s.action.tile)}${rLabel}`;
        }
        else if (s.action.type === 'kakan') {
            actionKey = `kakan-${toNormalFive(s.action.tile)}`;
        }
        else if (s.action.type === 'tsumo') actionKey = 'tsumo';
        else {
            const rLabel = s.action.riichi ? '[Riichi]' : '';
            actionKey = `discard-${s.action.tile}${rLabel}`;
        }

        const fullWall = fullWallMap.get(actionKey)!;

        runBatchSimulations(config, s.action, s, ADDITIONAL_TRIALS, fullWall);
    }

    // Phase 4: Reporting
    const shantenBefore = calculateShanten(config.myHand, config.fixedMentsu.length);

    // CSV Generation
    let csvReport: string | undefined = undefined;
    if (validationMode) {
        const validationRows: string[] = [];
        const headers = [
            "HandID", "Turn", "Action",
            "EV_2000", "Rank_2000",
            "EV_5000", "Rank_5000",
            "RankChanged", "PrunedAt2000",
            "WinRate", "AvgScore", "Variance", "SD", "SE"
        ];
        validationRows.push(headers.join(","));

        const sorted5000 = [...statsList].sort((a, b) => (b.totalScore / b.trials) - (a.totalScore / a.trials));
        const sorted2000 = [...statsList].sort((a, b) => (a.stats2000!.ev) - (b.stats2000!.ev)).reverse();

        const bestEV2000 = sorted2000[0].stats2000!.ev;

        for (const s of statsList) {
            const ev5000 = s.totalScore / s.trials;
            const ev2000 = s.stats2000!.ev;

            const rank5000 = sorted5000.indexOf(s) + 1;
            const rank2000 = sorted2000.indexOf(s) + 1;

            const rankChanged = rank5000 !== rank2000;
            const wouldBePruned = ev2000 < bestEV2000 * 0.9;

            const n = s.trials;
            const variance = Math.max(0, (s.sumSquaredScore - (s.totalScore * s.totalScore) / n) / (n - 1));
            const sd = Math.sqrt(variance);
            const se = sd / Math.sqrt(n);

            let actionLabel = "";
            if (s.action.type === 'kita') actionLabel = '北抜き';
            else if (s.action.type === 'ankan') {
                actionLabel = `暗カン ${tileToString(s.action.tile)}`;
                if (s.action.riichi) actionLabel += " [立直]";
            }
            else if (s.action.type === 'kakan') {
                actionLabel = `加カン ${tileToString(s.action.tile)}`;
            }
            else if (s.action.type === 'tsumo') actionLabel = 'ツモ';
            else {
                actionLabel = tileToString(s.action.tile);
                if (s.action.riichi) actionLabel += " [立直]";
                else if (s.action.riichi === false) actionLabel += " [ダマ]";
            }

            const row = [
                "N/A", // HandID
                config.currentTurn,
                actionLabel,
                Math.round(ev2000),
                rank2000,
                Math.round(ev5000),
                rank5000,
                rankChanged,
                wouldBePruned,
                (s.wins / n).toFixed(4),
                Math.round(s.wins > 0 ? s.totalScore / s.wins : 0),
                Math.round(variance),
                Math.round(sd),
                Math.round(se)
            ];
            validationRows.push(row.join(","));
        }
        csvReport = validationRows.join("\n");

        // Console summary
        const top3MatchRate = sorted5000.slice(0, 3).filter(s => sorted2000.slice(0, 3).includes(s)).length / 3;
        const rank1Match = sorted5000[0] === sorted2000[0];
        console.log(`Validation: Rank1Match=${rank1Match}, Top3Match=${top3MatchRate.toFixed(2)}`);
    }

    // ActionStats additions (need to update interface definition too, but doing logic here first)
    // Wait, I need to update interface first.

    const results: DiscardResult[] = statsList.map(s => {
        const winRate = s.trials > 0 ? s.wins / s.trials : 0;
        const ev = s.trials > 0 ? s.totalScore / s.trials : 0;
        const avgScore = s.wins > 0 ? s.winPoints / s.wins : 0; // Use winPoints calculation
        const tenpaiRate = s.draws > 0 ? s.tenpaiCount / s.draws : 0;

        const handAfterAction = [...myHand];
        if (s.action.type === 'discard') {
            const idx = handAfterAction.indexOf(s.action.tile);
            if (idx > -1) handAfterAction.splice(idx, 1);
        } else if (s.action.type === 'kita') {
            const idx = handAfterAction.indexOf(30 as any);
            if (idx > -1) handAfterAction.splice(idx, 1);
        } else if (s.action.type === 'ankan') {
            const norm = toNormalFive(s.action.tile);
            let removed = 0;
            for (let i = handAfterAction.length - 1; i >= 0; i--) {
                if (toNormalFive(handAfterAction[i]) === norm) {
                    handAfterAction.splice(i, 1);
                    removed++;
                    if (removed === 4) break;
                }
            }
        } else if (s.action.type === 'kakan') {
            const idx = handAfterAction.indexOf(s.action.tile);
            if (idx > -1) handAfterAction.splice(idx, 1);
        }

        const currentFixedCount = (s.action.type === 'ankan') ? config.fixedMentsu.length + 1 : config.fixedMentsu.length;
        const shantenAfter = calculateShanten(handAfterAction, currentFixedCount);

        return {
            action: s.action,
            winRate,
            avgScore,
            ev,
            ronRate: 0,
            tenpaiRate,
            effectiveTiles: s.effectiveTiles,
            shantenBefore,
            shantenAfter
        };
    });

    // Debug Logging
    console.log("\n=== Final Simulation Results ===");
    console.log("Stats Verification: Points Breakdown");

    const sortedResults = [...results].sort((a, b) => b.ev - a.ev);

    for (const res of sortedResults) {
        let actionName = "";

        if (res.action.type === 'kita') actionName = '北抜き';
        else if (res.action.type === 'ankan') {
            actionName = `${tileToString(res.action.tile)}暗槓`;
            if (res.action.riichi) actionName += " [立直]";
        }
        else if (res.action.type === 'kakan') actionName = `${tileToString(res.action.tile)}加カン`;
        else if (res.action.type === 'tsumo') actionName = 'ツモ';
        else {
            actionName = tileToString(res.action.tile);
            if (res.action.riichi) actionName += " [立直]";
            else if (res.action.riichi === false) actionName += " [ダマ]";
        }

        const s = statsList.find(stats => stats.action === res.action);
        if (!s) continue;

        const trials = s.trials;
        const winPoints = s.winPoints;
        const tenpaiPoints = s.tenpaiPoints;
        const notenPoints = s.notenPoints;
        const totalPoints = s.totalScore;

        const measuredEV = trials > 0 ? totalPoints / trials : 0;

        console.log(
            `Action: ${actionName.padEnd(10)} | EV: ${Math.round(measuredEV)} | Trials: ${trials}`
        );

        console.log(
            `  Breakdown: Win=${winPoints}, Tenpai=${tenpaiPoints}, Noten=${notenPoints} => Sum=${winPoints + tenpaiPoints + notenPoints} (Check=${totalPoints})`
        );
    }

    if (results.length > 0 && !validationMode) {
        const bestResult = results.reduce((best, current) =>
            current.ev > best.ev ? current : best
        );
        const visibleTiles = getVisibleTiles(config, bestResult.action);
        let fullWall = generateWall();
        fullWall = removeTilesFromWall(fullWall, visibleTiles);

        // 14枚を王牌 (末尾から取得)
        const deadWall = fullWall.slice(-14);

        // 残りを基本のライブ山として取得
        let liveWall = fullWall.slice(0, -14);

        // 他家配牌(26枚) + 経過巡目によるこれまでの追加ツモを消費
        const additionalDraws = 3 * (config.currentTurn - 1);
        const tilesToConsume = 26 + additionalDraws;

        // 実際に消費した分をスライス
        liveWall = liveWall.slice(tilesToConsume);

        console.log("LIVE", liveWall.length);
        console.log("DEAD", deadWall.length);

        // Debug run
        // 1巡につき3枚（自分1＋他家2）が消費されるため、liveWallの残り枚数から実ツモ回数を算出
        const remainingSelfDraws = Math.floor(liveWall.length / 3);
        runSinglePath(config.myHand, config.fixedMentsu, bestResult.action, liveWall, deadWall, config.kitaCount, config.doraIndicators, config.currentTurn, config.isDealer, remainingSelfDraws);
    }

    return { results, csvReport };
}
