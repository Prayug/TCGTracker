"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSetKey = exports.normalizeName = exports.PSA_FEE_CONTEXT = void 0;
exports.estimatePsaGradingFee = estimatePsaGradingFee;
exports.scoreCard = scoreCard;
exports.parseGradeWorthinessSort = parseGradeWorthinessSort;
exports.getGradeWorthinessLeaderboard = getGradeWorthinessLeaderboard;
const database_1 = require("../db/database");
const setEra_1 = require("../utils/setEra");
const MIN_RAW_PRICE = 5;
const MIN_PSA_TOTAL = 25;
const MIN_PREMIUM_PCT = 15;
/** After fee, require meaningful headroom — e.g. $5 → $80 fails vs ~$80 Regular. */
const MIN_NET_PROFIT = 40;
const MIN_NET_ROI_PCT = 15;
exports.PSA_FEE_CONTEXT = {
    grader: 'PSA',
    floorFee: 79.99,
    floorTier: 'Regular',
    note: 'PSA Value Bulk / Value tiers paused — Regular ($79.99) is the current floor. Net profit is PSA 10 − raw − fee.',
};
/**
 * Approximate PSA direct trading-card fee for a declared value.
 * Value tiers are treated as unavailable; Regular is the floor.
 * Insurance ≈ 2% of declared value above $499 (common published surcharge).
 */
