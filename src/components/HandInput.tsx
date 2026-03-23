import { useState } from 'react';
import { TILES, sortHand, toNormalFive, getTileNumber, getKanTiles, getPonTiles, getTileType } from '../core/tile';
import type { Tile } from '../core/tile';
import { TileDisplay } from './TileDisplay';
import { MentsuDisplay } from './MentsuDisplay';
import { countVisibleTiles, isTileLimitReached, isRedLimitReached } from '../utils/tileCount';
import type { TileCountState } from '../utils/tileCount';

import type { Mentsu } from '../core/shanten';

type Props = {
    hand: Tile[];
    onChange: (hand: Tile[]) => void;
    fixedMentsu: Mentsu[];
    onFixedMentsuChange: (mentsu: Mentsu[]) => void;
    doraIndicators: Tile[];
    onDoraChange: (dora: Tile[]) => void;
    maxTiles?: number;
};

type TabId = 'hand' | 'dora' | 'pon' | 'minkan' | 'ankan';

export function HandInput({
    hand,
    onChange,
    fixedMentsu,
    onFixedMentsuChange,
    doraIndicators,
    onDoraChange,
    maxTiles = 14
}: Props) {
    const [activeTab, setActiveTab] = useState<TabId>('hand');

    const totalTilesInStructure = hand.length + fixedMentsu.length * 3;

    // Global State for Counting
    const stat: TileCountState = {
        hand,
        fixedMentsu,
        doraIndicators,
        kitaCount: 0 // Automated Kita means user never specifies it directly in UI state representation
    };

    const addTile = (t: Tile) => {
        if (isTileLimitReached(t, stat)) {
            // alert("この牌は既に4枚使用されています"); // Disabled UI is enough, alert optional or fallback
            return;
        }

        const suitT = getTileType(t);
        const normT = toNormalFive(t);

        // Specific Red Check
        if (isRedLimitReached(t, stat)) {
            // alert(`赤${suitT === 'p' ? '5p' : '5s'}は既に1枚使用されています`);
            return;
        }

        if (activeTab === 'hand') {
            if (totalTilesInStructure >= maxTiles) return;
            onChange(sortHand([...hand, t]));
        } else if (activeTab === 'dora') {
            if (doraIndicators.length >= 5) return;
            onDoraChange([...doraIndicators, t]);
        } else if (activeTab === 'pon') {
            // Logic check: Can we Pon if we don't have enough copies left? 
            // We need 3 copies. current usage + 3 <= 4.
            if (countVisibleTiles(t, stat) + 3 > 4) {
                alert("その牌はこれ以上副露できません（ドラ表示牌/北抜き等を含め合計4枚を超えます）");
                return;
            }
            if (totalTilesInStructure + 3 > maxTiles) return;

            if (fixedMentsu.some(m => m.type === 'koutsu' && toNormalFive(m.tile) === normT)) {
                alert("同じ牌を複数回ポンすることはできません");
                return;
            }

            const ponTiles = getPonTiles(t);
            onFixedMentsuChange([...fixedMentsu, {
                type: 'koutsu',
                tile: toNormalFive(t),
                tiles: ponTiles,
                isOpen: true,
                isKan: false
            }]);
        } else if (activeTab === 'minkan' || activeTab === 'ankan') {
            // Check usage + 4 <= 4
            if (countVisibleTiles(t, stat) + 4 > 4) {
                alert("その牌はこれ以上副露できません（ドラ表示牌/北抜き等を含め合計4枚を超えます）");
                return;
            }
            if (totalTilesInStructure + 3 > maxTiles) return;

            // Kan automatically includes a red tile if it's a 5p/5s
            if (getTileNumber(normT) === 5 && (suitT === 'p' || suitT === 's')) {
                if (isRedLimitReached(t, stat)) { // Actually need to check if we are *adding* a red separately? 
                    // getKanTiles includes red if available.
                    // If red is used elsewhere, we can't use it here?
                    // Simplified: just block if Red is used.
                    alert(`赤${suitT === 'p' ? '5p' : '5s'}が他で使用されているため、5のカンはできません`);
                    return;
                }
            }

            const kanTiles = getKanTiles(t);
            onFixedMentsuChange([...fixedMentsu, {
                type: 'kantsu',
                tile: toNormalFive(t),
                tiles: kanTiles,
                isOpen: activeTab === 'minkan',
                isKan: true
            }]);
        }
    };

    const removeTile = (index: number) => {
        const newHand = [...hand];
        newHand.splice(index, 1);
        onChange(newHand);
    };

    const removeDora = (index: number) => {
        const newDora = [...doraIndicators];
        newDora.splice(index, 1);
        onDoraChange(newDora);
    };

    const removeMentsu = (index: number) => {
        const newMentsu = [...fixedMentsu];
        newMentsu.splice(index, 1);
        onFixedMentsuChange(newMentsu);
    };

    const clearAll = () => {
        onChange([]);
        onFixedMentsuChange([]);
        onDoraChange([]);
    };

    const tabs: { id: TabId; label: string }[] = [
        { id: 'hand', label: '手牌' },
        { id: 'dora', label: 'ドラ表示牌' },
        { id: 'pon', label: '明刻子' },
        { id: 'minkan', label: '明槓子' },
        { id: 'ankan', label: '暗槓子' },
    ];

    const manzu = [TILES.m1, TILES.m9];
    const pinzu = [9, 10, 11, 12, 13, 14, 15, 16, 17];
    const souzu = [18, 19, 20, 21, 22, 23, 24, 25, 26];
    const zihai = [27, 28, 29, 30, 31, 32, 33]; // z4 is 30

    // Render Helper
    const isForcedKakanDisabled = (t: Tile) => {
        if (activeTab !== 'hand') return false;
        const normT = toNormalFive(t);
        const isForcedTile = normT === TILES.m1 || normT === TILES.m9 || normT >= TILES.z1;
        if (!isForcedTile) return false;
        // 既にポンしている場合は加槓を禁止し、自動加槓の仕様に従う
        return fixedMentsu.some(m => m.type === 'koutsu' && m.isOpen && toNormalFive(m.tile) === normT);
    };

    const renderTileButton = (t: Tile, index: number, prefix: string) => {
        const isNorth = t === TILES.z4;
        const isNorthDisabled = isNorth && activeTab !== 'dora';
        const disabled = isTileLimitReached(t, stat) || isRedLimitReached(t, stat) || isNorthDisabled || isForcedKakanDisabled(t);

        return (
            <div key={`${prefix}-${t}-${index}`} className={disabled ? "opacity-30 cursor-not-allowed pointer-events-none" : ""}>
                <TileDisplay tile={t} onClick={() => !disabled && addTile(t)} />
            </div>
        );
    };

    // 最大枚数に達しているかどうかの全体判定（handタブでのみ最大枚数制限が一番厳しくかかるが、他のタブでも追加できない場合は無効化する）
    // 要件：門前時14枚（または14枚-副露）に達した時点で入力不可＆半透明
    const isMaxReached = activeTab === 'hand' && totalTilesInStructure >= maxTiles;

    return (
        <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-inner dark:shadow-gray-900/50">
            <div className="flex justify-between items-end border-b border-gray-200 dark:border-gray-700">
                <div className="flex gap-1">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab.id
                                ? 'bg-white dark:bg-gray-700 border-x border-t border-gray-200 dark:border-gray-600 text-blue-600 dark:text-blue-400'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <button onClick={clearAll} className="mb-2 text-xs text-red-500 hover:text-red-700 underline">全てクリア</button>
            </div>

            {/* Display Area */}
            <div className="bg-white dark:bg-gray-700 p-4 rounded border border-gray-200 dark:border-gray-600 min-h-[120px] flex flex-col gap-4">
                {/* Hand and Calls */}
                <div className="flex flex-wrap items-end gap-2">
                    {/* Concealed Hand */}
                    <div className="flex flex-nowrap gap-0">
                        {hand.length === 0 && fixedMentsu.length === 0 && <span className="text-gray-400 dark:text-gray-500 italic">牌を選択してください</span>}
                        {hand.map((t: Tile, idx: number) => (
                            <TileDisplay key={`hand-tile-${t}-${idx}`} tile={t} onClick={() => removeTile(idx)} />
                        ))}
                    </div>

                    {/* Fixed Mentsu */}
                    {fixedMentsu.map((m: Mentsu, mIdx: number) => (
                        <div key={`fixed-mentsu-${m.tile}-${mIdx}`} className="relative group">
                            <MentsuDisplay mentsu={m} size="result" />
                            <button
                                onClick={() => removeMentsu(mIdx)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>

                {/* Dora Area */}
                <div className="flex items-center gap-4 text-sm border-t border-gray-100 dark:border-gray-600 pt-2">
                    <span className="text-gray-500 dark:text-gray-400">ドラ表示牌:</span>
                    <div className="flex gap-1">
                        {doraIndicators.map((t: Tile, idx: number) => (
                            <TileDisplay key={`dora-tile-${t}-${idx}`} tile={t} size="dora" onClick={() => removeDora(idx)} />
                        ))}
                    </div>
                </div>
            </div>


            {/* Input Panel - Vertical Layout with Horizontal Rows */}
            <div className={`flex flex-col gap-4 items-start transition-opacity duration-200 ${isMaxReached ? 'opacity-50 pointer-events-none' : ''}`}>
                {/* Upper Row: Manzu and Zihai */}
                <div className="flex flex-row gap-2 items-center justify-start">
                    {manzu.map((t: Tile, idx: number) => renderTileButton(t, idx, 'manzu'))}

                    {/* Spacer to align Haku/Hatsu/Chun properly under Pinzu. 
                        Pinzu has 9 regular tiles + 1 red.
                        Manzu has 2 tiles (1m, 9m).
                        We want Chun (the 7th zihai) to align under Red 5p.
                        Red 5p is the 10th item in the Pinzu row.
                        So we need (Manzu(2) + Spacer + Zihai(7)) to align dynamically or just use a fixed spacer.
                        A spacer of width roughly equal to 1 tile will push Zihai to right. */}
                    <div key="spacer-zihai" className="w-8 sm:w-10"></div> {/* 1牌分程度のスペース */}
                    {zihai.map((t: Tile, idx: number) => renderTileButton(t, idx, 'zihai'))}
                </div>

                {/* Pinzu Row */}
                <div className="flex flex-row gap-2 items-center justify-start">
                    {pinzu.map((t: Tile, idx: number) => renderTileButton(t, idx, 'pinzu'))}
                    {renderTileButton(TILES.p5r, 0, 'pinzu-red')}
                </div>

                {/* Souzu Row */}
                <div className="flex flex-row gap-2 items-center justify-start">
                    {souzu.map((t: Tile, idx: number) => renderTileButton(t, idx, 'souzu'))}
                    {renderTileButton(TILES.s5r, 0, 'souzu-red')}
                </div>
            </div>
        </div>
    );
}
