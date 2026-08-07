"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestPrice = getLatestPrice;
exports.getPriceAtDate = getPriceAtDate;
exports.computeMovingAverages = computeMovingAverages;
exports.computePriceChanges = computePriceChanges;
exports.computeVolatility = computeVolatility;
exports.findSupportResistance = findSupportResistance;
exports.computeRecoveryMetrics = computeRecoveryMetrics;
exports.analyzeSimilarCards = analyzeSimilarCards;
exports.computeMarketBenchmark = computeMarketBenchmark;
exports.computeExcessReturn = computeExcessReturn;
function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function getLatestPrice(points) {
    var _a;
    if (points.length === 0)
        return null;
    const sorted = [...points].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return (_a = sorted[0].marketPrice) !== null && _a !== void 0 ? _a : sorted[0].price;
}
function getPriceAtDate(points, targetDate) {
    var _a;
    const target = formatDate(targetDate);
    const sorted = [...points].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const match = sorted.find(p => p.date <= target);
    if (match)
        return (_a = match.marketPrice) !== null && _a !== void 0 ? _a : match.price;
    return null;
}
/**
 * Calendar-window moving averages: averages the prices observed within the
 * trailing N calendar days (measured from the latest quote), not the last N
 * rows. Sparse series therefore get honest, date-correct averages.
 */
function computeMovingAverages(points) {
    const sorted = [...points]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map(p => { var _a; return ({ date: p.date.includes('T') ? p.date.split('T')[0] : p.date, price: (_a = p.marketPrice) !== null && _a !== void 0 ? _a : p.price }); })
        .filter(p => p.price > 0);
    if (sorted.length === 0)
        return { ma7: null, ma30: null, ma90: null };
    const lastDateMs = new Date(`${sorted[sorted.length - 1].date}T00:00:00Z`).getTime();
    const DAY_MS = 86400000;
    const maOverDays = (days) => {
        const cutoffMs = lastDateMs - (days - 1) * DAY_MS;
        const window = sorted.filter(p => new Date(`${p.date}T00:00:00Z`).getTime() >= cutoffMs);
        if (window.length === 0)
            return null;
        return window.reduce((a, b) => a + b.price, 0) / window.length;
    };
    return { ma7: maOverDays(7), ma30: maOverDays(30), ma90: maOverDays(90) };
}
function computePriceChanges(points) {
    const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const getChange = (days) => {
        var _a;
        const now = sorted[sorted.length - 1];
        if (!now)
            return null;
        const currentPrice = (_a = now.marketPrice) !== null && _a !== void 0 ? _a : now.price;
        if (!currentPrice || currentPrice <= 0)
            return null;
        const targetDate = new Date(now.date);
        targetDate.setDate(targetDate.getDate() - days);
        const target = getPriceAtDate(sorted, targetDate);
        if (!target || target <= 0)
            return null;
        return ((currentPrice - target) / target) * 100;
    };
    return {
        change7d: getChange(7),
        change30d: getChange(30),
        change90d: getChange(90),
        change180d: getChange(180),
        change1y: getChange(365),
    };
}
function computeVolatility(points, days = 30) {
    const sorted = [...points]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map(p => {
        var _a;
        return ({
            date: p.date.includes('T') ? p.date.split('T')[0] : p.date,
            price: (_a = p.marketPrice) !== null && _a !== void 0 ? _a : p.price,
        });
    })
        .filter(p => p.price > 0);
    if (sorted.length === 0) {
        return { dailyVolatility: 0.05, weeklyVolatility: 0.12, monthlyVolatility: 0.25 };
    }
    const lastDateMs = new Date(`${sorted[sorted.length - 1].date}T00:00:00Z`).getTime();
    const DAY_MS = 86400000;
    const cutoffMs = lastDateMs - (Math.max(days, 30) - 1) * DAY_MS;
    const recent = sorted.filter(p => new Date(`${p.date}T00:00:00Z`).getTime() >= cutoffMs);
    if (recent.length < 7) {
        // Return elevated uncertainty values instead of arbitrary defaults
        // This naturally penalizes sparse-data cards through risk scoring
        const dataRatio = recent.length / 7;
        const uncertaintyScale = 1 + (1 - dataRatio) * 2; // 1x-3x multiplier
        return {
            dailyVolatility: 0.05 * uncertaintyScale,
            weeklyVolatility: 0.12 * uncertaintyScale,
            monthlyVolatility: 0.25 * uncertaintyScale,
        };
    }
    // Day-over-day log returns, skipping gaps so sparse series don't get
    // inflated variance from multi-day moves.
    const logReturns = [];
    for (let i = 1; i < recent.length; i++) {
        const prev = recent[i - 1];
        const curr = recent[i];
        const gapDays = Math.max(1, Math.round((new Date(`${curr.date}T00:00:00Z`).getTime() - new Date(`${prev.date}T00:00:00Z`).getTime()) / DAY_MS));
        if (gapDays > 1) {
            // Normalize multi-day moves to an approximate per-day return.
            logReturns.push(Math.log(curr.price / prev.price) / Math.sqrt(gapDays));
        }
        else {
            logReturns.push(Math.log(curr.price / prev.price));
        }
    }
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / logReturns.length;
    const dailyVol = Math.sqrt(variance);
    return {
        dailyVolatility: dailyVol,
        weeklyVolatility: dailyVol * Math.sqrt(7),
        monthlyVolatility: dailyVol * Math.sqrt(30),
    };
}
function findSupportResistance(points) {
    const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const prices = sorted.map(p => { var _a; return (_a = p.marketPrice) !== null && _a !== void 0 ? _a : p.price; }).filter(p => p > 0);
    if (prices.length < 20)
        return { support: null, resistance: null };
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const supportIdx = Math.floor(sortedPrices.length * 0.1);
    const resistanceIdx = Math.floor(sortedPrices.length * 0.9);
    return {
        support: sortedPrices[supportIdx],
        resistance: sortedPrices[resistanceIdx],
    };
}
function computeRecoveryMetrics(points) {
    const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const prices = sorted.map(p => { var _a; return (_a = p.marketPrice) !== null && _a !== void 0 ? _a : p.price; }).filter(p => p > 0);
    if (prices.length < 14) {
        return { recentDrop: null, hasStabilized: false, daysSinceBottom: null, priorRecoveryPattern: false };
    }
    const currentPrice = prices[prices.length - 1];
    const recent90 = prices.slice(-Math.min(90, prices.length));
    let peak90 = recent90[0];
    for (const p of recent90) {
        if (p > peak90)
            peak90 = p;
    }
    const recentDrop = peak90 > 0 ? ((currentPrice - peak90) / peak90) * 100 : null;
    const recent30 = prices.slice(-30);
    const recent10 = prices.slice(-10);
    const avg10 = recent10.reduce((a, b) => a + b, 0) / recent10.length;
    const avg30 = recent30.reduce((a, b) => a + b, 0) / recent30.length;
    const hasStabilized = Math.abs(recent10[recent10.length - 1] - recent10[0]) / recent10[0] < 0.05;
    let minIdx = 0;
    let minVal = prices[0];
    const startIdx = Math.max(0, prices.length - 90);
    for (let i = startIdx; i < prices.length; i++) {
        if (prices[i] < minVal) {
            minVal = prices[i];
            minIdx = i;
        }
    }
    const daysSinceBottom = prices.length - 1 - minIdx;
    const priorDrops = [];
    for (let i = 0; i < prices.length - 60; i += 30) {
        const segment = prices.slice(i, i + 60);
        let segPeak = segment[0];
        let segTrough = segment[0];
        for (const p of segment) {
            if (p > segPeak)
                segPeak = p;
            if (p < segTrough)
                segTrough = p;
        }
        if (segPeak > 0) {
            const drop = ((segTrough - segPeak) / segPeak) * 100;
            if (drop < -10 && i + 60 <= prices.length) {
                const recoverEnd = prices[Math.min(i + 60, prices.length - 1)];
                const recoveryPct = ((recoverEnd - segTrough) / segTrough) * 100;
                priorDrops.push(recoveryPct);
            }
        }
    }
    const priorRecoveryPattern = priorDrops.length > 0 && priorDrops.some(r => r > 10);
    return { recentDrop, hasStabilized, daysSinceBottom, priorRecoveryPattern };
}
function analyzeSimilarCards(cardName, rarity, allCards) {
    const rarityMap = {
        'Rare Secret': ['Rare Secret', ' Rare Secret'],
        'Rare Ultra': ['Rare Ultra', ' Rare Ultra'],
        'Rare Holo': ['Rare Holo', ' Rare Holo', 'Rare Holo V', 'Rare Holo VMAX', 'Rare Holo VSTAR'],
        'Rare': ['Rare'],
        'Uncommon': ['Uncommon'],
        'Common': ['Common'],
        'Promo': ['Promo'],
    };
    const matchingRarities = rarityMap[rarity] || [rarity];
    const similar = allCards.filter(c => matchingRarities.includes(c.rarity) && c.avgReturn90d !== null);
    if (similar.length === 0)
        return { similarAvgReturn: null, sampleSize: 0 };
    const avgReturn = similar.reduce((a, b) => a + b.avgReturn90d, 0) / similar.length;
    return { similarAvgReturn: avgReturn, sampleSize: similar.length };
}
/**
 * Computes the market-wide average return over a given number of days.
 * This serves as a benchmark for comparing individual card predictions.
 * Returns are measured from the quote at (latest date - days) to the latest
 * quote, so sparse series contribute correct calendar-window returns.
 */
