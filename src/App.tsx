import { useState, useRef, useEffect } from 'react';
import './custom.css';
import { HandInput } from './components/HandInput';
import { Settings } from './components/Settings';
import { ResultsTable } from './components/ResultsTable';
import { ResultHeader } from './components/ResultHeader';
import { TileDisplay } from './components/TileDisplay';
import { MentsuDisplay } from './components/MentsuDisplay';
import { type Tile, TILES } from './core/tile';
import type { Mentsu } from './core/shanten';
import { type SimulationConfig, type DiscardResult, evaluateWinningHand } from './simulation/engine';
import type { YakuResult } from './core/yaku';
import type { ScoreResult } from './core/score';
import { calculateShanten, getShantenBreakdown } from './core/shanten';

export default function App() {
  const [hand, setHand] = useState<Tile[]>([]);
  const [fixedMentsu, setFixedMentsu] = useState<Mentsu[]>([]);
  const [doraIndicators, setDoraIndicators] = useState<Tile[]>([]);
  const [currentTurn, setCurrentTurn] = useState(1);
  const [myKita, setMyKita] = useState(0);
  const [otherKita, setOtherKita] = useState(0);
  const [validationMode, setValidationMode] = useState(false);
  const [csvReport, setCsvReport] = useState<string | undefined>(undefined);

  const [isSimulating, setIsSimulating] = useState(false);
  const [results, setResults] = useState<DiscardResult[]>([]);
  const [simulationSummary, setSimulationSummary] = useState<any>(null); // Use any for summary for now
  const [winResult, setWinResult] = useState<{
    bestYaku: YakuResult;
    bestScore: ScoreResult;
    bestStructure: any; // Using any briefly to avoid complex type import for now
    allPatterns: { yaku: YakuResult; score: ScoreResult; structure: any }[];
  } | null>(null);
  const [isAgariMode, setIsAgariMode] = useState(false);

  const workerRef = useRef<Worker | null>(null);

  if (winResult) console.log("UI result:", winResult);

  useEffect(() => {
    if (!workerRef.current) {
      console.log("Creating worker (once)");
      workerRef.current = new Worker(new URL('./simulation/simulator.worker.ts', import.meta.url), {
        type: 'module'
      });
    }

    const worker = workerRef.current;
    console.log("Using worker instance:", worker);

    worker.onerror = (e: ErrorEvent) => {
      console.error("Worker runtime error:", e);
    };

    worker.onmessage = (e: MessageEvent) => {
      console.log("Main thread received:", e.data);
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
      console.log("Terminating worker");
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  const getMaxKitaTotal = (doraInds: Tile[]) => {
    return doraInds.includes(TILES.z4) ? 3 : 4;
  };

  const handleMyKitaChange = (val: number) => {
    const maxTotal = getMaxKitaTotal(doraIndicators);
    const safeVal = isNaN(val) ? 0 : Math.max(0, Math.min(maxTotal, Math.floor(val)));
    setMyKita(safeVal);
    if (safeVal + otherKita > maxTotal) {
      setOtherKita(maxTotal - safeVal);
    }
  };

  const handleOtherKitaChange = (val: number) => {
    const maxTotal = getMaxKitaTotal(doraIndicators);
    const safeVal = isNaN(val) ? 0 : Math.max(0, Math.min(maxTotal, Math.floor(val)));
    setOtherKita(safeVal);
    if (safeVal + myKita > maxTotal) {
      setMyKita(maxTotal - safeVal);
    }
  };

  useEffect(() => {
    const maxTotal = getMaxKitaTotal(doraIndicators);
    if (myKita + otherKita > maxTotal) {
      console.log(`Dora indicator changed to North. Correcting Kita total to ${maxTotal}`);
      if (myKita > maxTotal) {
        setMyKita(maxTotal);
        setOtherKita(0);
      } else {
        setOtherKita(maxTotal - myKita);
      }
    }
  }, [doraIndicators]);

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
    setIsAgariMode(false);

    const config: SimulationConfig = {
      myHand: hand,
      fixedMentsu: fixedMentsu,
      myDiscards: [], // TODO: Add input if needed
      doraIndicators,
      myKita,
      otherKita,
      trials: 5000,
      currentTurn,
      isDealer: true,
      validationMode
    };

    // Check if hand is already winning
    const shanten = calculateShanten(hand, fixedMentsu.length);
    if (shanten === -1) {
      const winData = evaluateWinningHand(hand, config);
      if (winData) {
        setWinResult(winData);
        const breakdown = getShantenBreakdown(hand, fixedMentsu.length);
        setSimulationSummary({
          remainingTiles: 108,
          shanten: {
            normal: breakdown.normal,
            chiitoi: breakdown.chiitoi,
            kokushi: breakdown.kokushi
          }
        });
        setIsAgariMode(true);
        setIsSimulating(false);
        return;
      }
    }

    console.log("Posting message to worker");
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'START_SIMULATION', config });
    }
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
          />
        </section>

        <section className="bg-white p-6 rounded-lg shadow">
          <Settings
            currentTurn={currentTurn}
            onTurnChange={setCurrentTurn}
            myKita={myKita}
            onMyKitaChange={handleMyKitaChange}
            otherKita={otherKita}
            onOtherKitaChange={handleOtherKitaChange}
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

            <ResultHeader
              hand={hand}
              fixedMentsu={fixedMentsu}
              doraIndicators={doraIndicators}
              kitaCount={myKita}
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
