"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGradedSpreadsForCard = getGradedSpreadsForCard;
exports.getTopGradedPremiums = getTopGradedPremiums;
exports.getPsa10SpreadsForCards = getPsa10SpreadsForCards;
exports.getTopPremiumMovers = getTopPremiumMovers;
exports.getCrossGraderArbs = getCrossGraderArbs;
const database_1 = require("../db/database");
const canonicalPriceService_1 = require("./canonicalPriceService");
const liquidityScore_1 = require("./liquidityScore");
const GRADED_STALE_HOURS = 12;
function ageHoursFromFetchedAt(fetchedAt) {
    if (!fetchedAt)
        return null;
    const ms = new Date(fetchedAt.endsWith('Z') ? fetchedAt : `${fetchedAt}Z`).getTime();
    if (!Number.isFinite(ms))
        return null;
    return Math.max(0, Math.round((Date.now() - ms) / 3600000));
}
function freshness(fetchedAt, verified) {
    const ageHours = ageHoursFromFetchedAt(fetchedAt);
    return {
        verified: verified == null ? undefined : Number(verified) === 1,
        ageHours,
        stale: ageHours != null ? ageHours >= GRADED_STALE_HOURS : undefined,
    };
}
/** Mirror of gradeWorthinessService Regular-floor fee (Value tiers paused). */
function estimatePsaFee(declaredValue) {
    const v = Math.max(0, Number(declaredValue) || 0);
    let baseFee;
    if (v <= 1499)
        baseFee = 79.99;
    else if (v <= 2999)
        baseFee = 149;
    else if (v <= 4999)
        baseFee = 299;
    else
        baseFee = 599;
    const insurance = v > 499 ? (v - 499) * 0.02 : 0;
    return Math.round((baseFee + insurance) * 100) / 100;
}
function withFeeNet(row) {
    if (row.rawPrice == null || !(row.rawPrice > 0) || !(row.gradedPrice > 0)) {
        return withLiquidity({ ...row, netAfterFee: null, gradingFee: null });
    }
    const gradingFee = estimatePsaFee(row.gradedPrice);
    return withLiquidity({
        ...row,
        gradingFee,
        netAfterFee: Math.round((row.gradedPrice - row.rawPrice - gradingFee) * 100) / 100,
    });
}
function withLiquidity(row) {
    const liq = (0, liquidityScore_1.scoreLiquidity)({
        soldListings: row.soldListings,
        verified: row.verified,
        stale: row.stale,
        ageHours: row.ageHours,
        matchScore: row.matchScore,
        historyPoints: row.historyPoints,
    });
    return {
        ...row,
        liquidityScore: liq.score,
        liquidityTier: liq.tier,
        liquidityLabel: liq.label,
    };
}
const all = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().all(sql, params, (err, rows) => {
        if (err)
            reject(err);
        else
            resolve((rows || []));
    });
});
/**
 * Graded vs raw market spreads for a card (PSA/CGC/BGS premiums).
 */
