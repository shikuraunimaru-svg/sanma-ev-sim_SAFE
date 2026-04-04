/**
 * tableGenerator.worker.ts
 *
 * 【目的】
 * 和了率テーブル (winProbTable) を純粋な理論値（確率計算）により生成する。
 */

export function calcWinProb(t: number, k: number): number {
    const N = 68;
    let p = 1;
    for (let i = 0; i < t; i++) {
        p *= (1 - k / (N - i));
    }
    return 1 - p;
}

export function generateWinProbTableString(): string {
    const table: Record<number, Record<number, number>> = {};
    for (let t = 1; t <= 18; t++) {
        table[t] = {};
        for (let k = 1; k <= 14; k++) {
            table[t][k] = calcWinProb(t, k);
        }
    }

    const lines: string[] = [
        '// Auto-generated (Theoretical Calculation)',
        'export const winProbTable: Record<number, Record<number, number>> = {'
    ];
    for (const t of Object.keys(table).map(Number).sort((a, b) => a - b)) {
        lines.push(`  ${t}: {`);
        for (const k of Object.keys(table[t]).map(Number).sort((a, b) => a - b)) {
            lines.push(`    ${k}: ${table[t][k].toFixed(4)},`);
        }
        lines.push('  },');
    }
    lines.push('};');
    return lines.join('\n');
}
