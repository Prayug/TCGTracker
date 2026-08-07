"use strict";
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
exports.savePopulationScrape = exports.getAllCachedPopulations = exports.getCachedPopulationByCardId = exports.getPopulationCounts = void 0;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const priceChartingClient_1 = require("./priceChartingClient");
const priceChartingResolver_1 = require("./priceChartingResolver");
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const REQUEST_TIMEOUT_MS = 12000;
const BECKETT_SPORT_POKEMON = '477173';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const buildCacheKey = (input) => [
    (0, priceChartingClient_1.normalize)(input.cardId),
    (0, priceChartingClient_1.normalize)(input.cardName),
    (0, priceChartingClient_1.normalize)(input.setId),
    (0, priceChartingClient_1.normalize)(input.setName),
    (0, priceChartingClient_1.normalize)(input.cardNumber),
    (0, priceChartingClient_1.normalize)(input.variant),
].join('|');
const withTimeout = async (promise, ms) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('request_timeout')), ms);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    }
    finally {
        if (timeoutId)
            clearTimeout(timeoutId);
    }
};
const queryOne = (sql, params) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err)
                reject(err);
            else
                resolve(row || null);
        });
    });
};
const runQuery = (sql, params) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.run(sql, params, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
};
const sanitizeCompanies = (companies) => {
    Object.keys(companies).forEach((grader) => {
        const company = companies[grader];
        if (!company)
            return;
        if (typeof company.total === 'number' && company.total <= 0) {
            company.total = null;
            if (company.status === 'ok') {
                company.status = 'unavailable';
            }
        }
        if (company.status === 'error' && company.message) {
            if (company.message.startsWith('beckett_')) {
                company.message = 'Beckett temporarily unavailable';
            }
            else if (company.message.startsWith('pricecharting_')) {
                company.message = 'Population source temporarily unavailable';
            }
            else if (company.message === 'request_timeout') {
                company.message = 'Lookup timed out';
            }
        }
    });
    return companies;
};
const getCachedPopulation = async (cacheKey) => {
    const row = await queryOne(`SELECT payload, fetchedAt FROM population_cache WHERE cacheKey = ?`, [cacheKey]);
    if (!row) {
        return null;
    }
    const age = Date.now() - row.fetchedAt;
    if (age > CACHE_TTL_MS) {
        return null;
    }
    try {
        const parsed = JSON.parse(row.payload);
        const hasLegacyApifyPayload = Object.values(parsed.companies || {}).some((company) => {
            const source = String((company === null || company === void 0 ? void 0 : company.source) || '');
            const message = String((company === null || company === void 0 ? void 0 : company.message) || '');
            return source === 'apify' || message.includes('APIFY_API_TOKEN');
        });
        if (hasLegacyApifyPayload) {
            return null;
        }
        sanitizeCompanies(parsed.companies);
        return {
            ...parsed,
            cached: true,
            stale: age > CACHE_TTL_MS,
            ageHours: Math.round(age / 3600000),
        };
    }
    catch (_a) {
        return null;
    }
};
const saveCachedPopulation = async (cacheKey, payload) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    await runQuery(`INSERT OR REPLACE INTO population_cache (cacheKey, cardId, payload, fetchedAt) VALUES (?, ?, ?, ?)`, [cacheKey, payload.cardId || null, JSON.stringify(payload), Date.now()]);
    // Daily pop snapshot for regime / supply-shock radar (best-effort).
    if (payload.cardId) {
        try {
            const { snapshotPopulationHistory } = await Promise.resolve().then(() => __importStar(require('./slabInsightsService')));
            await snapshotPopulationHistory({
                cardId: payload.cardId,
                psaTotal: (_c = (_b = (_a = payload.companies) === null || _a === void 0 ? void 0 : _a.psa) === null || _b === void 0 ? void 0 : _b.total) !== null && _c !== void 0 ? _c : null,
                psa10: (_f = (_e = (_d = payload.companies) === null || _d === void 0 ? void 0 : _d.psa) === null || _e === void 0 ? void 0 : _e.grade10) !== null && _f !== void 0 ? _f : null,
                psa9: (_j = (_h = (_g = payload.companies) === null || _g === void 0 ? void 0 : _g.psa) === null || _h === void 0 ? void 0 : _h.grade9) !== null && _j !== void 0 ? _j : null,
                cgcTotal: (_m = (_l = (_k = payload.companies) === null || _k === void 0 ? void 0 : _k.cgc) === null || _l === void 0 ? void 0 : _l.total) !== null && _m !== void 0 ? _m : null,
                cgc10: (_q = (_p = (_o = payload.companies) === null || _o === void 0 ? void 0 : _o.cgc) === null || _p === void 0 ? void 0 : _p.grade10) !== null && _q !== void 0 ? _q : null,
                verified: payload.verified === true,
                productId: (_r = payload.productId) !== null && _r !== void 0 ? _r : null,
            });
        }
        catch (_s) {
            // Table may not exist yet mid-migration; ignore.
        }
    }
};
const parseBeckettRows = (html) => {
    var _a;
    const rows = [];
    const rowRegex = /<input type="hidden" name="set_title" class="set_title" value ="([^"]*)">[\s\S]*?<input type="hidden" name="card_total_value" class="card_total_value" value ="([^"]*)">/g;
    let match = rowRegex.exec(html);
    while (match) {
        const setTitle = ((_a = match[1]) === null || _a === void 0 ? void 0 : _a.trim()) || '';
        const total = Number.parseInt(match[2] || '', 10);
        if (setTitle && Number.isFinite(total)) {
            rows.push({ setTitle, total });
        }
        match = rowRegex.exec(html);
    }
    return rows;
};
const fetchBeckettPopulation = async (input) => {
    var _a, _b;
    const form = new URLSearchParams();
    form.set('sport_id', BECKETT_SPORT_POKEMON);
    form.set('set_name', input.setName || '');
    form.set('player_name', input.cardName);
    form.set('search', 'Search');
    const response = await withTimeout(fetch('https://www.beckett.com/grading/pop-report', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/html',
        },
        body: form.toString(),
    }), REQUEST_TIMEOUT_MS);
    if (!response.ok) {
        throw new Error(`beckett_${response.status}`);
    }
    const html = await response.text();
    const rows = parseBeckettRows(html);
    if (rows.length === 0) {
        return null;
    }
    const inputName = (0, priceChartingClient_1.normalize)(input.cardName);
    const inputSet = (0, priceChartingClient_1.normalize)(input.setName);
    const inputNum = (0, priceChartingClient_1.normalize)(input.cardNumber);
    const ranked = rows
        .map((row) => {
        const candidate = (0, priceChartingClient_1.normalize)(row.setTitle);
        let score = 0;
        if (candidate.includes(inputName))
            score += 60;
        if (inputSet && candidate.includes(inputSet))
            score += 30;
        if (inputNum && candidate.includes(inputNum))
            score += 20;
        return { row, score };
    })
        .sort((a, b) => b.score - a.score);
    return (_b = (_a = ranked[0]) === null || _a === void 0 ? void 0 : _a.row.total) !== null && _b !== void 0 ? _b : null;
};
const buildGraderResult = (grader, pop, extra) => {
    const total = pop && pop.length > 0 ? pop.reduce((acc, v) => acc + v, 0) : null;
    return {
        grader,
        total: total && total > 0 ? total : null,
        grade10: pop && pop.length >= 10 ? pop[9] : null,
        grade9: pop && pop.length >= 9 ? pop[8] : null,
        pop,
        status: total && total > 0 ? 'ok' : 'unavailable',
        source: total && total > 0 ? 'scrape' : 'none',
        message: total && total > 0 ? undefined : 'No population result found',
        ...extra,
    };
};
/**
 * ONE hardened product resolution yields both PSA and CGC census. A single
 * valid 10-element positional array (index 0 = Grade 1 .. 9 = Grade 10)
 * is required before a population is accepted — no more total=1 garbage.
 */