async function getGradedSpreadsForCard(cardId) {
    var _a, _b, _c, _d;
    const graded = await all(`SELECT cardId, cardName, setId, setName, grader, grade, price, soldListings, fetchedAt,
            COALESCE(verified, 0) AS verified
     FROM graded_prices
     WHERE cardId = ? AND price IS NOT NULL AND price > 0
     ORDER BY grader, CAST(grade AS REAL) DESC`, [cardId]);
    const canonical = await (0, canonicalPriceService_1.getLatestCanonicalPriceByCardId)(cardId);
    const rawPrice = (_a = canonical === null || canonical === void 0 ? void 0 : canonical.price) !== null && _a !== void 0 ? _a : null;
    const spreads = graded.map((g) => {
        var _a;
        const premium = rawPrice && rawPrice > 0 ? g.price - rawPrice : null;
        const premiumPct = rawPrice && rawPrice > 0 && premium !== null ? (premium / rawPrice) * 100 : null;
        const fresh = freshness(g.fetchedAt, g.verified);
        return withFeeNet({
            cardId: g.cardId,
            cardName: g.cardName,
            setId: g.setId,
            setName: g.setName,
            grader: g.grader,
            grade: g.grade,
            gradedPrice: g.price,
            rawPrice,
            premium,
            premiumPct,
            soldListings: (_a = g.soldListings) !== null && _a !== void 0 ? _a : 0,
            fetchedAt: g.fetchedAt,
            ...fresh,
        });
    });
    const psa10 = spreads.find((s) => s.grader.toUpperCase() === 'PSA' && String(s.grade) === '10');
    const bestPremiumPct = spreads.reduce((best, s) => {
        if (s.premiumPct == null)
            return best;
        if (best == null || s.premiumPct > best)
            return s.premiumPct;
        return best;
    }, null);
    return {
        cardId,
        cardName: (_c = (_b = graded[0]) === null || _b === void 0 ? void 0 : _b.cardName) !== null && _c !== void 0 ? _c : null,
        rawPrice,
        spreads,
        psa10PremiumPct: (_d = psa10 === null || psa10 === void 0 ? void 0 : psa10.premiumPct) !== null && _d !== void 0 ? _d : null,
        bestPremiumPct,
    };
}
/**
 * Top PSA 10 premiums across the graded_prices table (cards with raw quotes).
 */
async function getTopGradedPremiums(limit = 50, options) {
    const rows = await all(`SELECT
       gp.cardId, gp.cardName, gp.setId, gp.setName, gp.grader, gp.grade,
       gp.price AS gradedPrice, gp.soldListings, gp.fetchedAt,
       COALESCE(gp.verified, 0) AS verified,
       gp.matchScore,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
       ) AS historyPoints,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
         WHERE cm.cardId = gp.cardId
         ORDER BY c.date DESC LIMIT 1
       ) AS rawPrice
     FROM graded_prices gp
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND gp.price IS NOT NULL AND gp.price > 0
     ORDER BY gp.price DESC
     LIMIT ?`, [Math.min(limit * 4, 600)]);
    let mapped = rows
        .filter((r) => r.rawPrice && r.rawPrice > 0)
        .map((r) => {
        var _a;
        const premium = r.gradedPrice - r.rawPrice;
        const premiumPct = (premium / r.rawPrice) * 100;
        const fresh = freshness(r.fetchedAt, r.verified);
        return withFeeNet({
            cardId: r.cardId,
            cardName: r.cardName,
            setId: r.setId,
            setName: r.setName,
            grader: r.grader,
            grade: r.grade,
            gradedPrice: r.gradedPrice,
            rawPrice: r.rawPrice,
            premium,
            premiumPct,
            soldListings: (_a = r.soldListings) !== null && _a !== void 0 ? _a : 0,
            fetchedAt: r.fetchedAt,
            matchScore: r.matchScore,
            historyPoints: r.historyPoints,
            ...fresh,
        });
    })
        .sort((a, b) => { var _a, _b; return ((_a = b.premiumPct) !== null && _a !== void 0 ? _a : 0) - ((_b = a.premiumPct) !== null && _b !== void 0 ? _b : 0); });
    if (options === null || options === void 0 ? void 0 : options.tradeableOnly) {
        const tradeable = mapped.filter((r) => { var _a; return ((_a = r.liquidityScore) !== null && _a !== void 0 ? _a : 0) >= 45; });
        if (tradeable.length > 0)
            mapped = tradeable;
    }
    return mapped.slice(0, limit);
}
/**
 * PSA 10 spreads for a batch of card ids (watchlist / vault glue).
 */