function estimatePsaGradingFee(declaredValue) {
    const v = Math.max(0, Number(declaredValue) || 0);
    let baseFee;
    let tier;
    if (v <= 1499) {
        baseFee = 79.99;
        tier = 'Regular';
    }
    else if (v <= 2999) {
        baseFee = 149;
        tier = 'Express';
    }
    else if (v <= 4999) {
        baseFee = 299;
        tier = 'Super Express';
    }
    else {
        baseFee = 599;
        tier = 'Walk-Through';
    }
    const insurance = v > 499 ? (v - 499) * 0.02 : 0;
    return {
        fee: Math.round((baseFee + insurance) * 100) / 100,
        baseFee,
        insurance: Math.round(insurance * 100) / 100,
        tier,
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
const clamp01 = (n) => Math.max(0, Math.min(1, n));
/** Export for unit tests. Scores after-fee net ROI × gem ease. */
function scoreCard(input) {
    // Log net ROI: 50% ≈ 0.37, 200% ≈ 0.63, 1000% ≈ 0.87, 2000% ≈ 1.0
    const upliftNorm = clamp01(Math.log10(1 + Math.max(0, input.netRoiPct) / 100) / Math.log10(1 + 20));
    const gemRateNorm = clamp01(input.gemRatePct / 45);
    const popNorm = clamp01(Math.log10(input.psa10Pop + 1) / 4);
    const gemEaseNorm = 0.75 * gemRateNorm + 0.25 * popNorm;
    const upliftScore = upliftNorm * 100;
    const gemEaseScore = gemEaseNorm * 100;
    // Geometric mean rewards cards that are strong on *both* axes.
    const score = 100 * Math.sqrt(Math.max(upliftNorm, 0.01) * Math.max(gemEaseNorm, 0.01));
    return { score, upliftScore, gemEaseScore };
}
function whyLine(row) {
    const bits = [];
    bits.push(`+$${row.netProfit.toFixed(0)} after $${row.gradingFee.toFixed(0)} ${row.gradingTier}`);
    bits.push(`${row.netRoiPct.toFixed(0)}% net ROI`);
    bits.push(`${row.gemRatePct.toFixed(1)}% gem rate (${row.psa10Pop.toLocaleString()} PSA 10s)`);
    return bits.join(' · ');
}
/**
 * Rank cards worth submitting for a PSA 10 (after current PSA fees).
 * Pass `cardIds` to scope to a vault (or any subset).
 * Optional `eras` / `setIds` narrow the leaderboard.
 */
const SORT_MODES = new Set([
    'score',
    'netProfit',
    'netRoi',
    'gemEase',
    'scarce',
]);
function parseGradeWorthinessSort(value) {
    const s = String(value || 'score').trim();
    return SORT_MODES.has(s) ? s : 'score';
}
function sortWorthinessRows(rows, sort) {
    switch (sort) {
        case 'netProfit':
            rows.sort((a, b) => b.netProfit - a.netProfit);
            break;
        case 'netRoi':
            rows.sort((a, b) => b.netRoiPct - a.netRoiPct);
            break;
        case 'gemEase':
            rows.sort((a, b) => b.gemEaseScore - a.gemEaseScore || b.gemRatePct - a.gemRatePct);
            break;
        case 'scarce':
            rows.sort((a, b) => a.gemRatePct - b.gemRatePct || a.psa10Pop - b.psa10Pop || b.score - a.score);
            break;
        case 'score':
        default:
            rows.sort((a, b) => b.score - a.score);
            break;
    }
}
const GRADED_STALE_HOURS = 12;
function ageHoursFromFetchedAt(fetchedAt) {
    if (!fetchedAt)
        return null;
    const ms = new Date(fetchedAt.endsWith('Z') ? fetchedAt : `${fetchedAt}Z`).getTime();
    if (!Number.isFinite(ms))
        return null;
    return Math.max(0, Math.round((Date.now() - ms) / 3600000));
}
async function getGradeWorthinessLeaderboard(options) {
    var _a, _b, _c, _d, _e, _f;
    const limit = Math.min(Math.max((_a = options === null || options === void 0 ? void 0 : options.limit) !== null && _a !== void 0 ? _a : 40, 1), 200);
    const cardIds = (_c = (_b = options === null || options === void 0 ? void 0 : options.cardIds) === null || _b === void 0 ? void 0 : _b.filter(Boolean)) !== null && _c !== void 0 ? _c : [];
    const eras = [...new Set(((_d = options === null || options === void 0 ? void 0 : options.eras) !== null && _d !== void 0 ? _d : []).map((e) => e.trim()).filter(Boolean))];
    const setIds = [...new Set(((_e = options === null || options === void 0 ? void 0 : options.setIds) !== null && _e !== void 0 ? _e : []).map((s) => s.trim()).filter(Boolean))];
    const sort = (_f = options === null || options === void 0 ? void 0 : options.sort) !== null && _f !== void 0 ? _f : 'score';
    const scope = cardIds.length > 0 ? 'vault' : 'all';
    let idFilter = '';
    const params = [];
    if (cardIds.length > 0) {
        idFilter = `AND gp.cardId IN (${cardIds.map(() => '?').join(',')})`;
        params.push(...cardIds);
    }
    const rows = await all(`SELECT
       gp.cardId,
       COALESCE(gp.cardName, cc.cardName) AS cardName,
       COALESCE(gp.setId, cc.setId) AS setId,
       COALESCE(gp.setName, cc.setName) AS setName,
       COALESCE(
         NULLIF(cc.imageSmall, ''),
         (
           SELECT NULLIF(cm.imageSmall, '')
           FROM card_mappings cm
           WHERE cm.cardId = gp.cardId
             AND IFNULL(cm.imageSmall, '') != ''
           LIMIT 1
         )
       ) AS imageSmall,
       gp.price AS psa10Price,
       COALESCE(gp.soldListings, 0) AS soldListings,
       (
         SELECT c.price FROM canonical_price_history c
         INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
         WHERE cm.cardId = gp.cardId
         ORDER BY c.date DESC LIMIT 1
       ) AS rawPrice,
       (
         SELECT CAST(json_extract(pc.payload, '$.companies.psa.grade10') AS REAL)
         FROM population_cache pc
         WHERE pc.cardId = gp.cardId
         ORDER BY pc.fetchedAt DESC LIMIT 1
       ) AS psa10Pop,
       (
         SELECT CAST(json_extract(pc.payload, '$.companies.psa.grade9') AS REAL)
         FROM population_cache pc
         WHERE pc.cardId = gp.cardId
         ORDER BY pc.fetchedAt DESC LIMIT 1
       ) AS psa9Pop,
       (
         SELECT CAST(json_extract(pc.payload, '$.companies.psa.total') AS REAL)
         FROM population_cache pc
         WHERE pc.cardId = gp.cardId
         ORDER BY pc.fetchedAt DESC LIMIT 1
       ) AS psaTotal,
       COALESCE(gp.verified, 0) AS verified,
       gp.fetchedAt
     FROM graded_prices gp
     LEFT JOIN catalog_cards cc ON cc.cardId = gp.cardId
     WHERE gp.grader = 'psa'
       AND gp.grade = '10'
       AND gp.price IS NOT NULL
       AND gp.price > 0
       AND COALESCE(gp.verified, 0) = 1
       ${idFilter}`, params);
    const scored = [];
    for (const r of rows) {
        const rawPrice = r.rawPrice != null ? Number(r.rawPrice) : NaN;
        const psa10Price = Number(r.psa10Price);
        const psa10Pop = r.psa10Pop != null ? Number(r.psa10Pop) : NaN;
        const psaTotal = r.psaTotal != null ? Number(r.psaTotal) : NaN;
        if (!(rawPrice >= MIN_RAW_PRICE))
            continue;
        if (!(psa10Price > rawPrice))
            continue;
        if (!(psaTotal >= MIN_PSA_TOTAL) || !(psa10Pop >= 0))
            continue;
        const premium = psa10Price - rawPrice;
        const premiumPct = (premium / rawPrice) * 100;
        if (premiumPct < MIN_PREMIUM_PCT)
            continue;
        const { fee: gradingFee, tier: gradingTier } = estimatePsaGradingFee(psa10Price);
        const costBasis = rawPrice + gradingFee;
        const netProfit = psa10Price - costBasis;
        const netRoiPct = costBasis > 0 ? (netProfit / costBasis) * 100 : 0;
        // Fee hurdle: skip cards that don't clear PSA's current Regular floor with margin.
        if (netProfit < MIN_NET_PROFIT || netRoiPct < MIN_NET_ROI_PCT)
            continue;
        const gemRatePct = (psa10Pop / psaTotal) * 100;
        const multiple = psa10Price / rawPrice;
        const breakEvenGemRatePct = premium > 0 ? Math.min(100, (gradingFee / premium) * 100) : 100;
        const { score, upliftScore, gemEaseScore } = scoreCard({
            netRoiPct,
            gemRatePct,
            psa10Pop,
        });
        const setId = r.setId || null;
        const setName = r.setName || null;
        const era = resolveEra(setId, setName);
        const ageHours = ageHoursFromFetchedAt(r.fetchedAt);
        const psa9Pop = r.psa9Pop != null && Number.isFinite(Number(r.psa9Pop)) ? Number(r.psa9Pop) : null;
        scored.push({
            cardId: r.cardId,
            cardName: r.cardName,
            setId,
            setName,
            era,
            imageSmall: r.imageSmall || null,
            rawPrice,
            psa10Price,
            premium,
            premiumPct,
            multiple,
            gradingFee,
            gradingTier,
            costBasis,
            netProfit,
            netRoiPct,
            psa10Pop,
            psa9Pop,
            psaTotal,
            gemRatePct,
            breakEvenGemRatePct,
            soldListings: Number(r.soldListings) || 0,
            score,
            upliftScore,
            gemEaseScore,
            why: whyLine({
                netProfit,
                netRoiPct,
                gradingFee,
                gradingTier,
                gemRatePct,
                psa10Pop,
            }),
            verified: Number(r.verified) === 1,
            stale: ageHours != null ? ageHours >= GRADED_STALE_HOURS : false,
            ageHours,
            fetchedAt: r.fetchedAt || null,
        });
    }
    // Facets from the unfiltered pool so chips stay stable while filtering.
    const facets = buildFacets(scored);
    let filtered = scored;
    if (eras.length > 0) {
        const eraSet = new Set(eras);
        filtered = filtered.filter((r) => eraSet.has(r.era));
    }
    if (setIds.length > 0) {
        const setSet = new Set(setIds.map((s) => s.toLowerCase()));
        filtered = filtered.filter((r) => {
            if (r.setId && setSet.has(r.setId.toLowerCase()))
                return true;
            // tcgcsv rows sometimes lack setId — allow setName key match
            if (r.setName && setSet.has(`name:${r.setName.toLowerCase()}`))
                return true;
            return false;
        });
    }
    sortWorthinessRows(filtered, sort);
    const top = filtered.slice(0, limit);
    await fillMissingImages(top);
    return {
        rows: top,
        count: filtered.length,
        candidates: rows.length,
        scope,
        feeContext: exports.PSA_FEE_CONTEXT,
        facets,
        filters: { eras, setIds },
    };
}
function buildFacets(rows) {
    const eraCounts = new Map();
    const setCounts = new Map();
    for (const row of rows) {
        eraCounts.set(row.era, (eraCounts.get(row.era) || 0) + 1);
        const setKey = row.setId || (row.setName ? `name:${row.setName}` : '');
        if (!setKey)
            continue;
        const existing = setCounts.get(setKey);
        if (existing) {
            existing.count += 1;
        }
        else {
            setCounts.set(setKey, {
                setId: setKey,
                setName: row.setName || row.setId || 'Unknown set',
                era: row.era,
                count: 1,
            });
        }
    }
    const eras = setEra_1.ERA_GROUPS.map((g) => ({
        id: g.id,
        label: g.label,
        count: eraCounts.get(g.id) || 0,
    })).filter((e) => e.count > 0);
    // Include any unexpected era ids not in ERA_GROUPS
    for (const [id, count] of eraCounts) {
        if (!eras.some((e) => e.id === id)) {
            eras.push({ id, label: (0, setEra_1.getEraLabel)(id), count });
        }
    }
    const sets = [...setCounts.values()].sort((a, b) => {
        if (b.count !== a.count)
            return b.count - a.count;
        return a.setName.localeCompare(b.setName);
    });
    return { eras, sets };
}
/** Export for unit tests. Fold accents/hyphens so TCGCSV labels match catalog. */
const normalizeName = (value) => (value || '')
    .toLowerCase()
    // Fold accents so "Pokémon GO" matches TCGCSV "Pokemon GO"
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_:/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
exports.normalizeName = normalizeName;
/** Strip TCGCSV era prefixes: "SM - Celestial Storm" → "celestial storm". */
const normalizeSetKey = (value) => {
    let key = (0, exports.normalizeName)(value);
    key = key
        .replace(/^(sm|swsh|sv|xy|bw|ex|dp|pl|hgss|me|ecard|base|neo|gym)\s+/, '')
        .replace(/^(sun and moon|sword and shield|scarlet and violet|black and white)\s+/, '')
        .trim();
    return key;
};
exports.normalizeSetKey = normalizeSetKey;
const setsLooselyMatch = (a, b) => {
    if (!a || !b)
        return false;
    if (a === b)
        return true;
    if (a.includes(b) || b.includes(a))
        return true;
    const tokens = (s) => s.split(' ').filter((t) => t.length > 2 && !['the', 'and'].includes(t));
    const ta = new Set(tokens(a));
    const tb = tokens(b);
    if (tb.length === 0)
        return false;
    const overlap = tb.filter((t) => ta.has(t)).length;
    return overlap >= Math.min(2, tb.length);
};
/** Map TCGCSV-style set labels (e.g. "SM - Hidden Fates") onto era ids. */
function resolveEra(setId, setName) {
    const name = (setName || '').toLowerCase().trim();
    const id = (setId || '').toLowerCase().trim();
    const seriesHint = (() => {
        // Promo set codes / Black Star labels → parent era series
        if (id === 'svp' || /^svp\b/.test(name) || (name.includes('promo') && (name.includes('scarlet') || name.includes('violet')))) {
            return 'scarlet & violet';
        }
        if (id === 'swshp' || /^swshp?\b/.test(name) || (name.includes('promo') && (name.includes('sword') || name.includes('shield') || name.includes('swsh')))) {
            return 'sword & shield';
        }
        if (id === 'smp' || /^smp\b/.test(name) || (name.includes('promo') && (name.includes('sun') || name.includes('moon') || /\bsm\b/.test(name)))) {
            return 'sun & moon';
        }
        if (id === 'xyp' || /^xyp\b/.test(name) || (name.includes('promo') && /\bxy\b/.test(name))) {
            return 'xy';
        }
        if (id === 'bwp' || /^bwp\b/.test(name) || (name.includes('promo') && name.includes('black') && name.includes('white'))) {
            return 'black & white';
        }
        if (/^sm\b|^sm\s*-/.test(name) || name.includes('sun & moon') || name.includes('sun and moon')) {
            return 'sun & moon';
        }
        if (/^swsh\b|^swsh\s*-/.test(name) || name.includes('sword') || name.includes('shield')) {
            return 'sword & shield';
        }
        if (/^sv\b|^sv\s*-/.test(name) || name.includes('scarlet') || name.includes('violet')) {
            return 'scarlet & violet';
        }
        if (/^xy\b|^xy\s*-/.test(name) || name.includes(' xy') || name.startsWith('xy ')) {
            return 'xy';
        }
        if (/^bw\b|^bw\s*-/.test(name) || name.includes('black & white') || name.includes('black and white')) {
            return 'black & white';
        }
        if (name.includes('heartgold') || name.includes('soulsilver') || /^hgss\b/.test(name)) {
            return 'heartgold & soulsilver';
        }
        if (name.includes('diamond') || name.includes('pearl') || /^dp\b|^pl\b/.test(name)) {
            return 'diamond & pearl';
        }
        if (/^ex\b|^ex\s*-/.test(name) || name.includes('ex series'))
            return 'ex';
        if (name.includes('neo'))
            return 'neo';
        if (name.includes('gym'))
            return 'gym';
        if (name.includes('base'))
            return 'base';
        if (name.includes('mega evolution') || /^me\b/.test(name))
            return 'mega evolution';
        // Well-known SM sets that drop the "SM -" prefix in TCGCSV labels
        if (name.includes('hidden fates') ||
            name.includes('burning shadows') ||
            name.includes('ultra prism') ||
            name.includes('celestial storm') ||
            name.includes('unbroken bonds') ||
            name.includes('forbidden light') ||
            name.includes('team up') ||
            name.includes('unified minds') ||
            name.includes('cosmic eclipse') ||
            name.includes('lost thunder') ||
            name.includes('dragon majesty') ||
            name.includes('guardians rising') ||
            name.includes('crimson invasion') ||
            name.includes('shining legends')) {
            return 'sun & moon';
        }
        if (name.includes('evolving skies') ||
            name.includes('brilliant stars') ||
            name.includes('fusion strike') ||
            name.includes('chilling reign') ||
            name.includes('battle styles') ||
            name.includes('vivid voltage') ||
            name.includes('darkness ablaze') ||
            name.includes('rebel clash') ||
            name.includes('shining fates') ||
            name.includes('crown zenith') ||
            name.includes('silver tempest') ||
            name.includes('lost origin') ||
            name.includes('astral radiance') ||
            name.includes('pokemon go') ||
            name.includes('champion')) {
            return 'sword & shield';
        }
        return undefined;
    })();
    return (0, setEra_1.classifySetEra)({
        id: setId || '',
        name: setName || '',
        series: seriesHint,
    });
}
/** Resolve art for tcgcsv-* / unmapped ids via catalog name+set match. */
async function fillMissingImages(rows) {
    const missing = rows.filter((r) => !r.imageSmall && r.cardName);
    if (missing.length === 0)
        return;
    await Promise.all(missing.map(async (row) => {
        const nameKey = (0, exports.normalizeName)(row.cardName);
        if (!nameKey)
            return;
        const setKey = (0, exports.normalizeSetKey)(row.setName);
        // Normalize hyphens in SQL too — catalog uses "Charizard-GX", TCGCSV "Charizard GX".
        const likePrefix = `${nameKey.replace(/[%_]/g, '')}%`;
        const candidates = await all(`SELECT imageSmall, cardName, setName FROM catalog_cards
         WHERE IFNULL(imageSmall, '') != ''
           AND replace(replace(lower(cardName), '-', ' '), '  ', ' ') LIKE ?
         LIMIT 60`, [likePrefix]);
        const exactName = candidates.filter((c) => (0, exports.normalizeName)(c.cardName) === nameKey);
        const pool = exactName.length > 0 ? exactName : candidates;
        if (pool.length === 0)
            return;
        const setMatched = setKey
            ? pool.find((c) => setsLooselyMatch((0, exports.normalizeSetKey)(c.setName), setKey))
            : undefined;
        // Prefer set match; only fall back when we have a unique exact name hit.
        const hit = setMatched ||
            (exactName.length === 1 ? exactName[0] : undefined) ||
            (!setKey ? pool[0] : undefined);
        if (hit === null || hit === void 0 ? void 0 : hit.imageSmall) {
            row.imageSmall = hit.imageSmall;
        }
    }));
}
