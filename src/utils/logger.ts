export const LOG_LEVEL = 1;

/*
0 = none
1 = important
2 = debug
3 = verbose
*/

export function logImportant(...args: any[]) {
    if (LOG_LEVEL >= 1) console.log(...args);
}

export function logDebug(...args: any[]) {
    if (LOG_LEVEL >= 2) console.log(...args);
}

export function logVerbose(...args: any[]) {
    if (LOG_LEVEL >= 3) console.log(...args);
}