async function getPsa10SpreadsForCards(cardIds) {
    const ids = [...new Set(cardIds.map((id) => String(id).trim()).filter(Boolean))].slice(0, 100);
    if (ids.length === 0)
        return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = await all(`SELECT
       gp.cardId, gp.cardName, gp.setId, gp.setName, gp.grader, gp.grade,
       gp.price AS gradedPrice, gp.soldListings, gp.fetchedAt,
       COALESCE(gp.verified, 0) AS verified,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
         WHERE cm.cardId = gp.cardId
         ORDER BY c.date DESC LIMIT 1
       ) AS rawPrice
     FROM graded_prices gp
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND gp.price IS NOT NULL AND gp.price > 0
       AND gp.cardId IN (${placeholders})`, ids);
    return rows.map((r) => {
        var _a;
        const rawPrice = r.rawPrice != null && r.rawPrice > 0 ? r.rawPrice : null;
        const premium = rawPrice != null ? r.gradedPrice - rawPrice : null;
        const premiumPct = rawPrice != null && premium != null ? (premium / rawPrice) * 100 : null;
        const fresh = freshness(r.fetchedAt, r.verified);
        return withFeeNet({
            cardId: r.cardId,
            cardName: r.cardName,
            setId: r.setId,
            setName: r.setName,
            grader: r.grader,
            grade: r.grade,
            gradedPrice: r.gradedPrice,
            rawPrice,
            premium,
            premiumPct,
            soldListings: (_a = r.soldListings) !== null && _a !== void 0 ? _a : 0,
            fetchedAt: r.fetchedAt,
            ...fresh,
        });
    });
}
/**
 * PSA 10 premium % change over `days` (graded history vs raw history).
 */
async function getTopPremiumMovers(options) {
    var _a, _b, _c;
    const days = Math.min(Math.max((_a = options === null || options === void 0 ? void 0 : options.days) !== null && _a !== void 0 ? _a : 30, 7), 90);
    const limit = Math.min(Math.max((_b = options === null || options === void 0 ? void 0 : options.limit) !== null && _b !== void 0 ? _b : 12, 1), 50);
    const lookback = `-${days} days`;
    const rows = await all(`SELECT
       gp.cardId,
       gp.cardName,
       gp.setId,
       gp.setName,
       gp.price AS gradedNow,
       COALESCE(gp.soldListings, 0) AS soldListings,
       gp.fetchedAt,
       COALESCE(gp.verified, 0) AS verified,
       gp.matchScore,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
       ) AS historyPoints,
       (
         SELECT gph.price
         FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId
           AND UPPER(gph.grader) = 'PSA'
           AND gph.grade = '10'
           AND gph.price IS NOT NULL AND gph.price > 0
           AND gph.date <= date('now', ?)
         ORDER BY gph.date DESC
         LIMIT 1
       ) AS gradedPrev,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
         WHERE cm.cardId = gp.cardId
         ORDER BY c.date DESC LIMIT 1
       ) AS rawNow,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
         WHERE cm.cardId = gp.cardId
           AND c.date <= date('now', ?)
         ORDER BY c.date DESC LIMIT 1
       ) AS rawPrev
     FROM graded_prices gp
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND gp.price IS NOT NULL AND gp.price > 0
       AND COALESCE(gp.verified, 0) = 1`, [lookback, lookback]);
    const movers = [];
    for (const r of rows) {
        if (!(r.rawNow && r.rawNow > 0) || !(r.rawPrev && r.rawPrev > 0))
            continue;
        if (!(r.gradedPrev && r.gradedPrev > 0))
            continue;
        const premiumPct = ((r.gradedNow - r.rawNow) / r.rawNow) * 100;
        const premiumPctPrev = ((r.gradedPrev - r.rawPrev) / r.rawPrev) * 100;
        const premiumPctDelta = premiumPct - premiumPctPrev;
        if (!Number.isFinite(premiumPctDelta) || Math.abs(premiumPctDelta) < 5)
            continue;
        const fresh = freshness(r.fetchedAt, r.verified);
        const liq = (0, liquidityScore_1.scoreLiquidity)({
            soldListings: r.soldListings,
            verified: fresh.verified === true,
            stale: fresh.stale === true,
            ageHours: fresh.ageHours,
            matchScore: r.matchScore,
            historyPoints: r.historyPoints,
        });
        movers.push({
            cardId: r.cardId,
            cardName: r.cardName,
            setId: r.setId,
            setName: r.setName,
            gradedPrice: r.gradedNow,
            rawPrice: r.rawNow,
            premiumPct,
            premiumPctPrev,
            premiumPctDelta,
            days,
            soldListings: (_c = r.soldListings) !== null && _c !== void 0 ? _c : 0,
            verified: fresh.verified === true,
            stale: fresh.stale === true,
            ageHours: fresh.ageHours,
            direction: premiumPctDelta >= 0 ? 'expanding' : 'compressing',
            liquidityScore: liq.score,
            liquidityTier: liq.tier,
            liquidityLabel: liq.label,
        });
    }
    movers.sort((a, b) => Math.abs(b.premiumPctDelta) - Math.abs(a.premiumPctDelta));
    return movers.slice(0, limit);
}
/**
 * PSA 10 vs CGC/BGS/SGC 10 price gaps on the same card.
 */
