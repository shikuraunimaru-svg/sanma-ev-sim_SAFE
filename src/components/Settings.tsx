type Props = {
    currentTurn: number;
    onTurnChange: (turn: number) => void;
    myKita: number;
    onMyKitaChange: (val: number) => void;
    otherKita: number;
    onOtherKitaChange: (val: number) => void;
};

export function Settings({
    currentTurn, onTurnChange,
    myKita, onMyKitaChange,
    otherKita, onOtherKitaChange
}: Props) {
    return (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg shadow-inner">
            <h3 className="text-lg font-bold text-gray-700">設定</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

                {/* My Kita */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">自分の抜き北 (0-4)</label>
                    <input
                        type="number"
                        min={0}
                        max={4}
                        value={myKita}
                        onChange={(e) => onMyKitaChange(Number(e.target.value))}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    />
                </div>

                {/* Other Kita */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">他家合計抜き北 (0-4)</label>
                    <input
                        type="number"
                        min={0}
                        max={4}
                        value={otherKita}
                        onChange={(e) => onOtherKitaChange(Number(e.target.value))}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                    />
                </div>

                {/* Dealer/Parent Removed */}
            </div>
        </div>
    );
}
