import { isYaochuu, TILES, getTileNumber, getTileType } from './tile';
import type { Tile } from './tile';
import type { HandStructure, Mentsu } from './shanten';

export type YakuResult = {
    han: number;
    fu: number;
    yaku: string[];
    yakuList: { name: string; han: number; isDora?: boolean }[];
    yakuman?: boolean;
    yakumanMultiplier?: number;
};

export type GameState = {
    bakaze: Tile;
    jikaze: Tile;
    isRiichi: boolean;
    isDoubleRiichi: boolean;
    isIppatsu: boolean;
    isTsumo: boolean;
    isRinshan: boolean;
    isChankan: boolean;
    isHaitei: boolean;
    isHoutei: boolean;
    isTenhou?: boolean;
    isChiihou?: boolean;
    kitaCount: number;
    doraCount: number;
    uraDoraCount: number;
    winningTile?: Tile;
    isDealer?: boolean;
    turnCount?: number;
    hasCallOccurred?: boolean;
    discardCount?: number;
};

export function calculateScore(
    hand: Tile[],
    structure: HandStructure,
    state: GameState
): YakuResult {
    const yakuList = checkYaku(hand, structure, state);
    const hasPinfu = yakuList.some(y => y.name === 'Pinfu');
    const fu = calculateFu(hand, structure, state, hasPinfu);

    let han = 0;
    let yakuman = false;

    for (const y of yakuList) {
        if (y.han >= 13) yakuman = true;
        han += y.han;
    }

    const displayYakuList = [...yakuList];
    if (!yakuman) {
        han += state.doraCount;
        han += state.uraDoraCount;
        han += state.kitaCount; // 抜き北を翻数に加算
        if (state.doraCount > 0) {
            displayYakuList.push({ name: 'Dora', han: state.doraCount, isDora: true });
        }
        if (state.uraDoraCount > 0) {
            displayYakuList.push({ name: 'Ura Dora', han: state.uraDoraCount, isDora: true });
        }
        if (state.kitaCount > 0) {
            displayYakuList.push({ name: '抜き北', han: state.kitaCount, isDora: true });
        }
    }

    const result: YakuResult = {
        han,
        fu,
        yaku: yakuList.map(y => y.name),
        yakuList: displayYakuList,
        yakuman: yakuman || han >= 13
    };

    // Calculate yakumanMultiplier
    if (result.yakuman) {
        if (yakuman) {
            // Count how many yakuman (13-han yaku) we have
            const count = yakuList.filter(y => y.han === 13).length;
            result.yakumanMultiplier = count > 0 ? count : 1;
            // If we have yakuman, total han should be 13 * multiplier
            result.han = 13 * result.yakumanMultiplier;
            result.fu = 0;
        } else if (result.han >= 13) {
            // Counted yakuman
            result.yakumanMultiplier = 1;
        }
    }

    return result;
}

function getWaitType(winningTile: Tile | undefined, structure: HandStructure): string {
    if (winningTile === undefined) return "unknown";
    if (winningTile === structure.head) return "tanki";

    for (const m of structure.mentsu) {
        if (m.type === 'shuntsu') {
            const start = m.tile;
            if (winningTile < start || winningTile > start + 2) continue;
            const pos = winningTile - start;
            const startValue = getTileNumber(start);
            if (pos === 1) return "kanchan";
            if (startValue === 1 && pos === 2) return "penchan";
            if (startValue === 7 && pos === 0) return "penchan";
        }
    }
    return "ryanmen";
}

function calculateFu(_hand: Tile[], structure: HandStructure, state: GameState, hasPinfu: boolean): number {
    if (structure.head === -1 && structure.mentsu.length === 0) return 25;

    let fu = 20;
    for (const m of structure.mentsu) {
        if (m.type === "koutsu") {
            const isTerminalOrHonor = isYaochuu(m.tile);
            if (!m.isOpen) fu += isTerminalOrHonor ? 8 : 4;
            else fu += isTerminalOrHonor ? 4 : 2;
        } else if (m.type === "kantsu") {
            const isTerminalOrHonor = isYaochuu(m.tile);
            if (!m.isOpen) fu += isTerminalOrHonor ? 32 : 16;
            else fu += isTerminalOrHonor ? 16 : 8;
        }
    }

    if (isYakuhaiTile(structure.head, state.jikaze, state.bakaze)) {
        if (structure.head === state.bakaze && structure.head === state.jikaze) fu += 4;
        else fu += 2;
    }

    const waitType = getWaitType(state.winningTile, structure);
    if (waitType === "tanki" || waitType === "kanchan" || waitType === "penchan") fu += 2;

    if (state.isTsumo) fu += 2;
    else fu += 10;

    fu = Math.ceil(fu / 10) * 10;
    if (hasPinfu && state.isTsumo) fu = 20;

    // console.log("Final Fu:", fu);
    return fu;
}

