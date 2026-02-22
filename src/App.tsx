import { useState, useRef, useEffect } from 'react';
import './custom.css';
import { HandInput } from './components/HandInput';
import { Settings } from './components/Settings';
import { ResultsTable } from './components/ResultsTable';
import { ResultHeader } from './components/ResultHeader';
import { TileDisplay } from './components/TileDisplay';
import { MentsuDisplay } from './components/MentsuDisplay';
import type { Tile } from './core/tile';
import type { Mentsu } from './core/shanten';
import type { SimulationConfig, DiscardResult } from './simulation/engine';
import type { YakuResult } from './core/yaku';
import type { ScoreResult } from './core/score';
import { countVisibleTiles } from './utils/tileCount';
import { TILES } from './core/tile';

export default function App() {
  const [hand, setHand] = useState<Tile[]>([]);
  const [fixedMentsu, setFixedMentsu] = useState<Mentsu[]>([]);
  const [doraIndicators, setDoraIndicators] = useState<Tile[]>([]);
  const [kitaCount, setKitaCount] = useState(0);
  const [trials, setTrials] = useState(5000);
  const [currentTurn, setCurrentTurn] = useState(1);
  const [isDealer, setIsDealer] = useState(false);
  const [validationMode, setValidationMode] = useState(false);
  const [csvReport, setCsvReport] = useState<string | undefined>(undefined);

  // Calculate used North tiles (excluding current kitaCount state)
  // Note: built-in countVisibleTiles adds state.kitaCount if tile is z4.
  // We pass 0 to get only "other" occurrences.
  const northInHandMeldsDora = countVisibleTiles(TILES.z4, {
    hand,
    fixedMentsu,
    doraIndicators,
    kitaCount: 0
  });

  // Max Kita is limited by visible Norths
  const maxKita = Math.max(0, 4 - northInHandMeldsDora);

  // Auto-clamp kitaCount if it exceeds max available
  useEffect(() => {
    if (kitaCount > maxKita) {
      setKitaCount(maxKita);
    }
  }, [maxKita, kitaCount]);

  const [isSimulating, setIsSimulating] = useState(false);
  const [results, setResults] = useState<DiscardResult[]>([]);
  const [simulationSummary, setSimulationSummary] = useState<any>(null); // Use any for summary for now
  const [winResult, setWinResult] = useState<{
    bestYaku: YakuResult;
    bestScore: ScoreResult;
    bestStructure: any; // Using any briefly to avoid complex type import for now
    allPatterns: { yaku: YakuResult; score: ScoreResult; structure: any }[];
  } | null>(null);

  const workerRef = useRef<Worker | null>(null);

  if (winResult) console.log("UI result:", winResult);

  useEffect(() => {
    workerRef.current = new Worker(new URL('./simulation/simulator.worker.ts', import.meta.url), {
      type: 'module'
    });

    workerRef.current.onmessage = (e) => {
      const { type, results: data, winResult: winData, summary, csvReport: report } = e.data;
      if (type === 'RESULT' && data) {
        setResults(data);
        setSimulationSummary(summary);
        setCsvReport(report);
        setWinResult(null);
        setIsSimulating(false);
      } else if (type === 'WIN' && winData) {
        setWinResult(winData);
        setSimulationSummary(summary);
        setResults([]);
        setCsvReport(undefined);
        setIsSimulating(false);
      } else if (type === 'PROGRESS') {
        // Optional: handle progress updates if passed
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const runSimulation = () => {
    if (!workerRef.current) return;
    if (hand.length % 3 !== 2) {
      alert("手牌の枚数が不正です。打牌可能な枚数（2, 5, 8, 11, 14枚）にしてください。");
      return;
    }

    setIsSimulating(true);
    setResults([]);
    setWinResult(null);
    setCsvReport(undefined);

    const config: SimulationConfig = {
      myHand: hand,
      fixedMentsu: fixedMentsu,
      myDiscards: [], // TODO: Add input if needed
      doraIndicators,
      kitaCount,
      trials,
      currentTurn,
      isDealer,
      validationMode
    };

    workerRef.current.postMessage({ type: 'START_SIMULATION', config });
  };

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🀄 三人麻雀・何切るEVシミュレーター</h1>
          <p className="mt-2 text-gray-600">手牌を入力し、モンテカルロ法で最適な打牌を算出します（門前攻撃特化）。</p>
        </header>

        <section className="bg-white p-6 rounded-lg shadow">
          <HandInput
            hand={hand}
            onChange={setHand}
            fixedMentsu={fixedMentsu}
            onFixedMentsuChange={setFixedMentsu}
            doraIndicators={doraIndicators}
            onDoraChange={setDoraIndicators}
            kitaCount={kitaCount}
          />
        </section>

        <section className="bg-white p-6 rounded-lg shadow">
          <Settings
            kitaCount={kitaCount}
            onKitaChange={(val) => setKitaCount(Math.min(val, maxKita))}
            trials={trials}
            onTrialsChange={setTrials}
            currentTurn={currentTurn}
            onTurnChange={setCurrentTurn}
            isDealer={isDealer}
            onDealerChange={setIsDealer}
            maxKita={maxKita}
            validationMode={validationMode}
            onValidationModeChange={setValidationMode}
          />
        </section>

        <div className="flex justify-center">
          <button
            onClick={runSimulation}
            disabled={isSimulating}
            className={`
              w-full sm:w-auto px-8 py-3 border border-transparent text-base font-medium rounded-md text-white 
              ${isSimulating ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-md transform hover:-translate-y-1 transition-all'}
            `}
          >
            {isSimulating ? '計算中...' : '解析開始'}
          </button>
        </div>

        {(results.length > 0 || winResult) && (
          <section className="bg-white p-6 rounded-lg shadow transition-opacity duration-500 ease-in-out">
            <h2 className="text-xl font-bold mb-4">解析結果</h2>

            {/* Input Summary */}
            <ResultHeader
              hand={hand}
              fixedMentsu={fixedMentsu}
              doraIndicators={doraIndicators}
              kitaCount={kitaCount}
              executionTurn={currentTurn}
              summary={simulationSummary}
            />

            {winResult ? (
              <div className="bg-yellow-50 border-2 border-yellow-200 p-6 rounded-lg">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">🎉</span>
                  <h3 className="text-xl font-bold text-yellow-800">和了しています！</h3>
                </div>

                {/* Winning Hand Visualization */}
                <div className="flex flex-nowrap gap-4 items-center mb-6 overflow-x-auto p-4 bg-white/50 rounded-lg border border-yellow-200">
                  <div className="flex flex-nowrap gap-[2px]">
                    {winResult.bestStructure.head !== -1 && (
                      <div className="flex gap-[2px] p-1 bg-white rounded border border-gray-200 shadow-sm">
                        <TileDisplay tile={winResult.bestStructure.head} size="result" />
                        <TileDisplay tile={winResult.bestStructure.head} size="result" />
                        <div className="text-[10px] text-gray-400 self-end ml-1">雀頭</div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-nowrap gap-2">
                    {winResult.bestStructure.mentsu.map((m: any, idx: number) => (
                      <MentsuDisplay key={`win-mentsu-${idx}`} mentsu={m} size="result" />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-bold text-yellow-900 mb-2 border-b border-yellow-200 pb-1">役一覧</h4>
                    <ul className="space-y-1">
                      {winResult.bestYaku.yakuList.map((y, idx) => (
                        <li key={idx} className="flex justify-between text-yellow-900">
                          <span>{y.name}</span>
                          <span className="font-mono">{y.han}翻</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-col justify-center bg-white p-4 rounded border border-yellow-100 shadow-sm">
                    <div className="text-sm text-gray-500 mb-1">
                      {winResult.bestYaku.han}翻 {winResult.bestYaku.fu}符
                    </div>
                    <div className="text-3xl font-black text-gray-900">
                      {winResult.bestScore.total.toLocaleString()}
                      <span className="text-lg ml-1 font-normal text-gray-600">点</span>
                    </div>
                    <div className="text-sm text-gray-600 mt-2">
                      {winResult.bestScore.details}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <ResultsTable results={results} />
            )}
          </section>
        )}
        {csvReport && (
          <div className="mt-4 text-center">
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvReport)}`}
              download={`sanma_sim_validation_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`}
              className="inline-block bg-green-600 text-white px-6 py-2 rounded shadow hover:bg-green-700 font-bold"
            >
              📥 検証レポート(CSV)をダウンロード
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
