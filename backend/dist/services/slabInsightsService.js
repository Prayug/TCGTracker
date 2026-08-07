"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSubmitVsBuyLeaderboard = getSubmitVsBuyLeaderboard;
exports.getSubmitVsBuyForCard = getSubmitVsBuyForCard;
exports.getSetSlabHeatmap = getSetSlabHeatmap;
exports.getPopRegimeRadar = getPopRegimeRadar;
exports.getGradeLadderLeaderboard = getGradeLadderLeaderboard;
exports.getCrackRegradeScanner = getCrackRegradeScanner;
exports.snapshotPopulationHistory = snapshotPopulationHistory;
exports.getSlabMarksForLots = getSlabMarksForLots;
const database_1 = require("../db/database");
const gradeWorthinessService_1 = require("./gradeWorthinessService");
const liquidityScore_1 = require("./liquidityScore");
const setEra_1 = require("../utils/setEra");
const all = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().all(sql, params, (err, rows) => {
        if (err)
            reject(err);
        else
            resolve((rows || []));
    });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().get(sql, params, (err, row) => {
        if (err)
            reject(err);
        else
            resolve(row || null);
    });
});
const GRADED_STALE_HOURS = 12;
const DEFAULT_TURNAROUND_DAYS = 45;
const MARKETPLACE_FEE_PCT = 0; // PriceCharting mid — treat as cash ask
function ageHoursFromFetchedAt(fetchedAt) {
    if (!fetchedAt)
        return null;
    const ms = new Date(fetchedAt.endsWith('Z') ? fetchedAt : `${fetchedAt}Z`).getTime();
    if (!Number.isFinite(ms))
        return null;
    return Math.max(0, Math.round((Date.now() - ms) / 3600000));
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function recommendPath(input) {
    const { buyCost, submitEV, expectedCostPerGem } = input;
    const gemAdv = expectedCostPerGem != null && expectedCostPerGem > 0 ? buyCost - expectedCostPerGem : null;
    if (gemAdv != null && gemAdv > buyCost * 0.08 && submitEV > 0) {
        return {
            recommendation: 'submit',
            why: `Submit path ~$${round2(gemAdv)} cheaper per expected gem than buying the 10.`,
        };
    }
    if (gemAdv != null && gemAdv < -(buyCost * 0.05)) {
        return {
            recommendation: 'buy',
            why: `Buying the PSA 10 is cheaper than the expected cost to gem via submit.`,
        };
    }
    if (submitEV > buyCost * 0.05) {
        return {
            recommendation: 'submit',
            why: `Single-submission EV (+$${round2(submitEV)}) beats paying spot for a 10.`,
        };
    }
    if (submitEV < -20) {
        return {
            recommendation: 'buy',
            why: `Submit EV is negative (−$${round2(Math.abs(submitEV))}); buy the slab if you need a 10.`,
        };
    }
    return {
        recommendation: 'toss_up',
        why: 'Buy and submit paths are within noise — pick based on turnaround vs certainty.',
    };
}
async function getSubmitVsBuyLeaderboard(options) {
    var _a, _b, _c;
    const limit = Math.min(Math.max((_a = options === null || options === void 0 ? void 0 : options.limit) !== null && _a !== void 0 ? _a : 20, 1), 100);
    const cardIds = (_c = (_b = options === null || options === void 0 ? void 0 : options.cardIds) === null || _b === void 0 ? void 0 : _b.filter(Boolean)) !== null && _c !== void 0 ? _c : [];
    const params = [];
    let cardFilter = '';
    if (cardIds.length > 0) {
        cardFilter = `AND gp.cardId IN (${cardIds.map(() => '?').join(',')})`;
        params.push(...cardIds.slice(0, 200));
    }
    const rows = await all(`SELECT
       gp.cardId,
       gp.cardName,
       gp.setId,
       gp.setName,
       cm.imageSmall,
       gp.price AS psa10,
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = gp.cardId AND UPPER(g.grader) = 'PSA' AND g.grade = '9'
           AND g.price IS NOT NULL AND g.price > 0
         LIMIT 1
       ) AS psa9,
       COALESCE(gp.soldListings, 0) AS soldListings,
       gp.fetchedAt,
       COALESCE(gp.verified, 0) AS verified,
       gp.matchScore,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings m ON m.uniqueIdentifier = c.uniqueIdentifier
         WHERE m.cardId = gp.cardId
         ORDER BY c.date DESC LIMIT 1
       ) AS rawPrice,
       CAST(json_extract(pc.payload, '$.companies.psa.grade10') AS REAL) AS psa10Pop,
       CAST(json_extract(pc.payload, '$.companies.psa.grade9') AS REAL) AS psa9Pop,
       CAST(json_extract(pc.payload, '$.companies.psa.total') AS REAL) AS psaTotal,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
       ) AS historyPoints
     FROM graded_prices gp
     LEFT JOIN card_mappings cm ON cm.cardId = gp.cardId
     LEFT JOIN population_cache pc ON pc.cardId = gp.cardId
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND gp.price IS NOT NULL AND gp.price > 0
       AND COALESCE(gp.verified, 0) = 1
       ${cardFilter}
     GROUP BY gp.cardId`, params);
    const out = [];
    for (const r of rows) {
        if (!(r.rawPrice && r.rawPrice >= 5))
            continue;
        if (!(r.psaTotal && r.psaTotal >= 25 && r.psa10Pop != null && r.psa10Pop >= 0))
            continue;
        const gemRatePct = Math.min(100, Math.max(0, (r.psa10Pop / r.psaTotal) * 100));
        if (!(gemRatePct > 0))
            continue;
        const fee = (0, gradeWorthinessService_1.estimatePsaGradingFee)(r.psa10);
        const buyCost = round2(r.psa10 * (1 + MARKETPLACE_FEE_PCT / 100));
        const submitCost = round2(r.rawPrice + fee.fee);
        const psa9Fallback = r.psa9 && r.psa9 > 0
            ? r.psa9
            : Math.max(r.rawPrice, r.psa10 * 0.45);
        const pGem = gemRatePct / 100;
        const submitExpectedValue = round2(pGem * r.psa10 + (1 - pGem) * psa9Fallback);
        const submitEV = round2(submitExpectedValue - submitCost);
        const expectedCostPerGem = pGem > 0.02 ? round2(submitCost / pGem) : null;
        const gemPathAdvantage = expectedCostPerGem != null ? round2(buyCost - expectedCostPerGem) : null;
        const ageHours = ageHoursFromFetchedAt(r.fetchedAt);
        const stale = ageHours != null ? ageHours >= GRADED_STALE_HOURS : false;
        const liq = (0, liquidityScore_1.scoreLiquidity)({
            soldListings: r.soldListings,
            verified: true,
            stale,
            ageHours,
            matchScore: r.matchScore,
            historyPoints: r.historyPoints,
        });
        const { recommendation, why } = recommendPath({
            buyCost,
            submitEV,
            expectedCostPerGem,
        });
        // Prefer decisive edges for the leaderboard
        const edge = recommendation === 'toss_up'
            ? Math.abs(submitEV)
            : recommendation === 'submit'
                ? Math.max(submitEV, gemPathAdvantage !== null && gemPathAdvantage !== void 0 ? gemPathAdvantage : 0)
                : Math.max(-(gemPathAdvantage !== null && gemPathAdvantage !== void 0 ? gemPathAdvantage : 0), -submitEV);
        out.push({
            cardId: r.cardId,
            cardName: r.cardName,
            setId: r.setId,
            setName: r.setName,
            imageSmall: r.imageSmall,
            rawPrice: r.rawPrice,
            psa10Price: r.psa10,
            psa9Price: r.psa9,
            gemRatePct: round2(gemRatePct),
            psa10Pop: Math.round(r.psa10Pop),
            psaTotal: Math.round(r.psaTotal),
            gradingFee: fee.fee,
            gradingTier: fee.tier,
            buyCost,
            submitCost,
            submitExpectedValue,
            submitEV,
            expectedCostPerGem,
            gemPathAdvantage,
            turnaroundDays: DEFAULT_TURNAROUND_DAYS,
            recommendation,
            why,
            verified: true,
            stale,
            liquidityScore: liq.score,
            liquidityTier: liq.tier,
            // stash for sort
            ...{ _edge: edge },
        });
    }
    out.sort((a, b) => {
        var _a, _b;
        const ae = (_a = a._edge) !== null && _a !== void 0 ? _a : 0;
        const be = (_b = b._edge) !== null && _b !== void 0 ? _b : 0;
        return be - ae;
    });
    const cleaned = out.slice(0, limit).map((row) => {
        const { _edge: _, ...rest } = row;
        void _;
        return rest;
    });
    return {
        rows: cleaned,
        count: cleaned.length,
        assumptions: {
            turnaroundDays: DEFAULT_TURNAROUND_DAYS,
            marketplaceFeePct: MARKETPLACE_FEE_PCT,
            nonGemFallback: 'PSA 9 quote when available, else ~45% of PSA 10',
        },
    };
}
async function getSubmitVsBuyForCard(cardId) {
    var _a;
    const result = await getSubmitVsBuyLeaderboard({ limit: 1, cardIds: [cardId] });
    return (_a = result.rows[0]) !== null && _a !== void 0 ? _a : null;
}
function median(nums) {
    if (nums.length === 0)
        return null;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
async function getSetSlabHeatmap(options) {
    var _a, _b;
    const limit = Math.min(Math.max((_a = options === null || options === void 0 ? void 0 : options.limit) !== null && _a !== void 0 ? _a : 40, 1), 100);
    const minCards = Math.min(Math.max((_b = options === null || options === void 0 ? void 0 : options.minCards) !== null && _b !== void 0 ? _b : 3, 1), 50);
    const rows = await all(`SELECT
       gp.setId,
       gp.setName,
       ((gp.price - raw.price) / raw.price) * 100 AS premiumPct,
       CASE
         WHEN CAST(json_extract(pc.payload, '$.companies.psa.total') AS REAL) > 0
         THEN (
           CAST(json_extract(pc.payload, '$.companies.psa.grade10') AS REAL) * 100.0
           / CAST(json_extract(pc.payload, '$.companies.psa.total') AS REAL)
         )
         ELSE NULL
       END AS gemRatePct,
       gp.price AS psa10,
       raw.price AS rawPrice,
       CASE
         WHEN gprev.price IS NOT NULL AND rprev.price IS NOT NULL AND rprev.price > 0
         THEN ((gprev.price - rprev.price) / rprev.price) * 100
         ELSE NULL
       END AS premiumPctPrev
     FROM graded_prices gp
     INNER JOIN (
       SELECT cm.cardId AS cardId, c.price AS price
       FROM card_mappings cm
       INNER JOIN canonical_price_history c ON c.uniqueIdentifier = cm.uniqueIdentifier
       WHERE c.rowid = (
         SELECT c2.rowid FROM canonical_price_history c2
         WHERE c2.uniqueIdentifier = cm.uniqueIdentifier
         ORDER BY c2.date DESC LIMIT 1
       )
     ) raw ON raw.cardId = gp.cardId
     LEFT JOIN population_cache pc ON pc.cardId = gp.cardId
     LEFT JOIN graded_price_history gprev ON gprev.rowid = (
       SELECT gph.rowid FROM graded_price_history gph
       WHERE gph.cardId = gp.cardId AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
         AND gph.date <= date('now', '-30 days') AND gph.price > 0
       ORDER BY gph.date DESC LIMIT 1
     )
     LEFT JOIN (
       SELECT cm.cardId AS cardId, c.price AS price
       FROM card_mappings cm
       INNER JOIN canonical_price_history c ON c.uniqueIdentifier = cm.uniqueIdentifier
       WHERE c.rowid = (
         SELECT c2.rowid FROM canonical_price_history c2
         WHERE c2.uniqueIdentifier = cm.uniqueIdentifier
           AND c2.date <= date('now', '-30 days')
         ORDER BY c2.date DESC LIMIT 1
       )
     ) rprev ON rprev.cardId = gp.cardId
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND COALESCE(gp.verified, 0) = 1
       AND gp.price > 0 AND raw.price > 0
       AND gp.setName IS NOT NULL`);
    const bySet = new Map();
    for (const r of rows) {
        if (!Number.isFinite(r.premiumPct))
            continue;
        const key = r.setId || r.setName || '';
        if (!key)
            continue;
        let acc = bySet.get(key);
        if (!acc) {
            acc = {
                setId: r.setId || key,
                setName: r.setName || key,
                premiums: [],
                premiumsPrev: [],
                gems: [],
                psa10s: [],
                raws: [],
            };
            bySet.set(key, acc);
        }
        acc.premiums.push(r.premiumPct);
        if (r.premiumPctPrev != null && Number.isFinite(r.premiumPctPrev)) {
            acc.premiumsPrev.push(r.premiumPctPrev);
        }
        if (r.gemRatePct != null && Number.isFinite(r.gemRatePct))
            acc.gems.push(r.gemRatePct);
        acc.psa10s.push(r.psa10);
        acc.raws.push(r.rawPrice);
    }
    const setCounts = await all(`SELECT setId, setName, COUNT(*) AS n FROM card_mappings
     WHERE setId IS NOT NULL OR setName IS NOT NULL
     GROUP BY COALESCE(setId, setName)`);
    const countByKey = new Map();
    for (const s of setCounts) {
        countByKey.set(s.setId || s.setName || '', s.n);
    }
    const heatRows = [];
    for (const acc of bySet.values()) {
        if (acc.premiums.length < minCards)
            continue;
        const medianPremiumPct = median(acc.premiums);
        const medianPrev = median(acc.premiumsPrev);
        const premiumPctDelta30d = medianPrev != null ? round2(medianPremiumPct - medianPrev) : null;
        const medianGemRatePct = median(acc.gems);
        const setCardCount = countByKey.get(acc.setId) || countByKey.get(acc.setName) || 0;
        const coveragePct = setCardCount > 0
            ? round2((acc.premiums.length / setCardCount) * 100)
            : round2(Math.min(100, acc.premiums.length * 2));
        const era = (0, setEra_1.classifySetEra)({ id: acc.setId, name: acc.setName });
        const expandBoost = premiumPctDelta30d != null ? Math.max(0, premiumPctDelta30d) / 50 : 0;
        const scarcity = medianGemRatePct != null ? Math.max(0, 1 - medianGemRatePct / 50) : 0.3;
        const heatScore = round2(Math.min(100, (Math.log10(1 + Math.max(0, medianPremiumPct) / 100) * 40 +
            expandBoost * 25 +
            scarcity * 25 +
            Math.min(coveragePct, 40) * 0.25) *
            1.1));
        heatRows.push({
            setId: acc.setId,
            setName: acc.setName,
            era,
            eraLabel: (0, setEra_1.getEraLabel)(era),
            cardCount: acc.premiums.length,
            coveragePct,
            medianPremiumPct: round2(medianPremiumPct),
            medianPremiumPct30d: medianPrev != null ? round2(medianPrev) : null,
            premiumPctDelta30d,
            medianGemRatePct: medianGemRatePct != null ? round2(medianGemRatePct) : null,
            medianPsa10: round2(median(acc.psa10s)),
            medianRaw: round2(median(acc.raws)),
            heatScore,
        });
    }
    heatRows.sort((a, b) => b.heatScore - a.heatScore);
    const sliced = heatRows.slice(0, limit);
    return { rows: sliced, count: sliced.length };
}
async function getPopRegimeRadar(options) {
    var _a, _b;
    const days = Math.min(Math.max((_a = options === null || options === void 0 ? void 0 : options.days) !== null && _a !== void 0 ? _a : 30, 7), 90);
    const limit = Math.min(Math.max((_b = options === null || options === void 0 ? void 0 : options.limit) !== null && _b !== void 0 ? _b : 20, 1), 50);
    const lookback = `-${days} days`;
    const rows = await all(`SELECT
       ph.cardId,
       gp.cardName,
       gp.setId,
       gp.setName,
       ph.psa10 AS psa10Now,
       (
         SELECT h.psa10 FROM population_history h
         WHERE h.cardId = ph.cardId
           AND h.date <= date('now', ?)
           AND h.psa10 IS NOT NULL
         ORDER BY h.date DESC LIMIT 1
       ) AS psa10Prev,
       ph.psaTotal AS psaTotalNow,
       (
         SELECT h.psaTotal FROM population_history h
         WHERE h.cardId = ph.cardId
           AND h.date <= date('now', ?)
           AND h.psaTotal IS NOT NULL
         ORDER BY h.date DESC LIMIT 1
       ) AS psaTotalPrev,
       gp.price AS gradedNow,
       (
         SELECT gph.price FROM graded_price_history gph
         WHERE gph.cardId = ph.cardId AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.date <= date('now', ?)
         ORDER BY gph.date DESC LIMIT 1
       ) AS gradedPrev,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
         WHERE cm.cardId = ph.cardId
         ORDER BY c.date DESC LIMIT 1
       ) AS rawNow,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
         WHERE cm.cardId = ph.cardId AND c.date <= date('now', ?)
         ORDER BY c.date DESC LIMIT 1
       ) AS rawPrev
     FROM population_history ph
     LEFT JOIN graded_prices gp
       ON gp.cardId = ph.cardId AND UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
     WHERE ph.date = (SELECT MAX(date) FROM population_history h2 WHERE h2.cardId = ph.cardId)
       AND ph.psa10 IS NOT NULL AND ph.psa10 > 0`, [lookback, lookback, lookback, lookback]);
    const shocks = [];
    for (const r of rows) {
        if (!(r.psa10Prev && r.psa10Prev > 0))
            continue;
        const psa10Delta = r.psa10Now - r.psa10Prev;
        const psa10DeltaPct = (psa10Delta / r.psa10Prev) * 100;
        // Require meaningful absolute or % move
        if (Math.abs(psa10Delta) < 5 && Math.abs(psa10DeltaPct) < 8)
            continue;
        let premiumPct = null;
        let premiumPctDelta = null;
        if (r.gradedNow && r.rawNow && r.rawNow > 0) {
            premiumPct = ((r.gradedNow - r.rawNow) / r.rawNow) * 100;
        }
        if (r.gradedNow &&
            r.rawNow &&
            r.rawNow > 0 &&
            r.gradedPrev &&
            r.rawPrev &&
            r.rawPrev > 0) {
            const nowP = ((r.gradedNow - r.rawNow) / r.rawNow) * 100;
            const prevP = ((r.gradedPrev - r.rawPrev) / r.rawPrev) * 100;
            premiumPctDelta = nowP - prevP;
        }
        const direction = psa10Delta > 0 ? 'flooding' : 'tightening';
        let regime = 'neutral';
        let why = '';
        if (direction === 'flooding' && (premiumPctDelta !== null && premiumPctDelta !== void 0 ? premiumPctDelta : 0) < -3) {
            regime = 'scarcity_breaking';
            why = `PSA 10 pop +${round2(psa10DeltaPct)}% while premium compressed — scarcity thesis weakening.`;
        }
        else if (direction === 'tightening' && (premiumPctDelta !== null && premiumPctDelta !== void 0 ? premiumPctDelta : 0) > 3) {
            regime = 'scarcity_tightening';
            why = `PSA 10 pop ${round2(psa10DeltaPct)}% with expanding premium — scarcity tightening.`;
        }
        else if (direction === 'flooding') {
            why = `PSA 10 population up ${round2(psa10DeltaPct)}% (+${psa10Delta}) over ${days}d.`;
        }
        else {
            why = `PSA 10 population down ${round2(Math.abs(psa10DeltaPct))}% (${psa10Delta}) over ${days}d.`;
        }
        shocks.push({
            cardId: r.cardId,
            cardName: r.cardName,
            setId: r.setId,
            setName: r.setName,
            psa10Now: r.psa10Now,
            psa10Prev: r.psa10Prev,
            psa10Delta,
            psa10DeltaPct: round2(psa10DeltaPct),
            psaTotalNow: r.psaTotalNow,
            psaTotalPrev: r.psaTotalPrev,
            premiumPct: premiumPct != null ? round2(premiumPct) : null,
            premiumPctDelta: premiumPctDelta != null ? round2(premiumPctDelta) : null,
            days,
            direction,
            regime,
            why,
        });
    }
    shocks.sort((a, b) => Math.abs(b.psa10DeltaPct) - Math.abs(a.psa10DeltaPct));
    const sliced = shocks.slice(0, limit);
    return { rows: sliced, count: sliced.length, days };
}
async function getGradeLadderLeaderboard(options) {
    var _a, _b, _c;
    const limit = Math.min(Math.max((_a = options === null || options === void 0 ? void 0 : options.limit) !== null && _a !== void 0 ? _a : 15, 1), 50);
    const cardIds = (_c = (_b = options === null || options === void 0 ? void 0 : options.cardIds) === null || _b === void 0 ? void 0 : _b.filter(Boolean)) !== null && _c !== void 0 ? _c : [];
    const params = [];
    let cardFilter = '';
    if (cardIds.length > 0) {
        cardFilter = `AND gp.cardId IN (${cardIds.map(() => '?').join(',')})`;
        params.push(...cardIds.slice(0, 200));
    }
    const psa10Rows = await all(`SELECT
       gp.cardId,
       gp.cardName,
       gp.setId,
       gp.setName,
       gp.price AS psa10,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings m ON m.uniqueIdentifier = c.uniqueIdentifier
         WHERE m.cardId = gp.cardId
         ORDER BY c.date DESC LIMIT 1
       ) AS rawPrice,
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = gp.cardId AND UPPER(g.grader) = 'PSA' AND g.grade = '8'
           AND g.price > 0 LIMIT 1
       ) AS psa8,
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = gp.cardId AND UPPER(g.grader) = 'PSA' AND g.grade = '9'
           AND g.price > 0 LIMIT 1
       ) AS psa9,
       CAST(json_extract(pc.payload, '$.companies.psa.total') AS REAL) AS psaTotal,
       CAST(json_extract(pc.payload, '$.companies.psa.grade10') AS REAL) AS psa10Pop,
       CAST(json_extract(pc.payload, '$.companies.psa.grade9') AS REAL) AS psa9Pop,
       json_extract(pc.payload, '$.companies.psa.pop') AS psaPopJson
     FROM graded_prices gp
     LEFT JOIN population_cache pc ON pc.cardId = gp.cardId
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND COALESCE(gp.verified, 0) = 1
       AND gp.price > 0
       ${cardFilter}`, params);
    const out = [];
    for (const r of psa10Rows) {
        if (!(r.rawPrice && r.rawPrice >= 5))
            continue;
        if (!(r.psa9 && r.psa9 > 0))
            continue; // need ladder depth
        const rawPrice = r.rawPrice;
        const fee = (0, gradeWorthinessService_1.estimatePsaGradingFee)(r.psa10).fee;
        const gemRatePct = r.psaTotal && r.psaTotal > 0 && r.psa10Pop != null
            ? (r.psa10Pop / r.psaTotal) * 100
            : null;
        const premium10 = r.psa10 - rawPrice;
        const breakEvenGemRatePct = premium10 > 0 ? Math.min(100, (fee / premium10) * 100) : null;
        let pop = null;
        if (r.psaPopJson) {
            try {
                const parsed = JSON.parse(r.psaPopJson);
                if (Array.isArray(parsed))
                    pop = parsed.map(Number);
            }
            catch (_d) {
                pop = null;
            }
        }
        const gradeDefs = [
            { grade: 'raw', price: rawPrice, popIdx: null },
            { grade: '8', price: r.psa8, popIdx: 7 },
            { grade: '9', price: r.psa9, popIdx: 8 },
            { grade: '10', price: r.psa10, popIdx: 9 },
        ];
        const steps = gradeDefs.map((g) => {
            const popCount = g.popIdx != null && pop && pop[g.popIdx] != null ? pop[g.popIdx] : null;
            const popSharePct = popCount != null && r.psaTotal && r.psaTotal > 0
                ? round2((popCount / r.psaTotal) * 100)
                : g.grade === '10' && gemRatePct != null
                    ? round2(gemRatePct)
                    : g.grade === '9' && r.psa9Pop != null && r.psaTotal
                        ? round2((r.psa9Pop / r.psaTotal) * 100)
                        : null;
            return {
                grade: g.grade,
                price: g.price,
                premiumPct: g.price != null && g.grade !== 'raw'
                    ? round2(((g.price - rawPrice) / rawPrice) * 100)
                    : null,
                popSharePct,
                popCount,
            };
        });
        // Expected value under pop-implied distribution across priced grades 8/9/10;
        // residual mass treated as raw-equivalent.
        let expectedSlabValue = null;
        let expectedNet = null;
        const priced = steps.filter((s) => s.grade !== 'raw' && s.price != null);
        if (priced.length >= 2 && r.psaTotal && r.psaTotal > 0) {
            let mass = 0;
            let value = 0;
            for (const s of priced) {
                const share = s.popSharePct != null
                    ? s.popSharePct / 100
                    : s.grade === '10' && gemRatePct != null
                        ? gemRatePct / 100
                        : 0;
                mass += share;
                value += share * s.price;
            }
            const residual = Math.max(0, 1 - mass);
            value += residual * rawPrice;
            expectedSlabValue = round2(value);
            expectedNet = round2(value - rawPrice - fee);
        }
        // PSA 9 "mispriced" when 9 premium is high but gem rate is brutal
        // (you'd rather chase 10s on easier cards) OR 9 is close to 10 with high gem rate.
        let psa9Mispriced = false;
        let psa9MispriceNote = null;
        const prem9 = ((r.psa9 - rawPrice) / rawPrice) * 100;
        const prem10 = ((r.psa10 - rawPrice) / rawPrice) * 100;
        const nineToTenGap = prem10 - prem9;
        if (gemRatePct != null && gemRatePct < 12 && prem9 > 80 && nineToTenGap > 40) {
            psa9Mispriced = true;
            psa9MispriceNote =
                'Hard gem + fat 9 premium — “grade for a 9” can beat chasing 10s here.';
        }
        else if (gemRatePct != null && gemRatePct > 35 && nineToTenGap < 25 && prem9 > 40) {
            psa9Mispriced = true;
            psa9MispriceNote =
                'Easy gem but 9 sits close to 10 — 9s look rich vs gem upside.';
        }
        const why = psa9MispriceNote
            ? psa9MispriceNote
            : expectedNet != null && expectedNet > 0
                ? `Ladder EV +$${expectedNet} after fees under pop-weighted grades.`
                : 'Full PSA ladder with 8/9/10 quotes.';
        out.push({
            cardId: r.cardId,
            cardName: r.cardName,
            setId: r.setId,
            setName: r.setName,
            rawPrice: r.rawPrice,
            gradingFee: fee,
            steps,
            expectedSlabValue,
            expectedNet,
            psa9Mispriced,
            psa9MispriceNote,
            gemRatePct: gemRatePct != null ? round2(gemRatePct) : null,
            breakEvenGemRatePct: breakEvenGemRatePct != null ? round2(breakEvenGemRatePct) : null,
            why,
        });
    }
    out.sort((a, b) => {
        var _a, _b;
        if (a.psa9Mispriced !== b.psa9Mispriced)
            return a.psa9Mispriced ? -1 : 1;
        return ((_a = b.expectedNet) !== null && _a !== void 0 ? _a : -999) - ((_b = a.expectedNet) !== null && _b !== void 0 ? _b : -999);
    });
    const sliced = out.slice(0, limit);
    return { rows: sliced, count: sliced.length };
}
const CRACK_FRICTION = 15;
const CROSSOVER_RISK_PCT = 12; // haircut for not landing the same 10 at PSA
async function getCrackRegradeScanner(limit = 12) {
    var _a;
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const rows = await all(`SELECT
       psa.cardId,
       psa.cardName,
       psa.setId,
       psa.setName,
       psa.price AS psa10,
       COALESCE(psa.soldListings, 0) AS soldListings,
       psa.fetchedAt,
       COALESCE(psa.verified, 0) AS verified,
       psa.matchScore,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = psa.cardId AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
       ) AS historyPoints,
       (SELECT g.price FROM graded_prices g WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'CGC' AND g.grade = '10' AND g.price > 0 LIMIT 1) AS cgc10,
       (SELECT g.price FROM graded_prices g WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'CGC' AND lower(g.grade) LIKE '%pristine%' AND g.price > 0 LIMIT 1) AS cgcPristine,
       (SELECT g.price FROM graded_prices g WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'BGS' AND g.grade = '10' AND g.price > 0 LIMIT 1) AS bgs10,
       (SELECT g.price FROM graded_prices g WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'BGS' AND lower(g.grade) LIKE '%black%' AND g.price > 0 LIMIT 1) AS bgsBlack,
       (SELECT g.price FROM graded_prices g WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'SGC' AND g.grade = '10' AND g.price > 0 LIMIT 1) AS sgc10,
       (SELECT g.price FROM graded_prices g WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'TAG' AND g.grade = '10' AND g.price > 0 LIMIT 1) AS tag10,
       (SELECT g.price FROM graded_prices g WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'ACE' AND g.grade = '10' AND g.price > 0 LIMIT 1) AS ace10
     FROM graded_prices psa
     WHERE UPPER(psa.grader) = 'PSA' AND psa.grade = '10'
       AND psa.price > 0 AND COALESCE(psa.verified, 0) = 1`);
    const out = [];
    for (const r of rows) {
        const alts = [];
        if (r.cgc10 && r.cgc10 > 0)
            alts.push({ grader: 'CGC', grade: '10', price: r.cgc10 });
        if (r.cgcPristine && r.cgcPristine > 0) {
            alts.push({ grader: 'CGC', grade: '10 pristine', price: r.cgcPristine });
        }
        if (r.bgsBlack && r.bgsBlack > 0) {
            alts.push({ grader: 'BGS', grade: '10 black', price: r.bgsBlack });
        }
        else if (r.bgs10 && r.bgs10 > 0) {
            alts.push({ grader: 'BGS', grade: '10', price: r.bgs10 });
        }
        if (r.sgc10 && r.sgc10 > 0)
            alts.push({ grader: 'SGC', grade: '10', price: r.sgc10 });
        if (r.tag10 && r.tag10 > 0)
            alts.push({ grader: 'TAG', grade: '10', price: r.tag10 });
        if (r.ace10 && r.ace10 > 0)
            alts.push({ grader: 'ACE', grade: '10', price: r.ace10 });
        if (alts.length === 0)
            continue;
        // Prefer cheapest alt 10 that is meaningfully below PSA (crack candidate)
        const cheaper = alts.filter((a) => a.price < r.psa10 * 0.97);
        const pool = cheaper.length > 0 ? cheaper : alts;
        let best = pool[0];
        for (const alt of pool.slice(1)) {
            if (alt.price < best.price)
                best = alt;
        }
        const spread = r.psa10 - best.price;
        const spreadPct = (spread / r.psa10) * 100;
        if (Math.abs(spreadPct) < 3)
            continue;
        const resubmitFee = (0, gradeWorthinessService_1.estimatePsaGradingFee)(r.psa10).fee;
        const expectedPsa = r.psa10 * (1 - CROSSOVER_RISK_PCT / 100);
        const crackEV = round2(expectedPsa - best.price - resubmitFee - CRACK_FRICTION);
        let action;
        let why;
        if (crackEV > 25 && spread > 0) {
            action = 'crack_to_psa';
            why = `Crack ${best.grader} → PSA EV +$${crackEV} after fee, friction, and ${CROSSOVER_RISK_PCT}% crossover haircut.`;
        }
        else if (spread < 0) {
            action = 'buy_psa';
            why = `PSA 10 is cheaper than ${best.grader} — buy PSA directly.`;
        }
        else {
            action = 'hold_alt';
            why = `Gap doesn’t clear resubmit costs after risk — keep the ${best.grader} or pass.`;
        }
        const ageHours = ageHoursFromFetchedAt(r.fetchedAt);
        const stale = ageHours != null ? ageHours >= GRADED_STALE_HOURS : false;
        const liq = (0, liquidityScore_1.scoreLiquidity)({
            soldListings: r.soldListings,
            verified: true,
            stale,
            ageHours,
            matchScore: r.matchScore,
            historyPoints: r.historyPoints,
        });
        out.push({
            cardId: r.cardId,
            cardName: r.cardName,
            setId: r.setId,
            setName: r.setName,
            psa10: r.psa10,
            altGrader: best.grader,
            altGrade: best.grade,
            altPrice: best.price,
            spread: round2(spread),
            spreadPct: round2(spreadPct),
            resubmitFee,
            frictionCost: CRACK_FRICTION,
            crossoverRiskPct: CROSSOVER_RISK_PCT,
            crackEV,
            action,
            why,
            soldListings: (_a = r.soldListings) !== null && _a !== void 0 ? _a : 0,
            verified: true,
            stale,
            liquidityScore: liq.score,
            liquidityTier: liq.tier,
        });
    }
    out.sort((a, b) => b.crackEV - a.crackEV);
    const sliced = out.slice(0, safeLimit);
    return {
        rows: sliced,
        count: sliced.length,
        assumptions: { frictionCost: CRACK_FRICTION, crossoverRiskPct: CROSSOVER_RISK_PCT },
    };
}
/** Snapshot helpers used when population cache is written. */
async function snapshotPopulationHistory(input) {
    if (!input.cardId)
        return;
    await new Promise((resolve, reject) => {
        var _a, _b, _c, _d, _e, _f;
        (0, database_1.getDb)().run(`INSERT INTO population_history
        (cardId, date, psaTotal, psa10, psa9, cgcTotal, cgc10, verified, productId)
       VALUES (?, date('now'), ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cardId, date) DO UPDATE SET
         psaTotal = COALESCE(excluded.psaTotal, population_history.psaTotal),
         psa10 = COALESCE(excluded.psa10, population_history.psa10),
         psa9 = COALESCE(excluded.psa9, population_history.psa9),
         cgcTotal = COALESCE(excluded.cgcTotal, population_history.cgcTotal),
         cgc10 = COALESCE(excluded.cgc10, population_history.cgc10),
         verified = excluded.verified,
         productId = COALESCE(excluded.productId, population_history.productId)`, [
            input.cardId,
            (_a = input.psaTotal) !== null && _a !== void 0 ? _a : null,
            (_b = input.psa10) !== null && _b !== void 0 ? _b : null,
            (_c = input.psa9) !== null && _c !== void 0 ? _c : null,
            (_d = input.cgcTotal) !== null && _d !== void 0 ? _d : null,
            (_e = input.cgc10) !== null && _e !== void 0 ? _e : null,
            input.verified ? 1 : 0,
            (_f = input.productId) !== null && _f !== void 0 ? _f : null,
        ], (err) => (err ? reject(err) : resolve()));
    });
}
/** Mark-to-market helper for owned slab book (batch). */
async function getSlabMarksForLots(lots) {
    var _a, _b, _c, _d;
    const results = [];
    for (const lot of lots.slice(0, 100)) {
        const row = await get(`SELECT price, soldListings, fetchedAt, verified, matchScore
       FROM graded_prices
       WHERE cardId = ? AND UPPER(grader) = UPPER(?) AND lower(grade) = lower(?)
       LIMIT 1`, [lot.cardId, lot.grader, lot.grade]);
        const raw = await get(`SELECT c.price AS price FROM canonical_price_history c
       INNER JOIN card_mappings m ON m.uniqueIdentifier = c.uniqueIdentifier
       WHERE m.cardId = ?
       ORDER BY c.date DESC LIMIT 1`, [lot.cardId]);
        const hist = await get(`SELECT COUNT(DISTINCT date) AS n FROM graded_price_history
       WHERE cardId = ? AND UPPER(grader) = UPPER(?) AND lower(grade) = lower(?)`, [lot.cardId, lot.grader, lot.grade]);
        const ageHours = ageHoursFromFetchedAt(row === null || row === void 0 ? void 0 : row.fetchedAt);
        const stale = ageHours != null ? ageHours >= GRADED_STALE_HOURS : true;
        const liq = (0, liquidityScore_1.scoreLiquidity)({
            soldListings: row === null || row === void 0 ? void 0 : row.soldListings,
            verified: (row === null || row === void 0 ? void 0 : row.verified) === 1,
            stale,
            ageHours,
            matchScore: row === null || row === void 0 ? void 0 : row.matchScore,
            historyPoints: (_a = hist === null || hist === void 0 ? void 0 : hist.n) !== null && _a !== void 0 ? _a : 0,
        });
        const price = (_b = row === null || row === void 0 ? void 0 : row.price) !== null && _b !== void 0 ? _b : null;
        const rawPrice = (_c = raw === null || raw === void 0 ? void 0 : raw.price) !== null && _c !== void 0 ? _c : null;
        results.push({
            cardId: lot.cardId,
            grader: lot.grader,
            grade: lot.grade,
            price,
            rawPrice,
            premiumPct: price != null && rawPrice != null && rawPrice > 0
                ? round2(((price - rawPrice) / rawPrice) * 100)
                : null,
            verified: (row === null || row === void 0 ? void 0 : row.verified) === 1,
            stale,
            liquidityScore: liq.score,
            liquidityTier: liq.tier,
            soldListings: (_d = row === null || row === void 0 ? void 0 : row.soldListings) !== null && _d !== void 0 ? _d : 0,
        });
    }
    return results;
}
