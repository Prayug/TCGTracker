"use strict";
/**
 * Investment Opportunities — slab %-movers, similar-slab comps, buyout
 * detection, and aggregated opportunity scoring.
 *
 * Follows slabInsightsService / gradedSpreadService conventions: raw sqlite
 * all/get helpers, scoreLiquidity, ageHoursFromFetchedAt.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOVER_MIN_HISTORY_POINTS = exports.MOVER_MIN_PCT_MOVE = exports.MOVER_MIN_ABS_MOVE = exports.MOVER_MIN_PRICE = void 0;
exports.computeChange = computeChange;
exports.passesMoverThresholds = passesMoverThresholds;
exports.characterToken = characterToken;
exports.moveCorrelation = moveCorrelation;
exports.computeBuyoutScore = computeBuyoutScore;
exports.computeOpportunityScore = computeOpportunityScore;
exports.getSlabMovers = getSlabMovers;
exports.getSimilarSlabs = getSimilarSlabs;
exports.scanBuyoutCandidates = scanBuyoutCandidates;
exports.getOpportunities = getOpportunities;
exports.getExternalFactorsGlobal = getExternalFactorsGlobal;
const database_1 = require("../db/database");
const liquidityScore_1 = require("./liquidityScore");
const topMoversQuality_1 = require("./topMoversQuality");
const opportunityBulkScoring_1 = require("./opportunityBulkScoring");
const all = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().all(sql, params, (err, rows) => {
        if (err)
            reject(err);
        else
            resolve((rows || []));
    });
});
const GRADED_STALE_HOURS = 12;
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
function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}
// ---------------------------------------------------------------------------
// Pure math helpers (unit-tested)
// ---------------------------------------------------------------------------
exports.MOVER_MIN_PRICE = 20;
exports.MOVER_MIN_ABS_MOVE = 5;
exports.MOVER_MIN_PCT_MOVE = 8;
exports.MOVER_MIN_HISTORY_POINTS = 3;
function computeChange(current, prev) {
    const changeAbs = round2(current - prev);
    const changePct = prev > 0 ? round2(((current - prev) / prev) * 100) : 0;
    return { changeAbs, changePct };
}
/** Mover gate: min price $20, ≥3 history points, and $5 or 8% move. */
function passesMoverThresholds(input) {
    const { currentPrice, prevPrice, historyPoints } = input;
    if (!(currentPrice >= exports.MOVER_MIN_PRICE) || !(prevPrice > 0))
        return false;
    if (historyPoints < exports.MOVER_MIN_HISTORY_POINTS)
        return false;
    const { changeAbs, changePct } = computeChange(currentPrice, prevPrice);
    return Math.abs(changeAbs) >= exports.MOVER_MIN_ABS_MOVE || Math.abs(changePct) >= exports.MOVER_MIN_PCT_MOVE;
}
/**
 * First meaningful character token of a card name ("Charizard ex" → "charizard").
 * Used for character-mate comps across sets.
 */
function characterToken(cardName) {
    var _a;
    if (!cardName)
        return null;
    const STOP = new Set([
        'ex', 'gx', 'v', 'vmax', 'vstar', 'lv.x', 'star', 'prime', 'break',
        'dark', 'light', 'shining', 'shadow', 'radiant', 'galarian', 'alolan',
        'hisuian', 'paldean', 'mega', 'primal', 'team', 'the', 'of', '&',
    ]);
    const tokens = cardName
        .toLowerCase()
        .replace(/[^a-z0-9'\- ]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    for (const t of tokens) {
        if (!STOP.has(t) && t.length >= 3)
            return t;
    }
    return (_a = tokens[0]) !== null && _a !== void 0 ? _a : null;
}
/**
 * Pearson correlation + beta of aligned day-over-day % returns.
 * `avgMovePer5Pct` reads "when the anchor moved +5%, this comp moved +X%".
 * Returns null with <5 overlapping return observations.
 */
function moveCorrelation(anchor, comp) {
    const returnsByDate = (series) => {
        const sorted = [...series]
            .filter((p) => p.price > 0)
            .sort((a, b) => a.date.localeCompare(b.date));
        const map = new Map();
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1].price;
            if (prev > 0)
                map.set(sorted[i].date, ((sorted[i].price - prev) / prev) * 100);
        }
        return map;
    };
    const a = returnsByDate(anchor);
    const b = returnsByDate(comp);
    const xs = [];
    const ys = [];
    for (const [date, ra] of a) {
        const rb = b.get(date);
        if (rb != null) {
            xs.push(ra);
            ys.push(rb);
        }
    }
    const n = xs.length;
    if (n < 5)
        return null;
    const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    const mx = mean(xs);
    const my = mean(ys);
    let cov = 0;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < n; i++) {
        cov += (xs[i] - mx) * (ys[i] - my);
        vx += (xs[i] - mx) ** 2;
        vy += (ys[i] - my) ** 2;
    }
    if (vx === 0 || vy === 0)
        return null;
    const correlation = cov / Math.sqrt(vx * vy);
    const beta = cov / vx;
    return {
        correlation: round2(correlation),
        avgMovePer5Pct: round2(beta * 5),
        samples: n,
    };
}
/**
 * Buyout score 0–100 from stacked supply/demand signals.
 * Price spike is required context; the rest layer on top.
 */
