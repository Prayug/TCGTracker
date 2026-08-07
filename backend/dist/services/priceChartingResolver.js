"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProduct = exports.guessConsoleName = exports.getConsoleName = exports.learnConsoleName = void 0;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const priceChartingClient_1 = require("./priceChartingClient");
const queryAll = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().all(sql, params, (err, rows) => {
        if (err)
            reject(err);
        else
            resolve((rows || []));
    });
});
const run = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().run(sql, params, (err) => {
        if (err)
            reject(err);
        else
            resolve();
    });
});
/** Persist the learned mapping: our set name -> PriceCharting console name. */
const learnConsoleName = async (ourSetName, consoleName) => {
    if (!ourSetName || !consoleName)
        return;
    try {
        await run(`INSERT INTO pc_set_mappings (ourSetName, consoleName, learnedAt)
       VALUES (?, ?, ?)
       ON CONFLICT(ourSetName) DO UPDATE SET consoleName = excluded.consoleName`, [ourSetName, consoleName, Date.now()]);
    }
    catch (error) {
        logger_1.logger.warn('Failed to learn console name', { error: error.message });
    }
};
exports.learnConsoleName = learnConsoleName;
const getConsoleName = async (ourSetName) => {
    if (!ourSetName)
        return null;
    try {
        const rows = await queryAll('SELECT consoleName FROM pc_set_mappings WHERE ourSetName = ?', [ourSetName]);
        return rows.length > 0 ? rows[0].consoleName : null;
    }
    catch (_a) {
        return null;
    }
};
exports.getConsoleName = getConsoleName;
/**
 * Heuristic guess at a set's PriceCharting console name before any real match
 * has been learned. Used to fetch product pages directly on the first pass;
 * wrong guesses are rejected by strict page verification and cost one extra
 * cheap request. Known exceptions handled explicitly.
 */
const guessConsoleName = (ourSetName) => {
    const name = (ourSetName || '').trim();
    if (!name)
        return null;
    if (name.toLowerCase() === 'base')
        return 'Pokemon Base Set';
    const clean = name
        .replace(/^ME:\s*/i, '')
        .replace(/^M:\s*/i, '')
        .replace(/^SVE:\s*/i, '')
        .trim();
    if (!clean)
        return null;
    if (/^pokemon\b/i.test(clean))
        return clean;
    if (!/^[a-z0-9&']/i.test(clean))
        return null;
    return `Pokemon ${clean}`;
};
exports.guessConsoleName = guessConsoleName;
const toMatchInput = (input) => ({
    cardName: input.cardName,
    setName: input.setName || undefined,
    cardNumber: input.cardNumber || undefined,
});
/**
 * Resolve a card to its PriceCharting product: learned console -> direct URL,
 * guessed console -> direct URL, then full search. Direct hits are verified
 * against the parsed page before being trusted. On any success, learns (or
 * confirms) the set's console name so later cards in the set go straight to
 * their product pages.
 */
const resolveProduct = async (input, delayMs = 1500) => {
    const matchInput = toMatchInput(input);
    const consoleName = (await (0, exports.getConsoleName)(input.setName)) || (0, exports.guessConsoleName)(input.setName);
    if (consoleName && input.cardName) {
        const directUrl = (0, priceChartingClient_1.buildDirectProductUrl)(consoleName, input.cardName, input.cardNumber || undefined);
        try {
            const pageData = await (0, priceChartingClient_1.fetchProductPageData)(directUrl, delayMs);
            if ((0, priceChartingClient_1.verifyProductPage)(pageData, matchInput)) {
                await (0, exports.learnConsoleName)(input.setName, pageData.setName);
                return {
                    match: {
                        productId: pageData.productId,
                        url: directUrl,
                        title: pageData.title,
                        setName: pageData.setName,
                        matchScore: 100,
                    },
                    pageData,
                    direct: true,
                };
            }
        }
        catch (error) {
            logger_1.logger.debug('Direct URL failed, falling back to search', {
                cardName: input.cardName,
                url: directUrl,
                error: error.message,
            });
        }
    }
    const match = await (0, priceChartingClient_1.searchBestProduct)(matchInput, delayMs);
    if (!match)
        return null;
    const pageData = await (0, priceChartingClient_1.fetchProductPageData)(match.url, delayMs);
    if (!(0, priceChartingClient_1.verifyProductPage)(pageData, matchInput)) {
        logger_1.logger.debug('Product page failed verification', { cardName: input.cardName });
        return null;
    }
    await (0, exports.learnConsoleName)(input.setName, match.setName);
    return { match, pageData, direct: false };
};
exports.resolveProduct = resolveProduct;
