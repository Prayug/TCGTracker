"use strict";
/**
 * PriceCharting sold-guide is the slab quote.
 * Live BIN asks are context only — never mixed into the main number.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.lastSoldAgeDays = lastSoldAgeDays;
exports.blendSlabMarketMark = blendSlabMarketMark;
const STALE_SOLD_DAYS = 90;
function lastSoldAgeDays(lastSoldDate, now = new Date()) {
    if (!lastSoldDate)
        return null;
    const ms = new Date(`${lastSoldDate}T00:00:00Z`).getTime();
    if (!Number.isFinite(ms))
        return null;
    return Math.max(0, Math.round((now.getTime() - ms) / 86400000));
}
const roundMoney = (n) => Math.round(n * 100) / 100;
function blendSlabMarketMark(input) {
    var _a;
    const soldGuide = Number(input.soldGuide);
    const now = (_a = input.now) !== null && _a !== void 0 ? _a : new Date();
    const ageDays = lastSoldAgeDays(input.lastSoldDate, now);
    const staleSold = ageDays != null ? ageDays > STALE_SOLD_DAYS : false;
    const empty = (reason) => ({
        mark: Number.isFinite(soldGuide) && soldGuide > 0 ? roundMoney(soldGuide) : soldGuide,
        soldGuide,
        askWeight: 0,
        staleSold,
        lastSoldAgeDays: ageDays,
        listedPremiumPct: null,
        reason,
    });
    if (!Number.isFinite(soldGuide) || soldGuide <= 0) {
        return empty('invalid_sold');
    }
    const listedCount = Number(input.listedCount) || 0;
    const listedLow = Number(input.listedLow);
    const hasAsk = listedCount > 0 && Number.isFinite(listedLow) && listedLow > 0;
    const listedPremiumPct = hasAsk ? roundMoney(((listedLow - soldGuide) / soldGuide) * 100) : null;
    let reason;
    if (!hasAsk) {
        reason = staleSold ? 'sold_only_stale' : 'sold_only';
    }
    else {
        reason = staleSold ? 'sold_with_asks_stale' : 'sold_with_asks';
    }
    return {
        mark: roundMoney(soldGuide),
        soldGuide,
        askWeight: 0,
        staleSold,
        lastSoldAgeDays: ageDays,
        listedPremiumPct,
        reason,
    };
}
