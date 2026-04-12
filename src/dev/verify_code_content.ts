import * as fs from 'fs';
import * as path from 'path';

// simulator.worker.ts の内容を読み込んで、Node.js 環境で実行可能な形式に調整する
const workerPath = 'c:/Users/shiku/OneDrive/デスクトップ/sanma-ev-sim_SAFE/src/simulation/simulator.worker.ts';
const enginePath = 'c:/Users/shiku/OneDrive/デスクトップ/sanma-ev-sim_SAFE/src/simulation/engine.ts';

console.log("Implementation Check of simulator.worker.ts...");
const content = fs.readFileSync(workerPath, 'utf8');

// 基本的な構造チェック
const hasUCB = content.includes('Phase 1: UCB Search');
const hasRacing = content.includes('Phase 2: Top-3 CI Racing');
const hasComputeLocalCI = content.includes('function computeLocalCI');
const hasVarianceFormula = content.includes('(node.sumEV2 - node.visits * node.meanEV * node.meanEV) / (node.visits - 1)');

console.log("Check results:");
console.log("- UCB Search Phase present:", hasUCB);
console.log("- Top-3 CI Racing Phase present:", hasRacing);
console.log("- computeLocalCI present:", hasComputeLocalCI);
console.log("- Correct variance formula present:", hasVarianceFormula);

if (hasUCB && hasRacing && hasComputeLocalCI && hasVarianceFormula) {
    console.log("\nSUCCESS: All required logic components found in simulator.worker.ts.");
} else {
    console.log("\nFAILURE: Some components are missing.");
}
