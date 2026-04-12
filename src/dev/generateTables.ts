/**
 * generateTables.ts
 * 
 * Usage: npx tsx src/simulation/generateTables.ts
 * 
 * winProbTable.ts を src/data/ に生成する。
 */

import { generateWinProbTableString } from './tableGenerator.worker.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

console.log(`[TableGen] 開始: 理論値計算 (Theoretical Calculation)`);
console.time('[TableGen] 完了');

const winProbTs = generateWinProbTableString();

const outDir = join(process.cwd(), 'src', 'data');
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, 'winProbTable.ts'), winProbTs, 'utf-8');

console.timeEnd('[TableGen] 完了');
console.log('[TableGen] 出力: src/data/winProbTable.ts');