function computeBuyoutScore(input) {
    const signals = [];
    let score = 0;
    // Price spike: 15% → ~15pts, 40%+ → 30pts.
    if (input.spikePct >= 15) {
        const pts = Math.round(clamp((input.spikePct / 40) * 30, 12, 30));
        score += pts;
        signals.push(`price_spike:+${round2(input.spikePct)}%`);
    }
    // Supply drain: measured drop in recorded listing counts. No baseline (or a
    // baseline too small to be meaningful) means no signal — never inferred.
    if (input.listedCount != null &&
        input.listedCountPrev != null &&
        input.listedCountPrev >= 3 &&
        input.spikePct >= 15) {
        const dropPct = ((input.listedCountPrev - input.listedCount) / input.listedCountPrev) * 100;
        if (dropPct >= 30) {
            const pts = Math.round(clamp((dropPct / 100) * 25, 10, 25));
            score += pts;
            signals.push(`supply_drain:${input.listedCountPrev}->${input.listedCount}_listed`);
        }
    }
    if (input.velocityRatio != null && input.velocityRatio >= 1.5) {
        score += 15;
        signals.push(`velocity:${round2(input.velocityRatio)}x_baseline`);
    }
    if (input.liquidityTier === 'thin' || input.liquidityTier === 'illiquid') {
        score += 10;
        signals.push(`thin_liquidity:${input.liquidityTier}`);
    }
    if (input.premiumPctDelta != null && input.premiumPctDelta > 5) {
        score += 10;
        signals.push(`premium_expansion:+${round2(input.premiumPctDelta)}pp`);
    }
    if (input.popDelta != null &&
        input.popDelta <= 0 &&
        input.premiumPctDelta != null &&
        input.premiumPctDelta > 0) {
        score += 10;
        signals.push('pop_tightening');
    }
    score = clamp(Math.round(score), 0, 100);
    let phase;
    if (input.spikePct >= 50 || (input.listedCount != null && input.listedCount <= 1)) {
        phase = 'late';
    }
    else if (score >= 55) {
        phase = 'active';
    }
    else {
        phase = 'early';
    }
    const why = phase === 'late'
        ? `Move looks mostly done (+${round2(input.spikePct)}%${input.listedCount != null ? `, ${input.listedCount} listed` : ''}) — chasing here is risky.`
        : phase === 'active'
            ? `Multiple buyout signals stacking (+${round2(input.spikePct)}% with ${signals.length} signals) — supply is being taken.`
            : `Early spike (+${round2(input.spikePct)}%) without full confirmation yet — watch supply.`;
    return { score, phase, signals, why };
}
/**
 * Weighted opportunity score:
 * 40% prediction (confidence-weighted) / 20% momentum / 20% buyout+undervaluation /
 * 10% external sentiment / 10% comp momentum.
 * Without a prediction (e.g. One Piece), weight shifts to momentum:
 * 40% momentum / 30% buyout+undervaluation / 15% sentiment / 15% comp momentum.
 */