const fetchPriceChartingPopulations = async (input) => {
    const resolved = await (0, priceChartingResolver_1.resolveProduct)({
        cardName: input.cardName,
        setId: input.setId,
        setName: input.setName,
        cardNumber: input.cardNumber,
    }, 1500);
    if (!resolved) {
        throw new Error('pricecharting_no_match');
    }
    const { match, pageData } = resolved;
    const verified = pageData.productId === match.productId;
    return {
        psa: buildGraderResult('psa', pageData.psaPop, {
            productId: pageData.productId,
            verified,
            matchScore: match.matchScore,
        }),
        cgc: buildGraderResult('cgc', pageData.cgcPop, {
            productId: pageData.productId,
            verified,
            matchScore: match.matchScore,
        }),
        productId: pageData.productId,
        verified,
        matchScore: match.matchScore,
    };
};
const resolveGrader = async (grader, input, pcScrape) => {
    try {
        if ((grader === 'psa' || grader === 'cgc') && pcScrape) {
            return pcScrape[grader];
        }
        if (grader === 'psa' || grader === 'cgc') {
            return buildGraderResult(grader, null, {
                message: 'No population result found',
            });
        }
        const beckettTotal = await fetchBeckettPopulation(input);
        return {
            grader,
            total: beckettTotal,
            grade10: null,
            grade9: null,
            pop: null,
            status: beckettTotal !== null ? 'ok' : 'unavailable',
            source: beckettTotal !== null ? 'scrape' : 'none',
            message: beckettTotal !== null ? undefined : 'No population result found',
        };
    }
    catch (error) {
        const rawMessage = error.message || 'population_lookup_failed';
        const message = rawMessage === 'request_timeout'
            ? 'Lookup timed out'
            : rawMessage.startsWith('beckett_')
                ? 'Beckett temporarily unavailable'
                : rawMessage.startsWith('pricecharting_')
                    ? 'Population source temporarily unavailable'
                    : 'Population lookup failed';
        logger_1.logger.warn('Population lookup failed', {
            grader,
            cardName: input.cardName,
            error: rawMessage,
        });
        return {
            grader,
            total: null,
            grade10: null,
            grade9: null,
            pop: null,
            status: 'error',
            source: 'none',
            message,
        };
    }
};
const getPopulationCounts = async (input) => {
    var _a, _b;
    const key = buildCacheKey(input);
    const cached = await getCachedPopulation(key);
    if (cached) {
        return cached;
    }
    let pcScrape = null;
    try {
        pcScrape = await fetchPriceChartingPopulations(input);
    }
    catch (error) {
        logger_1.logger.warn('PriceCharting population scrape failed', {
            cardName: input.cardName,
            error: error.message,
        });
    }
    const [psa, cgc, beckett] = await Promise.all([
        resolveGrader('psa', input, pcScrape),
        resolveGrader('cgc', input, pcScrape),
        resolveGrader('beckett', input, pcScrape),
    ]);
    const payload = {
        key,
        cardId: input.cardId,
        cardName: input.cardName,
        setId: input.setId,
        setName: input.setName,
        cardNumber: input.cardNumber,
        variant: input.variant,
        fetchedAt: Date.now(),
        cached: false,
        stale: false,
        ageHours: 0,
        productId: (_a = pcScrape === null || pcScrape === void 0 ? void 0 : pcScrape.productId) !== null && _a !== void 0 ? _a : null,
        verified: (_b = pcScrape === null || pcScrape === void 0 ? void 0 : pcScrape.verified) !== null && _b !== void 0 ? _b : false,
        companies: { psa, cgc, beckett },
    };
    await saveCachedPopulation(key, payload).catch((error) => {
        logger_1.logger.warn('Failed to cache population lookup', { error: error.message });
    });
    return payload;
};
exports.getPopulationCounts = getPopulationCounts;
/**
 * Look up the freshest cached population payload for a cardId (used by the
 * prediction engine's scarcity scoring and the nightly refresh).
 */
