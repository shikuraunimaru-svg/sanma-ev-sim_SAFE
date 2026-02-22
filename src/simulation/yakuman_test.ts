
import { TILES } from '../core/tile';
// import { runSinglePath } from './engine'; // Unused
import { calculateScore } from '../core/yaku';
import type { GameState } from '../core/yaku';
import { getAgariPatterns } from '../core/shanten';

// Mock logs
const originalLog = console.log;
console.log = (...args) => originalLog(...args);

function testSuukantsu() {
    console.log("=== Testing Suukantsu ===");
    // Hand with 4 Kans (Ankan or Minkan)
    // In simulation, we usually have fixedMentsu for Kans.
    // Let's test calculateScore directly since runSinglePath makes it hard to force 4 Kans without complex setup.

    const hand = [TILES.z1, TILES.z1]; // Pair
    const fixedMentsu = [
        { type: 'kantsu', tile: TILES.m1, tiles: [TILES.m1, TILES.m1, TILES.m1, TILES.m1], isOpen: false, isKan: true },
        { type: 'kantsu', tile: TILES.p1, tiles: [TILES.p1, TILES.p1, TILES.p1, TILES.p1], isOpen: false, isKan: true },
        { type: 'kantsu', tile: TILES.s1, tiles: [TILES.s1, TILES.s1, TILES.s1, TILES.s1], isOpen: false, isKan: true },
        { type: 'kantsu', tile: TILES.z2, tiles: [TILES.z2, TILES.z2, TILES.z2, TILES.z2], isOpen: false, isKan: true }
    ];

    const patterns = getAgariPatterns(hand, fixedMentsu as any);
    if (patterns.length === 0) {
        console.error("FAILED: No agari pattern for Suukantsu hand");
        return;
    }

    const state: GameState = {
        bakaze: TILES.z1, jikaze: TILES.z1,
        isRiichi: false, isDoubleRiichi: false, isIppatsu: false, isTsumo: true,
        isRinshan: false, isChankan: false, isHaitei: false, isHoutei: false,
        kitaCount: 0, doraCount: 0, uraDoraCount: 0,
        winningTile: TILES.z1, isDealer: true
    };

    const result = calculateScore(hand, patterns[0], state);
    const hasSuukantsu = result.yaku.includes("四槓子");
    console.log("Has Suukantsu:", hasSuukantsu);
    if (!hasSuukantsu) console.error("FAILED: Suukantsu not detected");
}

function testTenhou() {
    console.log("=== Testing Tenhou ===");
    // Tenhou: Dealer, Turn 1, Tsumo, No Calls
    const hand = [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p1, TILES.p1, TILES.p1,
        TILES.s1, TILES.s1, TILES.s1,
        TILES.z1, TILES.z1, TILES.z2, TILES.z2, TILES.z2
    ];
    // Winning on z1
    const patterns = getAgariPatterns(hand, []);
    const state: GameState = {
        bakaze: TILES.z1, jikaze: TILES.z1,
        isRiichi: false, isDoubleRiichi: false, isIppatsu: false, isTsumo: true,
        isRinshan: false, isChankan: false, isHaitei: false, isHoutei: false,
        kitaCount: 0, doraCount: 0, uraDoraCount: 0,
        winningTile: TILES.z1,
        isDealer: true,
        turnCount: 1, // First turn
        hasCallOccurred: false,
        discardCount: 0
    };
    const result = calculateScore(hand, patterns[0], state);
    const hasTenhou = result.yaku.includes("天和");
    console.log("Has Tenhou:", hasTenhou);
    if (!hasTenhou) console.error("FAILED: Tenhou not detected");
}

