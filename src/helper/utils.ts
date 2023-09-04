export function truncate(str: string, n: number, includeDots: boolean = false) {
    return ((str.length > n) ? str.substr(0, n - 1) : str) + (includeDots && str.length > n ? '...' : '');
}