const getCachedPopulationByCardId = async (cardId) => {
    const row = await queryOne(`SELECT payload FROM population_cache WHERE cardId = ? ORDER BY fetchedAt DESC LIMIT 1`, [cardId]);
    if (!row)
        return null;
    try {
        const parsed = JSON.parse(row.payload);
        sanitizeCompanies(parsed.companies);
        return { ...parsed, cached: true };
    }
    catch (_a) {
        return null;
    }
};
exports.getCachedPopulationByCardId = getCachedPopulationByCardId;
const getAllCachedPopulations = async () => {
    const db = (0, database_1.getDb)();
    const rows = await new Promise((resolve, reject) => {
        db.all(`SELECT cardId, payload FROM population_cache WHERE cardId IS NOT NULL`, (err, r) => (err ? reject(err) : resolve(r || [])));
    });
    const results = [];
    for (const row of rows) {
        try {
            results.push({ cardId: row.cardId, payload: JSON.parse(row.payload) });
        }
        catch (_a) {
            // skip malformed payloads
        }
    }
    return results;
};
exports.getAllCachedPopulations = getAllCachedPopulations;
/**
 * Save a population payload from a shared product-page scrape (nightly refresh).
 */
const savePopulationScrape = async (cardId, input, match, pageData) => {
    const verified = pageData.productId === match.productId;
    const psa = buildGraderResult('psa', pageData.psaPop, {
        productId: pageData.productId,
        verified,
        matchScore: match.matchScore,
    });
    const cgc = buildGraderResult('cgc', pageData.cgcPop, {
        productId: pageData.productId,
        verified,
        matchScore: match.matchScore,
    });
    const beckett = {
        grader: 'beckett',
        total: null,
        grade10: null,
        grade9: null,
        pop: null,
        status: 'unavailable',
        source: 'none',
        message: 'No population result found',
    };
    const payload = {
        key: buildCacheKey({ ...input, cardId }),
        cardId,
        cardName: input.cardName,
        setId: input.setId,
        setName: input.setName,
        cardNumber: input.cardNumber,
        variant: input.variant,
        fetchedAt: Date.now(),
        cached: false,
        stale: false,
        ageHours: 0,
        productId: pageData.productId,
        verified,
        companies: { psa, cgc, beckett },
    };
    await saveCachedPopulation(payload.key, payload);
};
exports.savePopulationScrape = savePopulationScrape;