type YakuDef = { name: string, han: number, isDora?: boolean };

function isYakuhaiTile(tile: Tile, jikaze: Tile, bakaze: Tile): boolean {
    if (tile === TILES.z5 || tile === TILES.z6 || tile === TILES.z7) return true;
    if (tile === jikaze || tile === bakaze) return true;
    return false;
}

export function isKokushiMusou(hand: Tile[]): boolean {
    if (hand.length !== 14) return false;
    const terminalsAndHonors = new Set([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);
    const countMap = new Map<number, number>();
    for (const tile of hand) {
        if (!terminalsAndHonors.has(tile)) return false;
        countMap.set(tile, (countMap.get(tile) || 0) + 1);
    }
    if (countMap.size !== 13) return false;
    let hasPair = false;
    for (const count of countMap.values()) {
        if (count === 2) hasPair = true;
        else if (count !== 1) return false;
    }
    return hasPair;
}

function isTerminal(tile: Tile): boolean {
    const suit = getTileType(tile);
    if (suit === 'z') return false;
    const num = getTileNumber(tile);
    return num === 1 || num === 9;
}

function isHonor(tile: Tile): boolean {
    return getTileType(tile) === 'z';
}

function isJunchan(structure: HandStructure): boolean {
    if (isHonor(structure.head) || !isTerminal(structure.head)) return false;
    for (const m of structure.mentsu) {
        if (m.type === 'shuntsu') {
            const startNum = getTileNumber(m.tile);
            if (startNum !== 1 && startNum !== 7) return false;
        } else {
            if (!isTerminal(m.tile)) return false;
        }
    }
    return true;
}

function isChanta(structure: HandStructure): boolean {
    let hasHonor = false;
    if (isHonor(structure.head)) hasHonor = true;
    else if (!isTerminal(structure.head)) return false;
    for (const m of structure.mentsu) {
        if (m.type === 'shuntsu') {
            const startNum = getTileNumber(m.tile);
            if (startNum !== 1 && startNum !== 7) return false;
        } else {
            if (isHonor(m.tile)) hasHonor = true;
            else if (!isTerminal(m.tile)) return false;
        }
    }
    return hasHonor;
}

function isChinroutou(hand: Tile[]): boolean {
    if (hand.length === 0) return false;
    for (const tile of hand) {
        if (isHonor(tile) || !isTerminal(tile)) return false;
    }
    return true;
}

function isHonroutou(hand: Tile[]): boolean {
    if (hand.length === 0) return false;
    let hasTerminal = false;
    let hasHonor = false;
    for (const tile of hand) {
        if (isHonor(tile)) {
            hasHonor = true;
        } else if (isTerminal(tile)) {
            hasTerminal = true;
        } else {
            return false;
        }
    }
    return hasTerminal && hasHonor;
}

function isChinitsu(hand: Tile[]): boolean {
    if (hand.length === 0) return false;
    const suits = new Set<string>();
    for (const tile of hand) {
        const suit = getTileType(tile);
        if (suit === 'z') return false;
        suits.add(suit);
    }
    return suits.size === 1;
}

function isHonitsu(hand: Tile[]): boolean {
    if (hand.length === 0) return false;
    const suits = new Set<string>();
    let hasHonor = false;
    for (const tile of hand) {
        const suit = getTileType(tile);
        if (suit === 'z') hasHonor = true;
        else suits.add(suit);
    }
    return suits.size === 1 && hasHonor;
}

function isIttsuu(mentsu: { type: string, tile: Tile, isOpen: boolean }[]): boolean {
    const suitMap: Record<string, Set<number>> = {};
    for (const m of mentsu) {
        if (m.type !== 'shuntsu') continue;
        const suit = getTileType(m.tile);
        const start = getTileNumber(m.tile);
        if (!suitMap[suit]) suitMap[suit] = new Set();
        suitMap[suit].add(start);
    }
    for (const suit in suitMap) {
        const starts = suitMap[suit];
        if (starts.has(1) && starts.has(4) && starts.has(7)) return true;
    }
    return false;
}

function isDaisangen(mentsu: { type: string, tile: Tile, isOpen: boolean }[]): boolean {
    const dragonSet = new Set<number>();
    for (const m of mentsu) {
        if (m.type === 'koutsu' || m.type === 'kantsu') {
            const tile = m.tile;
            if (tile >= 31 && tile <= 33) {
                dragonSet.add(tile);
            }
        }
    }
    return dragonSet.size === 3;
}

function isShousangen(mentsu: { type: string, tile: Tile, isOpen: boolean }[], head: Tile): boolean {
    const dragonKotsu = new Set<number>();
    for (const m of mentsu) {
        if (m.type === 'koutsu' || m.type === 'kantsu') {
            const tile = m.tile;
            if (tile >= 31 && tile <= 33) {
                dragonKotsu.add(tile);
            }
        }
    }
    const hasDragonHead = head >= 31 && head <= 33;
    return dragonKotsu.size === 2 && hasDragonHead;
}

function isSanshokuDoukou(mentsu: { type: string, tile: Tile, isOpen: boolean }[]): boolean {
    const numberMap: Record<number, Set<string>> = {};
    for (const m of mentsu) {
        if (m.type !== 'koutsu' && m.type !== 'kantsu') continue;
        const suit = getTileType(m.tile);
        const num = getTileNumber(m.tile);
        if (suit === 'z') continue;
        // 三麻なので萬子は1と9のみ有効
        if (suit === "m" && num !== 1 && num !== 9) continue;
        if (!numberMap[num]) numberMap[num] = new Set();
        numberMap[num].add(suit);
    }
    for (const num in numberMap) {
        if (numberMap[num].size === 3) return true;
    }
    return false;
}

function isRyanpeikou(mentsu: { type: string, tile: Tile, isOpen: boolean }[]): boolean {
    const shuntsuMap: Record<string, number> = {};
    for (const m of mentsu) {
        if (m.type !== 'shuntsu') continue;
        if (m.isOpen) return false;
        const suit = getTileType(m.tile);
        const start = getTileNumber(m.tile);
        if (suit === "m") continue;
        const key = `${suit}-${start}`;
        shuntsuMap[key] = (shuntsuMap[key] || 0) + 1;
    }
    let pairCount = 0;
    for (const key in shuntsuMap) {
        if (shuntsuMap[key] >= 2) pairCount++;
    }
    return pairCount === 2;
}

function isSuuankou(mentsu: Mentsu[], isMenzen: boolean): boolean {
    if (!isMenzen) return false;
    let ankouCount = 0;
    for (const m of mentsu) {
        if ((m.type === "koutsu" || m.type === "kantsu") && !m.isOpen) {
            ankouCount++;
        }
    }
    return ankouCount === 4;
}

function isTsuiisou(hand: Tile[]): boolean {
    if (hand.length === 0) return false;
    for (const tile of hand) {
        if (!isHonor(tile)) return false;
    }
    return true;
}

function isDaisuushi(mentsu: Mentsu[]): boolean {
    const windSet = new Set<number>();
    for (const m of mentsu) {
        if (m.type === 'koutsu' || m.type === 'kantsu') {
            if (m.tile >= 27 && m.tile <= 30) {
                windSet.add(m.tile);
            }
        }
    }
    return windSet.size === 4;
}

function isShousuushi(mentsu: Mentsu[], head: Tile): boolean {
    const windKotsu = new Set<number>();
    for (const m of mentsu) {
        if (m.type === 'koutsu' || m.type === 'kantsu') {
            if (m.tile >= 27 && m.tile <= 30) {
                windKotsu.add(m.tile);
            }
        }
    }
    const isWindHead = head >= 27 && head <= 30;
    return windKotsu.size === 3 && isWindHead;
}

function isRyuuiisou(mentsu: Mentsu[], head: Tile): boolean {
    const greenTiles = new Set([
        19, 20, 21, 23, 25, // 2s, 3s, 4s, 6s, 8s
        32 // Hatsu
    ]);

    for (const m of mentsu) {
        if (m.type === 'shuntsu') {
            // shuntsu uses 3 tiles starting from m.tile
            for (let i = 0; i < 3; i++) {
                if (!greenTiles.has(m.tile + i)) return false;
            }
        } else {
            if (!greenTiles.has(m.tile)) return false;
        }
    }

    if (!greenTiles.has(head)) return false;

    return true;
}

function isChuurenPoutou(hand: Tile[], isMenzen: boolean): boolean {
    if (!isMenzen || hand.length !== 14) return false;

    const suit = getTileType(hand[0]);
    if (suit === 'z' || suit === 'm') return false;

    const counts = new Array(10).fill(0);
    for (const tile of hand) {
        if (getTileType(tile) !== suit) return false;
        counts[getTileNumber(tile)]++;
    }

    if (counts[1] < 3 || counts[9] < 3) return false;
    for (let i = 2; i <= 8; i++) {
        if (counts[i] < 1) return false;
    }

    return true;
}

function isRyanmenWait(winningTile: Tile, structure: HandStructure): boolean {
    for (const m of structure.mentsu) {
        if (m.type !== 'shuntsu') continue;
        const start = m.tile;
        if (winningTile < start || winningTile > start + 2) continue;
        const pos = winningTile - start;
        const startValue = getTileNumber(start);
        if (startValue === 1 && pos === 2) continue;
        if (startValue === 7 && pos === 0) continue;
        if (pos === 1) continue;
        return true;
    }
    return false;
}

export function isChiitoitsu(hand: Tile[]): boolean {
    if (hand.length !== 14) return false;
    const countMap = new Map<number, number>();
    for (const tile of hand) {
        countMap.set(tile, (countMap.get(tile) || 0) + 1);
    }
    if (countMap.size !== 7) return false;
    for (const count of countMap.values()) {
        if (count !== 2) return false;
    }
    return true;
}

function countKantsu(mentsuList: Mentsu[]): number {
    return mentsuList.filter(m => m.type === "kantsu").length;
}

function checkYaku(hand: Tile[], structure: HandStructure, state: GameState): YakuDef[] {
    const isMenzen = !structure.mentsu.some(m => m.isOpen);

    // Create a virtual full hand for suit/honor checks
    const fullHand: Tile[] = [];
    if (structure.head !== -1) {
        fullHand.push(structure.head, structure.head);
    }
    for (const m of structure.mentsu) {
        fullHand.push(...m.tiles);
    }

    // If it's Kokushi, we might need a special case, but usually checkYaku is for normal structures.
    if (fullHand.length === 0) {
        fullHand.push(...hand);
    }

    const yakumanList: YakuDef[] = [];

    // 役満判定
    if (isChinroutou(fullHand)) {
        yakumanList.push({ name: "清老頭", han: 13 });
    }
    if (structure.head !== -1 && isDaisangen(structure.mentsu)) {
        yakumanList.push({ name: "大三元", han: 13 });
    }
    if (structure.head !== -1 && isSuuankou(structure.mentsu, isMenzen)) {
        yakumanList.push({ name: "四暗刻", han: 13 });
    }
    if (structure.head !== -1 && isRyuuiisou(structure.mentsu, structure.head)) {
        yakumanList.push({ name: "緑一色", han: 13 });
    }
    if (isTsuiisou(fullHand)) {
        yakumanList.push({ name: "字一色", han: 13 });
    }
    if (isChuurenPoutou(fullHand, isMenzen)) {
        yakumanList.push({ name: "九蓮宝燈", han: 13 });
    }
    if (isDaisuushi(structure.mentsu)) {
        yakumanList.push({ name: "大四喜", han: 13 });
    } else if (structure.head !== -1 && isShousuushi(structure.mentsu, structure.head)) {
        yakumanList.push({ name: "小四喜", han: 13 });
    }

    if (countKantsu(structure.mentsu) >= 4) {
        yakumanList.push({ name: "四槓子", han: 13 });
    }

    // 天和・地和判定
    // Note: シミュレーションから直接フラグが渡される場合は優先する
    if (state.isTenhou) {
        yakumanList.push({ name: "天和", han: 13 });
    } else if (state.isChiihou) {
        yakumanList.push({ name: "地和", han: 13 });
    } else if (state.isTsumo && !state.hasCallOccurred && (state.discardCount || 0) === 0) {
        // Fallback for legacy calls or specific situations
        if (state.isDealer && (state.turnCount || 0) === 1) {
            yakumanList.push({ name: "天和", han: 13 });
        } else if (!state.isDealer && (state.turnCount || 0) === 1) {
            yakumanList.push({ name: "地和", han: 13 });
        }
    }

    if (yakumanList.length > 0) {
        return yakumanList;
    }

    const yaku: YakuDef[] = [];

    if (isMenzen) {
        if (state.isDoubleRiichi) {
            yaku.push({ name: 'Double Riichi', han: 2 });
        } else if (state.isRiichi) {
            yaku.push({ name: 'Riichi', han: 1 });
        }
        if (state.isIppatsu) yaku.push({ name: 'Ippatsu', han: 1 });
        if (state.isTsumo) yaku.push({ name: 'Menzen Tsumo', han: 1 });
    }

    if (state.isRinshan && state.isTsumo) {
        yaku.push({ name: '嶺上開花', han: 1 });
    }
    if (state.isHaitei && state.isTsumo) {
        yaku.push({ name: 'Haitei Raoyue', han: 1 });
    }

    const isTanyao = !fullHand.some(t => isYaochuu(t));
    if (isTanyao) yaku.push({ name: 'Tanyao', han: 1 });

    // 一色手判定
    if (isChinitsu(fullHand)) {
        yaku.push({ name: "清一色", han: isMenzen ? 6 : 5 });
    } else if (isHonitsu(fullHand)) {
        yaku.push({ name: "混一色", han: isMenzen ? 3 : 2 });
    }

    // 混老頭判定
    const honroutou = isHonroutou(fullHand);
    if (honroutou) {
        yaku.push({ name: "混老頭", han: 2 });
    }

    const isChiitoiPattern = structure.mentsu.length === 6 && structure.mentsu.every(m => m.type === 'pair');
    if (isChiitoiPattern || structure.head === -1) {
        if (isChiitoitsu(fullHand)) yaku.push({ name: '七対子', han: 2 });
        return yaku;
    }

    const allShuntsu = structure.mentsu.every(m => m.type === 'shuntsu');
    const nonYakuhaiHead = !isYakuhaiTile(structure.head, state.jikaze, state.bakaze);
    const ryanmenWait = state.winningTile !== undefined ? isRyanmenWait(state.winningTile, structure) : false;

    if (isMenzen && allShuntsu && nonYakuhaiHead && ryanmenWait) {
        yaku.push({ name: 'Pinfu', han: 1 });
    }

    for (const m of structure.mentsu) {
        if (m.type === 'koutsu' || m.type === 'kantsu') {
            if (m.tile === state.bakaze) yaku.push({ name: 'Yakuhai (Round)', han: 1 });
            if (m.tile === state.jikaze) yaku.push({ name: 'Yakuhai (Seat)', han: 1 });
            if (m.tile === TILES.z5) yaku.push({ name: 'Yakuhai (Haku)', han: 1 });
            if (m.tile === TILES.z6) yaku.push({ name: 'Yakuhai (Hatsu)', han: 1 });
            if (m.tile === TILES.z7) yaku.push({ name: 'Yakuhai (Chun)', han: 1 });
        }
    }

    const shuntsuList = structure.mentsu.filter(m => m.type === 'shuntsu').map(m => m.tile);
    const shuntsuCounts: { [key: number]: number } = {};
    for (const s of shuntsuList) shuntsuCounts[s] = (shuntsuCounts[s] || 0) + 1;
    let iipeikouCount = 0;
    if (isMenzen) {
        for (const key in shuntsuCounts) if (shuntsuCounts[key] >= 2) iipeikouCount++;
    }

    if (isMenzen && isRyanpeikou(structure.mentsu)) {
        yaku.push({ name: "二盃口", han: 3 });
    } else if (iipeikouCount >= 1) {
        yaku.push({ name: 'Iipeikou', han: 1 });
    }

    // San-ankou (三暗刻) - 鳴きに関わらず暗刻が3つあれば成立
    let ankouCount = 0;
    for (const m of structure.mentsu) {
        if ((m.type === "koutsu" || m.type === "kantsu") && !m.isOpen) {
            ankouCount++;
        }
    }
    if (ankouCount >= 3) yaku.push({ name: 'San-ankou', han: 2 });

    // 純全帯么九・混全帯么九判定
    if (!honroutou) {
        if (isJunchan(structure)) {
            yaku.push({ name: "純全帯么九", han: isMenzen ? 3 : 2 });
        } else if (isChanta(structure)) {
            yaku.push({ name: "混全帯么九", han: isMenzen ? 2 : 1 });
        }
    }

    // 一気通貫
    if (isIttsuu(structure.mentsu)) {
        yaku.push({ name: "一気通貫", han: isMenzen ? 2 : 1 });
    }

    // 小三元判定
    if (structure.head !== -1 && isShousangen(structure.mentsu, structure.head)) {
        yaku.push({ name: "小三元", han: 2 });
    }

    // Toitoi (対々和)
    if (structure.mentsu.every(m => m.type === 'koutsu' || m.type === 'kantsu')) {
        yaku.push({ name: 'Toitoi', han: 2 });
    }

    // 三色同刻
    if (isSanshokuDoukou(structure.mentsu)) {
        yaku.push({ name: "三色同刻", han: 2 });
    }

    // 三槓子
    if (countKantsu(structure.mentsu) === 3) {
        yaku.push({ name: "三槓子", han: 2 });
    }

    return yaku;
}