function testChiihou() {
    console.log("=== Testing Chiihou ===");
    // Chiihou: Non-Dealer, Turn 1, Tsumo, No Calls
    const hand = [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p1, TILES.p1, TILES.p1,
        TILES.s1, TILES.s1, TILES.s1,
        TILES.z1, TILES.z1, TILES.z2, TILES.z2, TILES.z2
    ];
    const patterns = getAgariPatterns(hand, []);
    const state: GameState = {
        bakaze: TILES.z1, jikaze: TILES.z2, // Non-dealer (South)
        isRiichi: false, isDoubleRiichi: false, isIppatsu: false, isTsumo: true,
        isRinshan: false, isChankan: false, isHaitei: false, isHoutei: false,
        kitaCount: 0, doraCount: 0, uraDoraCount: 0,
        winningTile: TILES.z1,
        isDealer: false, // Non-dealer
        turnCount: 1, // First turn
        hasCallOccurred: false,
        discardCount: 0
    };
    const result = calculateScore(hand, patterns[0], state);
    const hasChiihou = result.yaku.includes("地和");
    console.log("Has Chiihou:", hasChiihou);
    if (!hasChiihou) console.error("FAILED: Chiihou not detected");
}

/*
function testTenhouEngine() {
    console.log("=== Testing Tenhou via Engine ===");
    // To test engine, we need to mock a wall such that we draw a winning tile immediately.
    // User hand: 13 tiles, tenpai.
    // Wall: winning tile at top.
    
    const hand = [
        TILES.m1, TILES.m1, TILES.m1,
        TILES.p1, TILES.p1, TILES.p1,
        TILES.s1, TILES.s1, TILES.s1,
        TILES.z1, TILES.z2, TILES.z2, TILES.z2 // Waiting on z1
    ];
    
    // Config: Dealer, Turn 0 (start)
    const action: Action = { type: 'discard', tile: TILES.z1 }; // Dummy action, simulator will draw first.
    
    // We need to runSinglePath but initialAction is 'discard' usually imply we *have* drawn?
    // Wait, runSinglePath starts with `hand` (14 tiles if we just drew?).
    // No, `runSinglePath` takes `initialHand`. 
    // If it's the start of the game, we have 14 tiles (Dealer).
    // The simulator logic:
    // `hand` has 14 tiles.
    // We choose an action (Discard X).
    // Then we discard.
    // Then loop -> turnCount++ -> draw.
    // So Tenhou (Win on first draw) is actually "Win on initial hand" for Dealer.
    // But simulator loop *starts* by executing the chosen action (Discard).
    // So if we have Tenhou, we don't discard! We declare Tsumo (Win).
    // But `runSinglePath` assumes we picked an action.
    // If the action is "WSUM (Tsumo)", then we win.
    // But `Action` type only has `discard`, `kita`, `ankan`.
    // It DOES NOT have `tsumo`.
    // The simulator `simulateAllDiscards` creates actions for Discard/Kita/Ankan.
    // It CHECKS for Tsumo *before* creating actions? 
    // Or does it treat Tsumo as a result of "State evaluation"?
    
    // Actually, `simulator.worker.ts` calculates `shanten`. If 0, checking for win?
    // `simulator.worker.ts` does NOT check for immediate win in `simulateAllDiscards` loop for *actions*.
    // It checks `calculateShanten` on initial hand.
    // If we have specific UI for "Tsumo", it would be an action?
    // Currently `Action` = discard | kita | ankan.
    // We don't verify "can I Tsumo now" in `runSinglePath` *before* the first discard.
    // `runSinglePath` executes `initialAction` (Discard X) -> then loops.
    // So `runSinglePath` CANNOT simulate Tenhou (winning on the very first 14 tiles).
    // Tenhou happens *instead* of a discard action.
    
    // HOWEVER, Tenhou implementation in `yaku.ts` relies on `turnCount === 1` and `discardCount === 0`.
    // If we simulate a path where we *draw* a winning tile on turn 1...
    // That's Tenhou for Dealer?
    // No, Dealer starts with 14 tiles. Tenhou is winning on that initial 14 tiles.
    // Non-Dealer starts with 13 tiles. Chiihou is winning on *first draw*.
    
    // So for Dealer: Tenhou is "Win immediately".
    // For Non-Dealer: Chiihou is "Win on first draw".
    
    // `runSinglePath` logic:
    // It simulates "I do X, then what happens".
    // If I am Dealer and have Tenhou, I just win. I don't "do X".
    // Does the simulator handle "Immediate Win"?
    // In `simulator.worker.ts`:
    // It calculates `initialShanten`.
    // If `initialShanten === -1` (Win), does it return a "Win" action?
    // Currently, `simulateAllDiscards` generates Discard/Kita/Ankan actions.
    // It does NOT generate a "Generic Win" action.
    // So Tenhou visualization might be missing from the "Actions" list?
    // BUT, if `runSinglePath` is for "EV of Discarding X", then Tenhou is irrelevant (we wouldn't discard).
    // The user wants Tenhou *supported*.
    // If I have Tenhou, the UI should probably show "Tsumo" button or auto-win.
    // Our EV sim shows "Best Discard".
    // If we have Tenhou, the "Best Discard" is... well, we shouldn't discard.
    
    // But Chiihou (Non-Dealer) IS a simulation target?
    // "I discard X (on turn 0... wait, I don't discard, I draw first)".
    // Non-Dealer:
    // 1. Draw tile (Turn 1).
    // 2. Check Win (Chiihou?).
    // 3. If no win, Discard.
    
    // Our simulator assumes `myHand` is the hand *before* we decide an action.
    // If Non-Dealer, we have 14 tiles (after draw).
    // So we invoke simulator *after* drawing.
    // So `turnCount` should be 1?
    // `engine.ts` starts `turnCount = 0`.
    // Loop increments `turnCount++` (becomes 1).
    // But loop is "Draw -> Win Check -> Discard".
    // `runSinglePath` does `initialAction` (Discard) FIRST.
    // So it simulates "I Discard X".
    // Then Opponents move.
    // Then Turn 2 (My Turn) -> Draw -> Win Check.
    // So `runSinglePath` simulates NEXT turn wins.
    // It does NOT simulate "Winning on current hand".
    
    // So... Tenhou/Chiihou might inherently NOT be reachable via `runSinglePath` discard simulation?
    // UNLESS we are simulating "What if I discard X, and then next turn..."
    // Tenhou/Chiihou matches "First Turn".
    // If we discard X, we yield the turn. So we lose Tenhou/Chiihou potential 
    // (unless we are testing "Did I just miss Tenhou?").
    
    // Wait.
    // `yaku.ts` logic says `if (turnCount === 1)`.
    // In `runSinglePath`:
    // We discard (Turn 1 starts... wait).
    // `currentTurn` passed in.
    // If `isDealer`, Turn 1 is NOW.
    // If I discard, I finish Turn 1.
    // Next my turn is Turn 2.
    // So `runSinglePath` results (Future wins) can NEVER be Tenhou/Chiihou.
    // Because those must happen on Turn 1.
    // All `runSinglePath` simulated wins happen `turnCount++` (after initial discard).
    // So they happen on Turn 2+.
    
    // CONCLUSION: Tenhou/Chiihou are "Immediate Wins".
    // They should be detected in `simulator.worker.ts` as an "Immediate Win" action?
    // Or just recognized by `yaku.ts` if we happen to use `calculateScore` on the *current* hand.
    
    // If the user wants to *see* Tenhou/Chiihou in the results...
    // The results table shows "Discard X -> EV Y".
    // It doesn't show "Tsumo".
    // Because Tsumo is an action we take *instead* of discarding.
    // Does the simulator support "Win Action"?
    // Currently no. It lists Discards/Kita/Ankan.
    
    // However, for verification of *logic* (calculateScore), my test above is sufficient.
    // For `engine.ts` to support it... maybe irrelevant for "Discard EV".
    // BUT we should verify that `yaku.ts` is correct.
    
    // One edge case: `Chiihou` logic in `yaku.ts` uses `turnCount === 1`.
    // If I am Non-Dealer, `engine.ts` starts with me having 14 tiles (after draw).
    // If I run `calculateScore` on this hand, passing `turnCount: 1`, it should say Chiihou.
    // But standard `runSinglePath` skips this check.
}
*/

testSuukantsu();
testTenhou();
testChiihou();