function computeOpportunityScore(input) {
    var _a;
    // Each component normalized to 0–100 (50 = neutral).
    const momentumComponent = clamp(((input.momentumPct + 20) / 50) * 100, 0, 100);
    const underval = input.premiumVsSetMedian != null
        ? clamp(50 - input.premiumVsSetMedian / 2, 0, 100)
        : 50;
    const buyoutUnderComponent = 0.5 * clamp(input.buyoutScore, 0, 100) + 0.5 * underval;
    const sentimentComponent = input.netSentiment != null ? clamp(((clamp(input.netSentiment, -1, 1) + 1) / 2) * 100, 0, 100) : 50;
    const compComponent = input.compMomentumPct != null
        ? clamp(((input.compMomentumPct + 20) / 50) * 100, 0, 100)
        : 50;
    let score;
    if (input.predictedReturn90d != null) {
        const predRaw = clamp(((input.predictedReturn90d + 20) / 60) * 100, 0, 100);
        // Low confidence pulls the prediction toward neutral.
        const conf = clamp((_a = input.confidence) !== null && _a !== void 0 ? _a : 0, 0, 100) / 100;
        const predComponent = 50 + (predRaw - 50) * (0.35 + 0.65 * conf);
        score =
            0.4 * predComponent +
                0.2 * momentumComponent +
                0.2 * buyoutUnderComponent +
                0.1 * sentimentComponent +
                0.1 * compComponent;
    }
    else {
        score =
            0.4 * momentumComponent +
                0.3 * buyoutUnderComponent +
                0.15 * sentimentComponent +
                0.15 * compComponent;
    }
    const rounded = Math.round(clamp(score, 0, 100));
    const grade = rounded >= 75 ? 'strong_buy' : rounded >= 60 ? 'buy' : rounded >= 45 ? 'watch' : 'pass';
    return { score: rounded, grade };
}
async function queryMoverRows(days) {
    const lookback = `-${days} days`;
    return all(`SELECT
       gp.cardId,
       gp.cardName,
       gp.setId,
       gp.setName,
       cm.imageSmall,
       gp.price AS currentPrice,
       COALESCE(gp.soldListings, 0) AS soldListings,
       gp.fetchedAt,
       COALESCE(gp.verified, 0) AS verified,
       gp.matchScore,
       (
         SELECT gph.price FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.price > 0 AND gph.date <= date('now', ?)
         ORDER BY gph.date DESC LIMIT 1
       ) AS prevPrice,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.price > 0 AND gph.date >= date('now', ?)
       ) AS windowPoints,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
       ) AS historyPoints
     FROM graded_prices gp
     LEFT JOIN card_mappings cm ON cm.cardId = gp.cardId
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND gp.price IS NOT NULL AND gp.price >= ?
       AND COALESCE(gp.verified, 0) = 1
     GROUP BY gp.cardId`, [lookback, lookback, exports.MOVER_MIN_PRICE]);
}
function mapMoverRow(r, days) {
    var _a;
    const { changeAbs, changePct } = computeChange(r.currentPrice, r.prevPrice);
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
    return {
        cardId: r.cardId,
        cardName: r.cardName,
        setId: r.setId,
        setName: r.setName,
        imageSmall: r.imageSmall,
        currentPrice: round2(r.currentPrice),
        prevPrice: round2(r.prevPrice),
        changePct,
        changeAbs,
        days,
        soldListings: (_a = r.soldListings) !== null && _a !== void 0 ? _a : 0,
        liquidityScore: liq.score,
        liquidityTier: liq.tier,
        verified: true,
        stale,
        direction: changeAbs >= 0 ? 'up' : 'down',
    };
}
/** "Similar cards/slabs that have gone up" — verified PSA 10 %-change movers. */
async function getSlabMovers(options) {
    var _a, _b, _c;
    const days = [7, 30, 90].includes((_a = options === null || options === void 0 ? void 0 : options.days) !== null && _a !== void 0 ? _a : 7) ? ((_b = options === null || options === void 0 ? void 0 : options.days) !== null && _b !== void 0 ? _b : 7) : 7;
    const limit = clamp((_c = options === null || options === void 0 ? void 0 : options.limit) !== null && _c !== void 0 ? _c : 20, 1, 100);
    const endpointCap = (0, topMoversQuality_1.maxEndpointChangePctForPeriod)(days);
    const rows = await queryMoverRows(days);
    let movers = rows
        .filter((r) => {
        var _a, _b;
        return passesMoverThresholds({
            currentPrice: r.currentPrice,
            prevPrice: (_a = r.prevPrice) !== null && _a !== void 0 ? _a : 0,
            historyPoints: (_b = r.windowPoints) !== null && _b !== void 0 ? _b : 0,
        });
    })
        .map((r) => mapMoverRow(r, days))
        // Data-cliff ceiling: +12000% "moves" are match errors, not markets.
        .filter((m) => Math.abs(m.changePct) <= endpointCap);
    if (options === null || options === void 0 ? void 0 : options.direction) {
        movers = movers.filter((m) => m.direction === options.direction);
    }
    movers.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    // Path quality guard on the candidates that would make the cut: require a
    // gradual series (no single discontinuous cliff), same as /top-movers.
    // Scan deep — the biggest |%| candidates are often exactly the data cliffs.
    const out = [];
    const maxChecks = Math.min(movers.length, Math.max(limit * 4, 200));
    for (let i = 0; i < maxChecks && out.length < limit; i++) {
        const m = movers[i];
        const series = await fetchPsa10Series(m.cardId, days);
        const points = series.map((p) => ({ date: p.date, price: p.price }));
        if ((0, topMoversQuality_1.isGradualMove)(points, { cliffPct: 50, minPoints: exports.MOVER_MIN_HISTORY_POINTS })) {
            out.push(m);
        }
    }
    return { rows: out, count: out.length, days };
}
async function fetchPsa10Series(cardId, days) {
    return all(`SELECT date, price FROM graded_price_history
     WHERE cardId = ? AND UPPER(grader) = 'PSA' AND grade = '10'
       AND price > 0 AND date >= date('now', ?)
     ORDER BY date ASC`, [cardId, `-${days} days`]);
}
const COMP_SELECT = `
  SELECT
    gp.cardId,
    gp.cardName,
    gp.setId,
    gp.setName,
    cm.imageSmall,
    gp.grader,
    gp.grade,
    gp.price AS currentPrice,
    COALESCE(gp.soldListings, 0) AS soldListings,
    gp.fetchedAt,
    COALESCE(gp.verified, 0) AS verified,
    gp.matchScore,
    (
      SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
      WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = UPPER(gp.grader) AND gph.grade = gp.grade
    ) AS historyPoints,
    (
      SELECT gph.price FROM graded_price_history gph
      WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = UPPER(gp.grader) AND gph.grade = gp.grade
        AND gph.price > 0 AND gph.date <= date('now', '-7 days')
      ORDER BY gph.date DESC LIMIT 1
    ) AS prev7,
    (
      SELECT gph.price FROM graded_price_history gph
      WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = UPPER(gp.grader) AND gph.grade = gp.grade
        AND gph.price > 0 AND gph.date <= date('now', '-30 days')
      ORDER BY gph.date DESC LIMIT 1
    ) AS prev30,
    (
      SELECT c.price FROM canonical_price_history c
      INNER JOIN card_mappings m ON m.uniqueIdentifier = c.uniqueIdentifier
      WHERE m.cardId = gp.cardId
      ORDER BY c.date DESC, c.price DESC LIMIT 1
    ) AS rawPrice
  FROM graded_prices gp
  LEFT JOIN card_mappings cm ON cm.cardId = gp.cardId
`;
function mapComp(r, compClass, anchorSeries, compSeries) {
    var _a, _b;
    const ageHours = ageHoursFromFetchedAt(r.fetchedAt);
    const stale = ageHours != null ? ageHours >= GRADED_STALE_HOURS : false;
    const liq = (0, liquidityScore_1.scoreLiquidity)({
        soldListings: r.soldListings,
        verified: r.verified === 1,
        stale,
        ageHours,
        matchScore: r.matchScore,
        historyPoints: r.historyPoints,
    });
    const corr = anchorSeries && compSeries ? moveCorrelation(anchorSeries, compSeries) : null;
    return {
        compClass,
        cardId: r.cardId,
        cardName: r.cardName,
        setId: r.setId,
        setName: r.setName,
        imageSmall: r.imageSmall,
        grader: r.grader,
        grade: r.grade,
        currentPrice: round2(r.currentPrice),
        change7dPct: r.prev7 && r.prev7 > 0 ? computeChange(r.currentPrice, r.prev7).changePct : null,
        change30dPct: r.prev30 && r.prev30 > 0 ? computeChange(r.currentPrice, r.prev30).changePct : null,
        premiumPct: r.rawPrice && r.rawPrice > 0
            ? round2(((r.currentPrice - r.rawPrice) / r.rawPrice) * 100)
            : null,
        correlation: (_a = corr === null || corr === void 0 ? void 0 : corr.correlation) !== null && _a !== void 0 ? _a : null,
        avgMovePer5Pct: (_b = corr === null || corr === void 0 ? void 0 : corr.avgMovePer5Pct) !== null && _b !== void 0 ? _b : null,
        liquidityScore: liq.score,
        liquidityTier: liq.tier,
        verified: r.verified === 1,
    };
}
/** "Other types of similar slabs" — alt grades, set-mates, character-mates per anchor. */
async function getSimilarSlabs(options) {
    var _a, _b, _c;
    const days = clamp((_a = options.days) !== null && _a !== void 0 ? _a : 30, 7, 90);
    const perClassLimit = clamp((_b = options.limit) !== null && _b !== void 0 ? _b : 6, 1, 20);
    const anchorIds = [
        ...new Set(((_c = options.cardIds) !== null && _c !== void 0 ? _c : (options.cardId ? [options.cardId] : []))
            .map((id) => String(id).trim())
            .filter(Boolean)),
    ].slice(0, 8);
    if (anchorIds.length === 0)
        return { groups: [], count: 0, days };
    const groups = [];
    const anchorSet = new Set(anchorIds);
    for (const anchorId of anchorIds) {
        const anchorInfo = await all(`SELECT cm.cardId, cm.cardName, cm.matchName, cm.setId, cm.setName, cm.imageSmall, cm.rarity,
              (
                SELECT g.price FROM graded_prices g
                WHERE g.cardId = cm.cardId AND UPPER(g.grader) = 'PSA' AND g.grade = '10'
                  AND g.price > 0
                LIMIT 1
              ) AS psa10Price
       FROM card_mappings cm WHERE cm.cardId = ? LIMIT 1`, [anchorId]);
        const anchor = anchorInfo[0];
        if (!anchor)
            continue;
        const anchorSeries = await fetchPsa10Series(anchorId, days);
        const hasAnchorSeries = anchorSeries.length >= 6;
        // 1. Same card, alt grader/grade
        const altRows = await all(`${COMP_SELECT}
       WHERE gp.cardId = ? AND gp.price > 0
         AND NOT (UPPER(gp.grader) = 'PSA' AND gp.grade = '10')
       ORDER BY gp.grader, CAST(gp.grade AS REAL) DESC
       LIMIT ?`, [anchorId, perClassLimit]);
        const altGrades = altRows.map((r) => mapComp(r, 'alt_grade', null, null));
        // 2. Set-mates (same set + rarity)
        const setRows = anchor.setName
            ? await all(`${COMP_SELECT}
           WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
             AND gp.price > 0 AND COALESCE(gp.verified, 0) = 1
             AND gp.cardId != ?
             AND cm.setName = ?
             AND (? IS NULL OR cm.rarity = ?)
           GROUP BY gp.cardId
           LIMIT ?`, [anchorId, anchor.setName, anchor.rarity, anchor.rarity, perClassLimit * 3])
            : [];
        // 3. Character-mates (name token overlap, both directions by shared token)
        const token = characterToken(anchor.matchName || anchor.cardName);
        const charRows = token
            ? await all(`${COMP_SELECT}
           WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
             AND gp.price > 0 AND COALESCE(gp.verified, 0) = 1
             AND gp.cardId != ?
             AND (
               LOWER(gp.cardName) LIKE '%' || ? || '%'
               OR LOWER(IFNULL(cm.matchName, '')) LIKE '%' || ? || '%'
             )
           GROUP BY gp.cardId
           LIMIT ?`, [anchorId, token, token, perClassLimit * 3])
            : [];
        const buildComps = async (rows, compClass, exclude) => {
            const deduped = rows.filter((r) => !anchorSet.has(r.cardId) && !exclude.has(r.cardId));
            // Rank by |30d move| so the most correlated-looking movers surface first.
            deduped.sort((a, b) => {
                const am = a.prev30 && a.prev30 > 0 ? Math.abs((a.currentPrice - a.prev30) / a.prev30) : 0;
                const bm = b.prev30 && b.prev30 > 0 ? Math.abs((b.currentPrice - b.prev30) / b.prev30) : 0;
                return bm - am;
            });
            const top = deduped.slice(0, perClassLimit);
            const out = [];
            for (const r of top) {
                const compSeries = hasAnchorSeries ? await fetchPsa10Series(r.cardId, days) : null;
                out.push(mapComp(r, compClass, hasAnchorSeries ? anchorSeries : null, compSeries));
            }
            return out;
        };
        const setMates = await buildComps(setRows, 'set_mate', new Set());
        const setMateIds = new Set(setMates.map((c) => c.cardId));
        const characterMates = await buildComps(charRows, 'character_mate', setMateIds);
        groups.push({ anchor, altGrades, setMates, characterMates });
    }
    return { groups, count: groups.length, days };
}
const SUPPLY_NOTE = 'Supply drain is measured from recorded listing-count history; cards without a recorded baseline get no supply signal.';
/** "Potential buyouts of a type of slabs" — spike + supply + velocity signals. */
async function scanBuyoutCandidates(options) {
    var _a, _b, _c, _d, _e;
    const days = clamp((_a = options === null || options === void 0 ? void 0 : options.days) !== null && _a !== void 0 ? _a : 14, 7, 60);
    const limit = clamp((_b = options === null || options === void 0 ? void 0 : options.limit) !== null && _b !== void 0 ? _b : 12, 1, 50);
    const lookback = `-${days} days`;
    const rows = await all(`SELECT
       gp.cardId,
       gp.cardName,
       gp.setId,
       gp.setName,
       cm.imageSmall,
       gp.price AS currentPrice,
       COALESCE(gp.soldListings, 0) AS soldListings,
       gp.listedCount,
       (
         SELECT gph.listedCount FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.listedCount IS NOT NULL AND gph.date <= date('now', ?)
         ORDER BY gph.date DESC LIMIT 1
       ) AS listedCountPrev,
       gp.listedLow,
       gp.fetchedAt,
       gp.matchScore,
       (
         SELECT COUNT(DISTINCT gph.date) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
       ) AS historyPoints,
       (
         SELECT gph.price FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.price > 0 AND gph.date <= date('now', ?)
         ORDER BY gph.date DESC LIMIT 1
       ) AS prevPrice,
       (
         SELECT AVG(gph.soldListings) FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.date >= date('now', '-60 days') AND gph.date <= date('now', '-7 days')
       ) AS baselineSold,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings m ON m.uniqueIdentifier = c.uniqueIdentifier
         WHERE m.cardId = gp.cardId
         ORDER BY c.date DESC, c.price DESC LIMIT 1
       ) AS rawNow,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings m ON m.uniqueIdentifier = c.uniqueIdentifier
         WHERE m.cardId = gp.cardId AND c.date <= date('now', ?)
         ORDER BY c.date DESC, c.price DESC LIMIT 1
       ) AS rawPrev,
       (
         SELECT gph.price FROM graded_price_history gph
         WHERE gph.cardId = gp.cardId AND COALESCE(gph.variantKey, 'normal') = COALESCE(gp.variantKey, 'normal') AND UPPER(gph.grader) = 'PSA' AND gph.grade = '10'
           AND gph.price > 0 AND gph.date <= date('now', ?)
         ORDER BY gph.date DESC LIMIT 1
       ) AS gradedPrev,
       (
         SELECT h.psa10 FROM population_history h
         WHERE h.cardId = gp.cardId AND h.psa10 IS NOT NULL
         ORDER BY h.date DESC LIMIT 1
       ) AS psa10PopNow,
       (
         SELECT h.psa10 FROM population_history h
         WHERE h.cardId = gp.cardId AND h.psa10 IS NOT NULL AND h.date <= date('now', ?)
         ORDER BY h.date DESC LIMIT 1
       ) AS psa10PopPrev
     FROM graded_prices gp
     LEFT JOIN card_mappings cm ON cm.cardId = gp.cardId
     WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND gp.price IS NOT NULL AND gp.price >= ?
       AND COALESCE(gp.verified, 0) = 1
     GROUP BY gp.cardId`, [lookback, lookback, lookback, lookback, lookback, exports.MOVER_MIN_PRICE]);
    const endpointCap = (0, topMoversQuality_1.maxEndpointChangePctForPeriod)(days);
    const candidates = [];
    for (const r of rows) {
        if (!(r.prevPrice && r.prevPrice > 0))
            continue;
        const { changePct } = computeChange(r.currentPrice, r.prevPrice);
        if (changePct < 15 || changePct > endpointCap)
            continue;
        // Quality guard (topMoversQuality): require a gradual path, not a data cliff.
        const series = await fetchPsa10Series(r.cardId, days);
        const points = series.map((p) => ({ date: p.date, price: p.price }));
        if (!(0, topMoversQuality_1.isGradualMove)(points, { cliffPct: 50, minPoints: 3 }))
            continue;
        const velocityRatio = r.baselineSold && r.baselineSold > 0 ? round2(r.soldListings / r.baselineSold) : null;
        let premiumPctDelta = null;
        if (r.rawNow && r.rawNow > 0 && r.gradedPrev && r.rawPrev && r.rawPrev > 0) {
            const nowP = ((r.currentPrice - r.rawNow) / r.rawNow) * 100;
            const prevP = ((r.gradedPrev - r.rawPrev) / r.rawPrev) * 100;
            premiumPctDelta = round2(nowP - prevP);
        }
        const popDelta = r.psa10PopNow != null && r.psa10PopPrev != null ? r.psa10PopNow - r.psa10PopPrev : null;
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
        const scored = computeBuyoutScore({
            spikePct: changePct,
            listedCount: r.listedCount,
            listedCountPrev: r.listedCountPrev,
            velocityRatio,
            liquidityTier: liq.tier,
            premiumPctDelta,
            popDelta,
        });
        candidates.push({
            cardId: r.cardId,
            cardName: r.cardName,
            setId: r.setId,
            setName: r.setName,
            imageSmall: r.imageSmall,
            currentPrice: round2(r.currentPrice),
            prevPrice: round2(r.prevPrice),
            changePct,
            days,
            listedCount: r.listedCount,
            listedCountPrev: r.listedCountPrev,
            listedLow: r.listedLow,
            soldListings: (_c = r.soldListings) !== null && _c !== void 0 ? _c : 0,
            velocityRatio,
            premiumPctDelta,
            popDelta,
            liquidityScore: liq.score,
            liquidityTier: liq.tier,
            buyoutScore: scored.score,
            phase: scored.phase,
            signals: scored.signals,
            why: scored.why,
            ripples: [],
            supplyNote: SUPPLY_NOTE,
        });
    }
    // Shallow-history fallback: when the lookback predates graded_price_history
    // coverage, retry on a 7d window so the scanner isn't empty for new installs.
    if (candidates.length === 0 && days > 7) {
        return scanBuyoutCandidates({ days: 7, limit });
    }
    candidates.sort((a, b) => b.buyoutScore - a.buyoutScore);
    const top = candidates.slice(0, limit);
    // Ripples: set-mates by 7d momentum — "similar slabs that could be bought out next".
    const movers7 = await getSlabMovers({ days: 7, direction: 'up', limit: 100 });
    const bySet = new Map();
    for (const m of movers7.rows) {
        const key = m.setName || '';
        if (!key)
            continue;
        const arr = (_d = bySet.get(key)) !== null && _d !== void 0 ? _d : [];
        arr.push(m);
        bySet.set(key, arr);
    }
    for (const cand of top) {
        const mates = ((_e = bySet.get(cand.setName || '')) !== null && _e !== void 0 ? _e : [])
            .filter((m) => m.cardId !== cand.cardId)
            .slice(0, 3);
        cand.ripples = mates.map((m) => ({
            cardId: m.cardId,
            cardName: m.cardName,
            setName: m.setName,
            imageSmall: m.imageSmall,
            currentPrice: m.currentPrice,
            changePct: m.changePct,
        }));
    }
    return { rows: top, count: top.length, days, note: SUPPLY_NOTE };
}
/** "Investment opportunities" — prediction + momentum + buyout + sentiment blend. */
async function getOpportunities(options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4;
    const limit = clamp((_a = options === null || options === void 0 ? void 0 : options.limit) !== null && _a !== void 0 ? _a : 20, 1, 100);
    const minScore = clamp((_b = options === null || options === void 0 ? void 0 : options.minScore) !== null && _b !== void 0 ? _b : 0, 0, 100);
    const [predictions, moverResult, buyoutResult, premiumRows, sentimentRows, rawPriceRows, catalystRows] = await Promise.all([
        all(`SELECT sp.card_id, sp.expected_90d_return, sp.confidence_score, sp.risk_score,
              sp.category, sp.current_price,
              cm.cardName, cm.setId, cm.setName, cm.imageSmall
       FROM slab_predictions sp
       LEFT JOIN card_mappings cm ON cm.cardId = sp.card_id
       WHERE sp.run_id = (SELECT MAX(id) FROM slab_prediction_runs)
         AND LOWER(sp.grader) = 'psa' AND sp.grade = '10'
       GROUP BY sp.card_id`),
        // 30d momentum, falling back to 7d when graded history is too shallow.
        getSlabMovers({ days: 30, limit: 100 }).then(async (res) => res.rows.length > 0 ? res : getSlabMovers({ days: 7, limit: 100 })),
        scanBuyoutCandidates({ days: 14, limit: 50 }),
        all(`SELECT gp.cardId, gp.setName,
              ((gp.price - raw.price) / raw.price) * 100 AS premiumPct
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
       WHERE UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
         AND COALESCE(gp.verified, 0) = 1
         AND gp.price > 0 AND raw.price > 0`),
        all(`SELECT card_id,
              SUM(sentiment_score * MAX(relevance_score, 1))
                / CAST(SUM(MAX(relevance_score, 1)) AS REAL) AS netSentiment
       FROM external_market_signals
       WHERE card_id IS NOT NULL
         AND (expires_at IS NULL OR expires_at >= datetime('now'))
       GROUP BY card_id`),
        all(`SELECT cm.cardId, c.price AS rawPrice
       FROM card_mappings cm
       INNER JOIN canonical_price_history c ON c.uniqueIdentifier = cm.uniqueIdentifier
       WHERE c.rowid = (
         SELECT c2.rowid FROM canonical_price_history c2
         WHERE c2.uniqueIdentifier = cm.uniqueIdentifier
         ORDER BY c2.date DESC LIMIT 1
       ) AND c.price > 0`),
        all(`SELECT card_id,
              MAX(CASE
                WHEN source_type IN ('tournament', 'ban_list')
                  OR risk_type IN ('buyout', 'reprint', 'rotation', 'supply_shock', 'upcoming_set')
                THEN 1 ELSE 0
              END) AS hasCatalyst
       FROM external_market_signals
       WHERE card_id IS NOT NULL
         AND (expires_at IS NULL OR expires_at >= datetime('now'))
       GROUP BY card_id`),
    ]);
    const moversById = new Map(moverResult.rows.map((m) => [m.cardId, m]));
    const buyoutsById = new Map(buyoutResult.rows.map((b) => [b.cardId, b]));
    const sentimentById = new Map(sentimentRows.map((s) => [
        s.card_id,
        s.netSentiment != null ? clamp(s.netSentiment / 100, -1, 1) : null,
    ]));
    const rawPriceById = new Map(rawPriceRows.map((r) => [r.cardId, r.rawPrice]));
    const catalystById = new Map(catalystRows.map((c) => [c.card_id, c.hasCatalyst === 1]));
    const premiumById = new Map(premiumRows.map((p) => [p.cardId, p]));
    const premiumsBySet = new Map();
    for (const p of premiumRows) {
        if (!p.setName || !Number.isFinite(p.premiumPct))
            continue;
        const arr = (_c = premiumsBySet.get(p.setName)) !== null && _c !== void 0 ? _c : [];
        arr.push(p.premiumPct);
        premiumsBySet.set(p.setName, arr);
    }
    const setMedianPremium = new Map();
    for (const [set, arr] of premiumsBySet) {
        const s = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        setMedianPremium.set(set, s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]);
    }
    // Comp momentum: average 30d move of set-mates.
    const setMomentum = new Map();
    for (const m of moverResult.rows) {
        if (!m.setName)
            continue;
        const acc = (_d = setMomentum.get(m.setName)) !== null && _d !== void 0 ? _d : { sum: 0, n: 0 };
        acc.sum += m.changePct;
        acc.n += 1;
        setMomentum.set(m.setName, acc);
    }
    const universe = new Map();
    for (const p of predictions) {
        universe.set(p.card_id, {
            cardName: p.cardName,
            setId: p.setId,
            setName: p.setName,
            imageSmall: p.imageSmall,
            currentPrice: p.current_price,
        });
    }
    for (const m of moverResult.rows) {
        if (!universe.has(m.cardId)) {
            universe.set(m.cardId, {
                cardName: m.cardName,
                setId: m.setId,
                setName: m.setName,
                imageSmall: m.imageSmall,
                currentPrice: m.currentPrice,
            });
        }
    }
    for (const b of buyoutResult.rows) {
        if (!universe.has(b.cardId)) {
            universe.set(b.cardId, {
                cardName: b.cardName,
                setId: b.setId,
                setName: b.setName,
                imageSmall: b.imageSmall,
                currentPrice: b.currentPrice,
            });
        }
    }
    const predsById = new Map(predictions.map((p) => [p.card_id, p]));
    const out = [];
    for (const [cardId, meta] of universe) {
        const pred = predsById.get(cardId);
        const mover = moversById.get(cardId);
        const buyout = buyoutsById.get(cardId);
        const premium = premiumById.get(cardId);
        const median = meta.setName ? setMedianPremium.get(meta.setName) : undefined;
        const premiumVsSetMedian = premium && median != null ? round2(premium.premiumPct - median) : null;
        const netSentiment = (_e = sentimentById.get(cardId)) !== null && _e !== void 0 ? _e : null;
        const setAcc = meta.setName ? setMomentum.get(meta.setName) : undefined;
        // Exclude the card's own move from its set's comp momentum.
        let compMomentumPct = null;
        if (setAcc) {
            const ownMove = (_f = mover === null || mover === void 0 ? void 0 : mover.changePct) !== null && _f !== void 0 ? _f : 0;
            const n = setAcc.n - (mover ? 1 : 0);
            if (n > 0)
                compMomentumPct = round2((setAcc.sum - (mover ? ownMove : 0)) / n);
        }
        const { score: baseScore } = computeOpportunityScore({
            predictedReturn90d: (_g = pred === null || pred === void 0 ? void 0 : pred.expected_90d_return) !== null && _g !== void 0 ? _g : null,
            confidence: (_h = pred === null || pred === void 0 ? void 0 : pred.confidence_score) !== null && _h !== void 0 ? _h : null,
            momentumPct: (_j = mover === null || mover === void 0 ? void 0 : mover.changePct) !== null && _j !== void 0 ? _j : 0,
            buyoutScore: (_k = buyout === null || buyout === void 0 ? void 0 : buyout.buyoutScore) !== null && _k !== void 0 ? _k : 0,
            premiumVsSetMedian,
            netSentiment,
            compMomentumPct,
        });
        const marketPrice = (_o = (_m = (_l = rawPriceById.get(cardId)) !== null && _l !== void 0 ? _l : meta.currentPrice) !== null && _m !== void 0 ? _m : mover === null || mover === void 0 ? void 0 : mover.currentPrice) !== null && _o !== void 0 ? _o : null;
        const bulk = (0, opportunityBulkScoring_1.applyBulkAndEconomicScoring)({
            marketPrice,
            changeAbs: (_p = mover === null || mover === void 0 ? void 0 : mover.changeAbs) !== null && _p !== void 0 ? _p : null,
            changePct: (_q = mover === null || mover === void 0 ? void 0 : mover.changePct) !== null && _q !== void 0 ? _q : null,
            momentumDays: moverResult.days,
            soldListings: (_s = (_r = mover === null || mover === void 0 ? void 0 : mover.soldListings) !== null && _r !== void 0 ? _r : buyout === null || buyout === void 0 ? void 0 : buyout.soldListings) !== null && _s !== void 0 ? _s : 0,
            liquidityTier: (_u = (_t = mover === null || mover === void 0 ? void 0 : mover.liquidityTier) !== null && _t !== void 0 ? _t : buyout === null || buyout === void 0 ? void 0 : buyout.liquidityTier) !== null && _u !== void 0 ? _u : null,
            buyoutScore: (_v = buyout === null || buyout === void 0 ? void 0 : buyout.buyoutScore) !== null && _v !== void 0 ? _v : 0,
            velocityRatio: (_w = buyout === null || buyout === void 0 ? void 0 : buyout.velocityRatio) !== null && _w !== void 0 ? _w : null,
            listedCount: (_x = buyout === null || buyout === void 0 ? void 0 : buyout.listedCount) !== null && _x !== void 0 ? _x : null,
            listedCountPrev: (_y = buyout === null || buyout === void 0 ? void 0 : buyout.listedCountPrev) !== null && _y !== void 0 ? _y : null,
            netSentiment,
            hasCatalyst: (_z = catalystById.get(cardId)) !== null && _z !== void 0 ? _z : false,
            compMomentumPct,
        });
        const score = clamp(Math.round(baseScore + bulk.economicBoost - bulk.penalty), 0, 100);
        const grade = score >= 75 ? 'strong_buy' : score >= 60 ? 'buy' : score >= 45 ? 'watch' : 'pass';
        const keySignals = [];
        if ((pred === null || pred === void 0 ? void 0 : pred.expected_90d_return) != null) {
            keySignals.push(`predicted_90d:${round2(pred.expected_90d_return)}%`);
        }
        else {
            keySignals.push('momentum_only_scoring');
        }
        if (mover) {
            keySignals.push(`momentum_${moverResult.days}d:${mover.changePct > 0 ? '+' : ''}${mover.changePct}%`);
        }
        if (buyout)
            keySignals.push(`buyout:${buyout.buyoutScore}`);
        if (premiumVsSetMedian != null && premiumVsSetMedian < -10) {
            keySignals.push(`undervalued_vs_set:${premiumVsSetMedian}pp`);
        }
        if (netSentiment != null && Math.abs(netSentiment) > 0.15) {
            keySignals.push(`sentiment:${netSentiment > 0 ? 'positive' : 'negative'}`);
        }
        if (compMomentumPct != null && compMomentumPct > 5) {
            keySignals.push(`set_momentum:+${compMomentumPct}%`);
        }
        if (bulk.overrideActive) {
            keySignals.push('bulk_override:demand_evidence');
        }
        if (bulk.flags.includes('trivial_abs_gain')) {
            keySignals.push('bulk_penalty:trivial_abs_gain');
        }
        if (bulk.penalty >= 15 && !bulk.overrideActive) {
            keySignals.push(`bulk_penalty:-${bulk.penalty}`);
        }
        if (bulk.economicBoost > 0) {
            keySignals.push(`economic_boost:+${bulk.economicBoost}`);
        }
        const whyParts = [];
        if ((pred === null || pred === void 0 ? void 0 : pred.expected_90d_return) != null) {
            whyParts.push(`Model expects ${round2(pred.expected_90d_return)}% over 90d at ${(_0 = pred.confidence_score) !== null && _0 !== void 0 ? _0 : 0}% confidence`);
        }
        else {
            whyParts.push('No slab prediction — scored on momentum and market structure');
        }
        if (mover) {
            whyParts.push(`slab ${mover.changePct > 0 ? 'up' : 'down'} ${Math.abs(mover.changePct)}% in ${moverResult.days}d`);
        }
        if (buyout)
            whyParts.push(`buyout signals (${buyout.phase})`);
        if (premiumVsSetMedian != null && premiumVsSetMedian < -10) {
            whyParts.push('premium below set median');
        }
        const baseWhy = `${whyParts.join('; ')}.`;
        const why = (0, opportunityBulkScoring_1.buildBulkAwareWhy)({ marketPrice, bulk, baseWhy: baseWhy });
        out.push({
            cardId,
            cardName: meta.cardName,
            setId: meta.setId,
            setName: meta.setName,
            imageSmall: meta.imageSmall,
            currentPrice: meta.currentPrice != null ? round2(meta.currentPrice) : null,
            score,
            grade,
            predictedReturn90d: (pred === null || pred === void 0 ? void 0 : pred.expected_90d_return) != null ? round2(pred.expected_90d_return) : null,
            confidence: (_1 = pred === null || pred === void 0 ? void 0 : pred.confidence_score) !== null && _1 !== void 0 ? _1 : null,
            momentumPct: (_2 = mover === null || mover === void 0 ? void 0 : mover.changePct) !== null && _2 !== void 0 ? _2 : null,
            momentumDays: moverResult.days,
            buyoutScore: (_3 = buyout === null || buyout === void 0 ? void 0 : buyout.buyoutScore) !== null && _3 !== void 0 ? _3 : 0,
            netSentiment,
            compMomentumPct,
            riskScore: (_4 = pred === null || pred === void 0 ? void 0 : pred.risk_score) !== null && _4 !== void 0 ? _4 : null,
            why,
            keySignals,
        });
    }
    out.sort((a, b) => b.score - a.score);
    const rows = out.filter((r) => r.score >= minScore).slice(0, limit);
    return { rows, count: rows.length };
}
/** "Signals" — active external events enriched with market metrics and scoring. */
async function getExternalFactorsGlobal(options) {
    var _a, _b, _c, _d, _e, _f;
    const enrichment = await Promise.resolve().then(() => __importStar(require('./investmentSignalEnrichment')));
    const { enrichInvestmentSignal, buildMarketPulse, sortInvestmentSignals, mapSignalCategory, dedupeInvestmentSignals, partitionSignalsByTier, parseReleaseDaysAgo, } = enrichment;
    const limit = clamp((_a = options === null || options === void 0 ? void 0 : options.limit) !== null && _a !== void 0 ? _a : 50, 1, 200);
    const params = [];
    let typeFilter = '';
    if (options === null || options === void 0 ? void 0 : options.type) {
        typeFilter = 'AND (s.source_type = ? OR s.risk_type = ? OR s.source_type = ?)';
        const mapped = options.type === 'reddit' ? 'social' : options.type === 'set_release' ? 'set_release' : options.type;
        params.push(mapped, options.type, mapped);
    }
    const rows = await all(`SELECT
       s.id, s.card_id, s.card_name, s.set_name,
       cm.imageSmall,
       cm.cardName AS mappedCardName,
       cm.setName AS mappedSetName,
       s.source_url, s.source_type, s.title, s.summary,
       s.sentiment_score, s.relevance_score, s.risk_type,
       s.created_at, s.expires_at,
       (
         SELECT SUM(s2.sentiment_score * MAX(s2.relevance_score, 1))
                / CAST(SUM(MAX(s2.relevance_score, 1)) AS REAL)
         FROM external_market_signals s2
         WHERE s2.card_id = s.card_id AND s.card_id IS NOT NULL
           AND (s2.expires_at IS NULL OR s2.expires_at >= datetime('now'))
       ) AS cardNetSentiment
     FROM external_market_signals s
     LEFT JOIN card_mappings cm ON cm.cardId = s.card_id
     WHERE (s.expires_at IS NULL OR s.expires_at >= datetime('now'))
       ${typeFilter}
     GROUP BY s.id
     ORDER BY s.relevance_score DESC, s.created_at DESC
     LIMIT ?`, [...params, limit * 2]);
    const rawSignals = rows.map((r) => {
        var _a, _b, _c, _d;
        return ({
            id: r.id,
            cardId: r.card_id,
            cardName: (_a = r.mappedCardName) !== null && _a !== void 0 ? _a : r.card_name,
            setName: (_b = r.mappedSetName) !== null && _b !== void 0 ? _b : r.set_name,
            imageSmall: r.imageSmall,
            sourceUrl: r.source_url,
            sourceType: r.source_type,
            title: r.title,
            summary: r.summary,
            sentiment: clamp(((_c = r.sentiment_score) !== null && _c !== void 0 ? _c : 0) / 100, -1, 1),
            relevance: clamp(((_d = r.relevance_score) !== null && _d !== void 0 ? _d : 0) / 100, 0, 1),
            riskType: r.risk_type,
            createdAt: r.created_at,
            expiresAt: r.expires_at,
            cardNetSentiment: r.cardNetSentiment != null ? round2(clamp(r.cardNetSentiment / 100, -1, 1)) : null,
        });
    });
    let enriched = await Promise.all(rawSignals.map((raw) => enrichInvestmentSignal(raw)));
    if (options === null || options === void 0 ? void 0 : options.direction) {
        enriched = enriched.filter((s) => s.direction === options.direction);
    }
    enriched = dedupeInvestmentSignals(enriched);
    enriched = enriched.filter((s) => {
        if (s.category !== 'set_release')
            return true;
        const days = enrichment.parseReleaseDaysAgo(s.eventDetail);
        if (days == null)
            return true;
        if (days <= 120)
            return true;
        return s.opportunityScore >= 50;
    });
    const sortKey = ['score', 'confidence', 'newest', 'price_impact', 'volume'].includes(options === null || options === void 0 ? void 0 : options.sort)
        ? options.sort
        : 'score';
    enriched = sortInvestmentSignals(enriched, sortKey);
    const analyzedLast24hRows = await all(`SELECT COUNT(*) AS c FROM external_market_signals
     WHERE created_at >= datetime('now', '-1 day')
       AND (expires_at IS NULL OR expires_at >= datetime('now'))`);
    const analyzedLast24h = (_c = (_b = analyzedLast24hRows[0]) === null || _b === void 0 ? void 0 : _b.c) !== null && _c !== void 0 ? _c : 0;
    const { actionable, emerging } = partitionSignalsByTier(enriched);
    const actionableSlice = actionable.slice(0, limit);
    const emergingSlice = emerging.slice(0, Math.max(limit, 30));
    const pulsePool = [...actionableSlice, ...emergingSlice.slice(0, 20)];
    const byCategory = {};
    for (const s of enriched) {
        byCategory[s.category] = ((_d = byCategory[s.category]) !== null && _d !== void 0 ? _d : 0) + 1;
    }
    for (const r of rawSignals) {
        const cat = mapSignalCategory(r.sourceType, r.riskType);
        if (!(cat in byCategory))
            byCategory[cat] = (_e = byCategory[cat]) !== null && _e !== void 0 ? _e : 0;
    }
    // Full category counts from unfiltered fetch for filter badges
    const allCatRows = await all(`SELECT source_type, risk_type FROM external_market_signals
     WHERE expires_at IS NULL OR expires_at >= datetime('now')`);
    const categoryCounts = {};
    for (const r of allCatRows) {
        const cat = mapSignalCategory(r.source_type, r.risk_type);
        categoryCounts[cat] = ((_f = categoryCounts[cat]) !== null && _f !== void 0 ? _f : 0) + 1;
    }
    return {
        rows: actionableSlice,
        actionable: actionableSlice,
        emerging: emergingSlice,
        count: actionableSlice.length + emergingSlice.length,
        byCategory: categoryCounts,
        pulse: buildMarketPulse(pulsePool, analyzedLast24h),
        lastUpdated: new Date().toISOString(),
    };
}
