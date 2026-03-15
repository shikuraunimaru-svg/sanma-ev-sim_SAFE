import { TileDisplay } from './TileDisplay';
import { MentsuDisplay } from './MentsuDisplay';
import type { Tile } from '../core/tile';
import type { Mentsu } from '../core/shanten';
import type { SimulationSummary } from '../simulation/engine';

type Props = {
    hand: Tile[];
    fixedMentsu: Mentsu[];
    doraIndicators: Tile[];
    kitaCount: number;
    otherKitaCount?: number;
    executionTurn: number;
    summary: SimulationSummary | null;
};

export function ResultHeader({ hand, fixedMentsu, doraIndicators, kitaCount, otherKitaCount = 0, executionTurn, summary }: Props) {
    return (
        <div className="flex flex-col gap-3 mb-6 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            {/* Hand Display - Single Row */}
            <div className="flex flex-nowrap gap-2 items-center overflow-x-auto p-1 bg-gray-50 rounded border border-gray-200">
                <div className="flex flex-nowrap gap-[2px]">
                    {hand.map((t, idx) => (
                        <TileDisplay key={`summary-hand-${t}-${idx}`} tile={t} />
                    ))}
                </div>
                {fixedMentsu.length > 0 && <div className="w-1 h-8 bg-gray-300 mx-1" />}
                <div className="flex flex-nowrap gap-2">
                    {fixedMentsu.map((m, idx) => (
                        <MentsuDisplay key={`summary-mentsu-${m.tile}-${idx}`} mentsu={m} size="result" />
                    ))}
                </div>
            </div>

            {/* Dora, Kita, and Execution Turn - Single Row */}
            <div className="flex flex-row gap-4 items-center text-sm flex-wrap">
                <div className="flex flex-row gap-1 items-center">
                    <span className="text-gray-700 font-bold mr-1">ドラ表示牌：</span>
                    {doraIndicators.length > 0 ? (
                        <div className="flex gap-[2px]">
                            {doraIndicators.map((t, idx) => (
                                <TileDisplay key={`summary-dora-${t}-${idx}`} tile={t} size="small" />
                            ))}
                        </div>
                    ) : (
                        <span className="text-gray-500 font-normal">なし</span>
                    )}
                </div>

                <div className="flex flex-row gap-1 items-center border-l border-gray-300 pl-4">
                    <span className="text-gray-700 font-bold">自分の抜き北：{kitaCount}枚</span>
                    <span className="text-gray-400 font-bold mx-1">｜</span>
                    <span className="text-gray-700 font-bold">他家合計抜き北：{otherKitaCount}枚</span>
                </div>

                <div className="flex flex-row gap-1 items-center border-l border-gray-300 pl-4">
                    <span className="execution-turn font-bold text-gray-700">
                        実行巡目：{executionTurn}巡目
                    </span>
                </div>
            </div>

            {/* Summary Details: Remaining Tiles and Shanten Breakdown */}
            {summary && (
                <div className="flex flex-col gap-1 border-t border-gray-100 pt-2 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                        <span className="font-bold">残り山枚数：</span>
                        <span>{summary.displayRemainingTiles}枚</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-bold">向聴数：</span>
                        <span className="bg-gray-100 px-2 py-0.5 rounded mr-2">一般形 {summary.shanten.normal >= 0 ? summary.shanten.normal : '和了'}</span>
                        <span className="bg-gray-100 px-2 py-0.5 rounded mr-2">七対子 {summary.shanten.chiitoi >= 0 ? summary.shanten.chiitoi : '和了'}</span>
                        <span className="bg-gray-100 px-2 py-0.5 rounded">国士無双 {summary.shanten.kokushi >= 0 ? summary.shanten.kokushi : '和了'}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
