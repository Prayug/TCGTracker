"use strict";
/**
 * Quality helpers for /top-movers — keep gradual market moves, drop data cliffs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOURCE_PRIORITY = void 0;
exports.sourceRank = sourceRank;
exports.pickPreferredSourceRow = pickPreferredSourceRow;
exports.isGradualMove = isGradualMove;
exports.cliffPctForPeriod = cliffPctForPeriod;
exports.minPointsForPeriod = minPointsForPeriod;
/** Prefer live TCGdex snapshots over catalog fallback / legacy tcgcsv. */
exports.SOURCE_PRIORITY = ['tcgdex', 'catalog_fallback', 'tcgcsv'];
function sourceRank(source) {
    const idx = exports.SOURCE_PRIORITY.indexOf(source);
    return idx === -1 ? exports.SOURCE_PRIORITY.length : idx;
}
/** Pick the highest-priority source row from a set sharing the same key. */
function pickPreferredSourceRow(rows) {
    if (rows.length === 0)
        return null;
    return [...rows].sort((a, b) => sourceRank(a.source) - sourceRank(b.source))[0];
}
/**
 * True when the series looks like a gradual move (no single discontinuous cliff).
 * Points are sorted by date; same-date duplicates keep the last price.
 */
function isGradualMove(points, { cliffPct, minPoints }) {
    if (!points.length)
        return false;
    const byDate = new Map();
    for (const p of points) {
        if (p.price <= 0)
            continue;
        byDate.set(p.date, p.price);
    }
    const sorted = [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, price]) => ({ date, price }));
    if (sorted.length < minPoints)
        return false;
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1].price;
        if (prev <= 0)
            return false;
        const stepPct = (Math.abs(sorted[i].price - prev) / prev) * 100;
        if (stepPct > cliffPct)
            return false;
    }
    return true;
}
function cliffPctForPeriod(days) {
    return days <= 1 ? 75 : 50;
}
function minPointsForPeriod(days) {
    return days <= 1 ? 2 : 3;
}
