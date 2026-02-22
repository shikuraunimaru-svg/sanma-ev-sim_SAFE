import type { YakuResult } from './yaku';

export type ScoreResult = {
    total: number; // Total points received
    ron?: number;  // Points if Ron
    tsumo?: {      // Points breakdown if Tsumo
        parent: number; // Payment from parent
        child?: number; // Payment from child
    };
    payments?: number[]; // Added for Sanma payment flexibility
    details: string; // Description text (e.g. "Mangan 8000")
};

export function calculatePoints(
    result: YakuResult,
    isParent: boolean,
    isTsumo: boolean
): ScoreResult {
    const yakumanMultiplier = result.yakumanMultiplier;

    // サンマ役満処理
    if (yakumanMultiplier && yakumanMultiplier > 0) {
        if (isParent) {
            if (isTsumo) {
                const payment = 16000 * yakumanMultiplier;
                return {
                    total: payment * 2,
                    payments: [payment, payment], // 2人払い
                    details: `役満 ${payment}オール`
                };
            } else {
                const total = 48000 * yakumanMultiplier;
                return {
                    total: total,
                    payments: [total],
                    details: `役満 ${total}`
                };
            }
        } else {
            if (isTsumo) {
                const parentPay = 16000 * yakumanMultiplier;
                const childPay = 8000 * yakumanMultiplier;
                return {
                    total: (8000 + 16000) * yakumanMultiplier,
                    payments: [childPay, parentPay],
                    details: `役満 ${childPay}-${parentPay}`
                };
            } else {
                const total = 32000 * yakumanMultiplier;
                return {
                    total: total,
                    payments: [total],
                    details: `役満 ${total}`
                };
            }
        }
    }

    // Normal calculation
    // Base Point = fu * 2^(han+2)
    let base = result.fu * Math.pow(2, result.han + 2);

    // Cap at Mangan
    // Mangan: Base 2000 (Child 8000 / Parent 12000)
    // Haneman: Base 3000
    // Baiman: Base 4000
    // Sanbaiman: Base 6000
    // Kazoe Yakuman (Handled above via yakumanMultiplier if han >= 13)

    let limitName = '';

    if (base > 2000) {
        if (result.han >= 11) { base = 6000; limitName = '三倍満'; }
        else if (result.han >= 8) { base = 4000; limitName = '倍満'; }
        else if (result.han >= 6) { base = 3000; limitName = '跳満'; }
        else { base = 2000; limitName = '満貫'; }
    } else if (result.han >= 5) {
        // Mangan forced if han >= 5 (and base wasn't high enough? usually it is)
        base = 2000;
        limitName = '満貫';
    }

    // Ceiling helper (round up to 100)
    const ceil100 = (n: number) => Math.ceil(n / 100) * 100;

    if (!isTsumo) {
        // Ron
        // Parent: base * 6
        // Child: base * 4
        const ronPoints = ceil100(base * (isParent ? 6 : 4));
        return {
            total: ronPoints,
            ron: ronPoints,
            details: limitName ? `${limitName} ${ronPoints}` : `${result.han}Han ${result.fu}Fu ${ronPoints}`
        };
    } else {
        // Tsumo
        if (isParent) {
            // Parent Tsumo: 2 * ceil(base * 2)
            const payment = ceil100(base * 2);
            const total = payment * 2;
            return {
                total,
                tsumo: { parent: 0, child: payment },
                details: limitName ? `${limitName} ${payment} all` : `${result.han}Han ${result.fu}Fu ${payment} all`
            };
        } else {
            // Child Tsumo
            // Parent pays ceil(base * 2)
            // Child pays ceil(base * 1)
            const parentPay = ceil100(base * 2);
            const childPay = ceil100(base);
            const total = parentPay + childPay;
            return {
                total,
                tsumo: { parent: parentPay, child: childPay },
                details: limitName ? `${limitName} ${childPay}-${parentPay}` : `${result.han}Han ${result.fu}Fu ${childPay}-${parentPay}`
            };
        }
    }
}