function computeMarketBenchmark(allPriceHistories, days = 90) {
    const returns = [];
    for (const history of allPriceHistories) {
        const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const prices = sorted.map(p => { var _a; return (_a = p.marketPrice) !== null && _a !== void 0 ? _a : p.price; }).filter(p => p > 0);
        if (prices.length < 2)
            continue;
        const currentPrice = prices[prices.length - 1];
        const currentDate = sorted[sorted.length - 1].date;
        const targetDate = new Date(currentDate);
        targetDate.setDate(targetDate.getDate() - days);
        const pastPrice = getPriceAtDate(sorted, targetDate);
        if (pastPrice && pastPrice > 0 && currentPrice > 0) {
            returns.push((currentPrice - pastPrice) / pastPrice);
        }
    }
    if (returns.length === 0) {
        return { avgReturn: 0, medianReturn: 0, returnStdDev: 0, sampleSize: 0 };
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const medianReturn = sortedReturns[Math.floor(sortedReturns.length / 2)];
    const variance = returns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / returns.length;
    const returnStdDev = Math.sqrt(variance);
    return { avgReturn, medianReturn, returnStdDev, sampleSize: returns.length };
}
/**
 * Computes excess return: how much a card's predicted return exceeds
 * the market benchmark. Positive = outperforming, negative = underperforming.
 */
function computeExcessReturn(predictedReturn, marketAvgReturn) {
    return predictedReturn - marketAvgReturn;
}
