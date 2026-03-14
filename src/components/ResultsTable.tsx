import type { DiscardResult } from '../simulation/engine';
import { TileDisplay } from './TileDisplay';

type Props = {
    results: DiscardResult[];
};

export function ResultsTable({ results }: Props) {
    // Ultimate Successive Elimination with Common Random Numbers (CRN)
    // Sort by EV desc
    const sorted = [...results].sort((a, b) => b.ev - a.ev);
    const best = sorted[0];

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">打牌</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">期待値</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">和了率</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">平均打点</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">聴牌率</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">有効牌</th>
                    </tr>
                </thead>
                <tbody className="bg-white">
                    {sorted.map((res, idx) => {
                        const isBest = res === best;
                        const action = res.action;
                        const key = `result-${action.type}-${'tile' in action ? action.tile : ''}-${idx}`;

                        // Calculate EV loss
                        let lossDisplay = null;
                        if (!isBest && best.ev > 0) {
                            const lossRate = ((best.ev - res.ev) / best.ev) * 100;
                            lossDisplay = (
                                <div className="text-[0.85em] text-gray-400 font-normal mt-1">
                                    (△{lossRate.toFixed(1)}%)
                                </div>
                            );
                        }

                        return (
                            <tr key={key} className={`border-b border-gray-200 ${isBest ? "bg-blue-50" : ""}`}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col items-center justify-center scale-90 origin-center">
                                        {res.action.type !== 'tsumo' && (
                                            <TileDisplay
                                                tile={res.action.type === 'kita' ? 30 : (res.action.type === 'ankan' || res.action.type === 'kakan') ? res.action.tile : res.action.tile}
                                                size="result"
                                                className={isBest ? "ring-2 ring-yellow-400 rounded-sm shadow-md" : ""}
                                            />
                                        )}
                                        {res.action.type === 'kita' && (
                                            <div className="mt-1 text-[12px] font-bold text-blue-500 leading-none text-center">北抜き</div>
                                        )}
                                        {res.action.type === 'discard' && (res.action as any).riichi && (
                                            <div className="mt-1 text-[12px] font-bold text-gray-700 leading-none text-center">立直</div>
                                        )}
                                        {res.action.type === 'ankan' && (
                                            <div className={`mt-1 text-[12px] font-bold leading-none text-center ${(res.action as any).riichi ? 'text-gray-700' : 'text-red-600'}`}>
                                                {(res.action as any).riichi ? '暗槓立直' : '暗槓'}
                                            </div>
                                        )}
                                        {res.action.type === 'kakan' && (
                                            <div className="mt-1 text-[12px] font-bold text-red-600 leading-none text-center">加カン</div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900 text-lg">
                                    <div className="flex flex-col">
                                        <div>
                                            {res.ev.toFixed(2)}
                                            <span className="text-[0.75em] text-gray-500 font-normal ml-1">
                                                ±{res.confidence95.toFixed(2)}
                                            </span>
                                        </div>
                                        {lossDisplay}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                    <div className="flex flex-col">
                                        <div>{(res.winRate * 100).toFixed(2)}%</div>
                                        {res.reachedDiff && res.averageAgariAfterTurns !== null && res.averageAgariAfterTurns !== undefined && (
                                            <div className="text-[0.8em] text-blue-500 font-medium">
                                                (平均 {res.averageAgariAfterTurns.toFixed(1)} 巡後)
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                    {Math.round(res.avgScore).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                    {(res.tenpaiRate * 100).toFixed(1)}%
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col">
                                        <div className="text-[13px] font-medium text-gray-700">
                                            {res.effectiveTileTypes}種{res.effectiveTileCount}枚
                                            {res.shantenAfter > res.shantenBefore && res.action.type === 'discard' && (
                                                <span className="ml-1 text-red-500 font-bold text-[11px]">
                                                    (向聴戻し)
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
