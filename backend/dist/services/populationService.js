"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPopulationCounts = void 0;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const REQUEST_TIMEOUT_MS = 12000;
const BECKETT_SPORT_POKEMON = '477173';
const normalize = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const buildCacheKey = (input) => [
    normalize(input.cardId),
    normalize(input.cardName),
    normalize(input.setId),
    normalize(input.setName),
    normalize(input.cardNumber),
    normalize(input.variant),
].join('|');
const withTimeout = (promise, ms) => __awaiter(void 0, void 0, void 0, function* () {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('request_timeout')), ms);
    });
    try {
        return yield Promise.race([promise, timeoutPromise]);
    }
    finally {
        if (timeoutId)
            clearTimeout(timeoutId);
    }
});
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
const getCachedPopulation = (cacheKey) => __awaiter(void 0, void 0, void 0, function* () {
    const row = yield queryOne(`SELECT payload, fetchedAt FROM population_cache WHERE cacheKey = ?`, [cacheKey]);
    if (!row) {
        return null;
    }
    if (Date.now() - row.fetchedAt > CACHE_TTL_MS) {
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
        Object.keys(parsed.companies || {}).forEach((grader) => {
            const company = parsed.companies[grader];
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
        return Object.assign(Object.assign({}, parsed), { cached: true });
    }
    catch (_a) {
        return null;
    }
});
const saveCachedPopulation = (cacheKey, payload) => __awaiter(void 0, void 0, void 0, function* () {
    yield runQuery(`INSERT OR REPLACE INTO population_cache (cacheKey, payload, fetchedAt) VALUES (?, ?, ?)`, [cacheKey, JSON.stringify(payload), Date.now()]);
});
const scoreCandidate = (candidate, input) => {
    const title = normalize(candidate.title);
    const setName = normalize(candidate.setName);
    const cardName = normalize(input.cardName);
    const inputSet = normalize(input.setName);
    const inputCardNumber = normalize(input.cardNumber);
    let score = 0;
    if (title.includes(cardName)) {
        score += 60;
    }
    if (inputSet && (setName.includes(inputSet) || inputSet.includes(setName))) {
        score += 30;
    }
    if (inputCardNumber && title.includes(inputCardNumber)) {
        score += 20;
    }
    return score;
};
const parsePriceChartingSearchRows = (html) => {
    const rows = [];
    const rowRegex = /<tr id="product-[^"]+"[\s\S]*?<a href="(https:\/\/www\.pricecharting\.com\/game\/[^"]+)"[^>]*>\s*([\s\S]*?)<\/a>[\s\S]*?<a href="\/console\/[^"]+">\s*([\s\S]*?)\s*<\/a>[\s\S]*?<\/tr>/g;
    let match = rowRegex.exec(html);
    while (match) {
        const [, url, rawTitle, rawSet] = match;
        rows.push({
            url,
            title: rawTitle.replace(/<[^>]+>/g, '').trim(),
            setName: rawSet.replace(/<[^>]+>/g, '').trim(),
        });
        match = rowRegex.exec(html);
    }
    return rows;
};
const sumPopArray = (values) => {
    if (!Array.isArray(values) || values.length === 0) {
        return null;
    }
    const nums = values.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0);
    if (nums.length === 0) {
        return null;
    }
    const total = nums.reduce((acc, v) => acc + v, 0);
    return total > 0 ? total : null;
};
const fetchPriceChartingPopulations = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const query = [input.cardName, input.cardNumber, input.variant, input.setName]
        .filter(Boolean)
        .join(' ')
        .trim();
    const searchUrl = `https://www.pricecharting.com/search-products?exclude-variants=false&q=${encodeURIComponent(query)}&region-name=all&type=prices&go=Go`;
    const searchResponse = yield withTimeout(fetch(searchUrl, { headers: { Accept: 'text/html' } }), REQUEST_TIMEOUT_MS);
    if (!searchResponse.ok) {
        throw new Error(`pricecharting_search_${searchResponse.status}`);
    }
    const searchHtml = yield searchResponse.text();
    const rows = parsePriceChartingSearchRows(searchHtml);
    if (rows.length === 0) {
        return { psa: null, cgc: null };
    }
    const ranked = rows
        .map((row) => ({ row, score: scoreCandidate({ title: row.title, setName: row.setName }, input) }))
        .sort((a, b) => b.score - a.score);
    const best = (_a = ranked[0]) === null || _a === void 0 ? void 0 : _a.row;
    if (!best) {
        return { psa: null, cgc: null };
    }
    const cardResponse = yield withTimeout(fetch(best.url, { headers: { Accept: 'text/html' } }), REQUEST_TIMEOUT_MS);
    if (!cardResponse.ok) {
        throw new Error(`pricecharting_card_${cardResponse.status}`);
    }
    const cardHtml = yield cardResponse.text();
    const popMatch = cardHtml.match(/VGPC\.pop_data\s*=\s*(\{[\s\S]*?\});/);
    if (!popMatch) {
        return { psa: null, cgc: null };
    }
    const popData = JSON.parse(popMatch[1]);
    return {
        psa: sumPopArray(popData.psa),
        cgc: sumPopArray(popData.cgc),
    };
});
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
const fetchBeckettPopulation = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const form = new URLSearchParams();
    form.set('sport_id', BECKETT_SPORT_POKEMON);
    form.set('set_name', input.setName || '');
    form.set('player_name', input.cardName);
    form.set('search', 'Search');
    const response = yield withTimeout(fetch('https://www.beckett.com/grading/pop-report', {
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
    const html = yield response.text();
    const rows = parseBeckettRows(html);
    if (rows.length === 0) {
        return null;
    }
    const inputName = normalize(input.cardName);
    const inputSet = normalize(input.setName);
    const inputNum = normalize(input.cardNumber);
    const ranked = rows
        .map((row) => {
        const candidate = normalize(row.setTitle);
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
});
const resolveGrader = (grader, input) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (grader === 'psa' || grader === 'cgc') {
            const totals = yield fetchPriceChartingPopulations(input);
            const total = grader === 'psa' ? totals.psa : totals.cgc;
            return {
                grader,
                total,
                status: total !== null ? 'ok' : 'unavailable',
                source: total !== null ? 'scrape' : 'none',
                message: total !== null ? undefined : 'No population result found',
            };
        }
        const beckettTotal = yield fetchBeckettPopulation(input);
        return {
            grader,
            total: beckettTotal,
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
            status: 'error',
            source: 'none',
            message,
        };
    }
});
const getPopulationCounts = (input) => __awaiter(void 0, void 0, void 0, function* () {
    const key = buildCacheKey(input);
    const cached = yield getCachedPopulation(key);
    if (cached) {
        return cached;
    }
    const [psa, cgc, beckett] = yield Promise.all([
        resolveGrader('psa', input),
        resolveGrader('cgc', input),
        resolveGrader('beckett', input),
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
        companies: { psa, cgc, beckett },
    };
    yield saveCachedPopulation(key, payload).catch((error) => {
        logger_1.logger.warn('Failed to cache population lookup', { error: error.message });
    });
    return payload;
});
exports.getPopulationCounts = getPopulationCounts;
