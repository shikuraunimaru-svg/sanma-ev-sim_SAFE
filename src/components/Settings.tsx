

type Props = {
    kitaCount: number;
    onKitaChange: (count: number) => void;
    trials: number;
    onTrialsChange: (count: number) => void;
    currentTurn: number;
    onTurnChange: (turn: number) => void;
    isDealer: boolean;
    onDealerChange: (isDealer: boolean) => void;
    maxKita: number;
};

export function Settings({
    kitaCount, onKitaChange,
    trials, onTrialsChange,
    currentTurn, onTurnChange,
    isDealer, onDealerChange,
    maxKita,
    validationMode, onValidationModeChange
}: Props & {
    validationMode: boolean;
    onValidationModeChange: (v: boolean) => void;
}) {
    return (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg shadow-inner">
            <h3 className="text-lg font-bold text-gray-700">設定</h3>

            <div className="grid grid-cols-2 gap-4">
                {/* Kita Count */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">抜き北の枚数</label>
                    <select
                        value={kitaCount}
                        onChange={(e) => onKitaChange(Number(e.target.value))}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    >
                        {[0, 1, 2, 3, 4].map(n => (
                            <option key={n} value={n} disabled={n > maxKita}>
                                {n}枚 {n > maxKita ? '(不可)' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {/* North In Wall Removed */}

                {/* Trials */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">試行回数 (Per Discard)</label>
                    <select
                        value={trials}
                        onChange={(e) => onTrialsChange(Number(e.target.value))}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    >
                        <option value={1000}>1,000回 (高速)</option>
                        <option value={5000}>5,000回 (推奨)</option>
                        <option value={10000}>10,000回 (高精度)</option>
                    </select>
                </div>

                {/* Current Turn */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">現在巡目 (1-17)</label>
                    <input
                        type="number"
                        min={1}
                        max={17}
                        value={currentTurn}
                        onChange={(e) => onTurnChange(Math.max(1, Math.min(17, Number(e.target.value))))}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    />
                </div>

                {/* Dealer/Parent */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">自家</label>
                    <div className="flex space-x-4 mt-2">
                        <label className="inline-flex items-center">
                            <input
                                type="radio"
                                className="form-radio"
                                checked={isDealer}
                                onChange={() => onDealerChange(true)}
                            />
                            <span className="ml-2">親 (Dealer)</span>
                        </label>
                        <label className="inline-flex items-center">
                            <input
                                type="radio"
                                className="form-radio"
                                checked={!isDealer}
                                onChange={() => onDealerChange(false)}
                            />
                            <span className="ml-2">子 (Non-Dealer)</span>
                        </label>
                    </div>
                </div>

                {/* Validation Mode */}
                <div className="col-span-2 mt-2 pt-4 border-t border-gray-200">
                    <label className="inline-flex items-center">
                        <input
                            type="checkbox"
                            checked={validationMode}
                            onChange={(e) => onValidationModeChange(e.target.checked)}
                            className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                        <span className="ml-2 text-sm font-medium text-gray-900">
                            検証モード (全候補5000回試行 + CSV出力)
                        </span>
                    </label>
                </div>
            </div>
        </div>
    );
}
