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
exports.maxEndpointChangePctForPeriod = maxEndpointChangePctForPeriod;
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
/**
 * Soft ceiling on endpoint-to-endpoint |%| before path filtering.
 * Without this, the candidate pool fills with data-error cliffs (e.g. +100000%)
 * and gradual filtering rejects every gainer for 7d/30d windows.
 */
function maxEndpointChangePctForPeriod(days) {
    if (days <= 1)
        return 200;
    // Compound headroom under cliffPct with ~daily steps, hard-capped for sanity.
    const cliff = cliffPctForPeriod(days);
    const steps = Math.min(Math.max(days, minPointsForPeriod(days) - 1), 10);
    const compounded = (Math.pow(1 + cliff / 100, steps) - 1) * 100;
    return Math.min(compounded, 400);
}