async function getCrossGraderArbs(limit = 12) {
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
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'CGC' AND g.grade = '10'
           AND g.price IS NOT NULL AND g.price > 0
         LIMIT 1
       ) AS cgc10,
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'CGC' AND lower(g.grade) LIKE '%pristine%'
           AND g.price IS NOT NULL AND g.price > 0
         LIMIT 1
       ) AS cgcPristine,
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'BGS' AND g.grade = '10'
           AND g.price IS NOT NULL AND g.price > 0
         LIMIT 1
       ) AS bgs10,
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'BGS' AND lower(g.grade) LIKE '%black%'
           AND g.price IS NOT NULL AND g.price > 0
         LIMIT 1
       ) AS bgsBlack,
       (
         SELECT g.price FROM graded_prices g
         WHERE g.cardId = psa.cardId AND UPPER(g.grader) = 'SGC' AND g.grade = '10'
           AND g.price IS NOT NULL AND g.price > 0
         LIMIT 1
       ) AS sgc10
     FROM graded_prices psa
     WHERE UPPER(psa.grader) = 'PSA' AND psa.grade = '10'
       AND psa.price IS NOT NULL AND psa.price > 0
       AND COALESCE(psa.verified, 0) = 1`);
    const arbs = [];
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
        if (alts.length === 0)
            continue;
        // Largest absolute gap vs PSA 10
        let best = alts[0];
        let bestAbs = Math.abs(r.psa10 - best.price);
        for (const alt of alts.slice(1)) {
            const abs = Math.abs(r.psa10 - alt.price);
            if (abs > bestAbs) {
                best = alt;
                bestAbs = abs;
            }
        }
        const spread = r.psa10 - best.price;
        const spreadPct = (spread / r.psa10) * 100;
        if (Math.abs(spreadPct) < 3)
            continue;
        const fresh = freshness(r.fetchedAt, r.verified);
        const liq = (0, liquidityScore_1.scoreLiquidity)({
            soldListings: r.soldListings,
            verified: fresh.verified === true,
            stale: fresh.stale === true,
            ageHours: fresh.ageHours,
            matchScore: r.matchScore,
            historyPoints: r.historyPoints,
        });
        arbs.push({
            cardId: r.cardId,
            cardName: r.cardName,
            setId: r.setId,
            setName: r.setName,
            psa10: r.psa10,
            altGrader: best.grader,
            altGrade: best.grade,
            altPrice: best.price,
            spread,
            spreadPct,
            soldListings: (_a = r.soldListings) !== null && _a !== void 0 ? _a : 0,
            verified: fresh.verified === true,
            stale: fresh.stale === true,
            ageHours: fresh.ageHours,
            liquidityScore: liq.score,
            liquidityTier: liq.tier,
            liquidityLabel: liq.label,
        });
    }
    arbs.sort((a, b) => Math.abs(b.spreadPct) - Math.abs(a.spreadPct));
    return arbs.slice(0, safeLimit);
}
