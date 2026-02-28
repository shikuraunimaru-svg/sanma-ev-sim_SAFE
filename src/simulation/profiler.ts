
import { performance } from 'perf_hooks';
import { runSinglePath } from './engine';
import { TILES, toNormalFive } from '../core/tile';
import { calculateShanten, clearShantenCache, getAgariPatterns } from '../core/shanten';
import { calculateScore } from '../core/yaku';
import { toSanmaTile } from '../core/sanmaTiles';

async function profile() {
    const hand = [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p1, TILES.p1, TILES.p1,
        TILES.s1, TILES.s1, TILES.s1,
        TILES.z1, TILES.z1, TILES.z1,
        TILES.z2, TILES.z2
    ];
    const visible = [...hand, TILES.p9];
    const config = {
        myHand: hand,
        fixedMentsu: [],
        kitaCount: 0,
        otherKita: 0,
        doraIndicators: [TILES.p9],
        currentTurn: 1,
        isDealer: true
    };

    const TRIALS = 5000;
    console.log(`Starting refined profile with ${TRIALS} trials...`);

    // 1. Measure Shanten Preamble (Array creation + Join)
    const sPre = performance.now();
    for (let i = 0; i < 100000; i++) {
        const counts27 = new Int32Array(27);
        for (const t of hand) {
            const s = toSanmaTile(toNormalFive(t));
            if (s !== -1) counts27[s]++;
        }
        const key = counts27.join(',') + '|' + 0;
    }
    const preambleTime = (performance.now() - sPre) / 100000;
    console.log(`Average Shanten Preamble: ${preambleTime.toFixed(6)} ms`);

    // 2. Measure Shanten Internal (Recursive search - Raw)
    // We'll use a unique hand for each call to avoid cache
    const sSearch = performance.now();
    for (let i = 0; i < 1000; i++) {
        clearShantenCache();
        const tempHand = [...hand];
        tempHand[0] = (i % 34) as any;
        calculateShanten(tempHand, 0);
    }
    const searchTime = (performance.now() - sSearch) / 1000 - preambleTime;
    console.log(`Average Shanten Search (Raw): ${searchTime.toFixed(6)} ms`);

    // 3. Measure runSinglePath (Total)
    const s3 = performance.now();
    for (let i = 0; i < TRIALS; i++) {
        runSinglePath(
            config.myHand,
            config.fixedMentsu,
            { type: 'discard', tile: TILES.z2 },
            visible,
            config.kitaCount,
            config.otherKita,
            config.doraIndicators,
            config.currentTurn,
            config.isDealer
        );
    }
    const totalTime = performance.now() - s3;

    // Estimation with more detail
    const shantenCallsPerPath = 200;
    const agariCallsPerPath = 0.5;

    // Total shanten time = calls * (preamble + searched_or_cached)
    // In MC, most calls are cached. Let's assume 90% cache hit.
    const cacheHitRate = 0.9;
    const avgShantenTimePerCall = preambleTime + (searchTime * (1 - cacheHitRate));

    const shantenTotal = TRIALS * shantenCallsPerPath * avgShantenTimePerCall;
    const agariTotal = TRIALS * agariCallsPerPath * 0.005; // From previous run
    const others = totalTime - shantenTotal - agariTotal;

    console.log("\n--- Refined Processing Breakdown ---");
    console.log(`向聴計算 (Shanten Total): ~${((shantenTotal / totalTime) * 100).toFixed(1)}%`);
    console.log(`  └ Preamble (Join等): ~${((TRIALS * shantenCallsPerPath * preambleTime / totalTime) * 100).toFixed(1)}%`);
    console.log(`  └ Search (再帰探索): ~${((TRIALS * shantenCallsPerPath * searchTime * (1 - cacheHitRate) / totalTime) * 100).toFixed(1)}%`);
    console.log(`和了判定 (Agari/Score): ~${((agariTotal / totalTime) * 100).toFixed(1)}%`);
    console.log(`その他 (Draw/Discard/Loop): ~${((others / totalTime) * 100).toFixed(1)}%`);
    console.log(`Average runSinglePath: ${(totalTime / TRIALS).toFixed(4)} ms`);
}

profile();
