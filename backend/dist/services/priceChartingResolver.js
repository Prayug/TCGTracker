"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProduct = exports.learnMatchName = exports.inferCardNumberFromCatalog = exports.guessConsoleName = exports.getConsoleName = exports.learnConsoleName = void 0;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const setPrintFamily_1 = require("../utils/setPrintFamily");
const priceChartingClient_1 = require("./priceChartingClient");
const onePiecePriceCharting_1 = require("./onePiecePriceCharting");
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
/** Persist the learned mapping: our set name + language -> PriceCharting console name. */
const learnConsoleName = async (ourSetName, consoleName, language = 'en') => {
    if (!ourSetName || !consoleName)
        return;
    const lang = (language || 'en').toLowerCase();
    try {
        await run(`INSERT INTO pc_set_mappings (ourSetName, language, consoleName, learnedAt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ourSetName, language) DO UPDATE SET consoleName = excluded.consoleName`, [ourSetName, lang, consoleName, Date.now()]);
    }
    catch (error) {
        logger_1.logger.warn('Failed to learn console name', { error: error.message });
    }
};
exports.learnConsoleName = learnConsoleName;
const getConsoleName = async (ourSetName, language = 'en') => {
    if (!ourSetName)
        return null;
    const lang = (language || 'en').toLowerCase();
    try {
        const rows = await queryAll('SELECT consoleName FROM pc_set_mappings WHERE ourSetName = ? AND language = ?', [ourSetName, lang]);
        return rows.length > 0 ? rows[0].consoleName : null;
    }
    catch (_a) {
        return null;
    }
};
exports.getConsoleName = getConsoleName;
/**
 * Heuristic guess at a set's PriceCharting console name before any real match
 * has been learned. Known exceptions handled explicitly.
 */
const guessConsoleName = (ourSetName, language = 'en', game = 'pokemon') => {
    const name = (ourSetName || '').trim();
    if (!name)
        return null;
    if (game === 'onepiece')
        return (0, onePiecePriceCharting_1.guessOnePieceConsoleName)(name);
    const lang = (language || 'en').toLowerCase();
    if (lang === 'ja') {
        // Seeded mappings cover Japanese display names; when we already have an
        // English set label, prefix with Pokemon Japanese.
        if (/^pokemon\s+japanese\b/i.test(name))
            return name;
        if (/^[a-z0-9&']/i.test(name)) {
            const clean = name.replace(/^pokemon\b/i, '').trim();
            return `Pokemon Japanese ${clean || name}`;
        }
        // Non-ASCII Japanese set names need a learned/seeded mapping.
        return null;
    }
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
    cardName: input.matchName || input.cardName,
    setName: input.setName || undefined,
    cardNumber: input.cardNumber || undefined,
    variant: input.variant || undefined,
    game: input.game || 'pokemon',
    cardImageId: input.cardImageId || undefined,
});
/**
 * TCGCSV SKUs often omit collector numbers. If catalog has exactly one card
 * with this name in the same print family (Hidden Fates vs Shiny Vault), use it.
 */
const inferCardNumberFromCatalog = async (input) => {
    if (input.cardNumber && String(input.cardNumber).trim())
        return input.cardNumber;
    const nameKey = (0, priceChartingClient_1.normalize)(input.matchName || input.cardName);
    if (!nameKey)
        return undefined;
    const lang = (input.language || 'en').toLowerCase();
    try {
        const rows = await queryAll(`SELECT cardNumber, setName FROM catalog_cards
       WHERE (
           REPLACE(REPLACE(LOWER(IFNULL(cardName, '')), '-', ''), ' ', '') = ?
           OR REPLACE(REPLACE(LOWER(IFNULL(matchName, '')), '-', ''), ' ', '') = ?
         )
         AND IFNULL(cardNumber, '') != ''
         AND COALESCE(language, 'en') = ?`, [nameKey, nameKey, lang]);
        const compatible = rows.filter((r) => {
            if ((0, setPrintFamily_1.setLooksLikeSubsetPrint)(r.setName) !== (0, setPrintFamily_1.setLooksLikeSubsetPrint)(input.setName)) {
                return false;
            }
            if (!input.setName)
                return true;
            return (0, setPrintFamily_1.setsSharePrintFamily)(r.setName, input.setName);
        });
        const nums = [
            ...new Set(compatible.map((r) => (0, priceChartingClient_1.normalizeCardNumber)(r.cardNumber)).filter(Boolean)),
        ];
        if (nums.length !== 1)
            return undefined;
        return compatible[0].cardNumber;
    }
    catch (_a) {
        return undefined;
    }
};
exports.inferCardNumberFromCatalog = inferCardNumberFromCatalog;
/** Persist a learned ASCII matchName onto catalog + mappings after a successful PC hit. */
const learnMatchName = async (cardName, setName, productTitle, language = 'ja') => {
    if (!cardName || !productTitle || language !== 'ja')
        return;
    // PriceCharting titles look like "Charizard EX #201 Pokemon Japanese ..."
    const title = productTitle.replace(/\s*#\d+.*$/i, '').replace(/\s+Pokemon\b.*$/i, '').trim();
    if (!title || !/^[a-z0-9]/i.test(title))
        return;
    try {
        await run(`UPDATE catalog_cards SET matchName = ?
       WHERE cardName = ? AND COALESCE(language, 'en') = 'ja'
         AND (matchName IS NULL OR matchName = cardName OR matchName = '')`, [title, cardName]);
        if (setName) {
            await run(`UPDATE card_mappings SET matchName = ?
         WHERE cardName = ? AND setName = ? AND COALESCE(language, 'en') = 'ja'
           AND (matchName IS NULL OR matchName = cardName OR matchName = '')`, [title, cardName, setName]);
        }
    }
    catch (error) {
        logger_1.logger.debug('Failed to learn matchName', { error: error.message });
    }
};
exports.learnMatchName = learnMatchName;
/**
 * Resolve a card to its PriceCharting product: learned console -> direct URL,
 * guessed console -> direct URL, then full search. Direct hits are verified
 * against the parsed page before being trusted. On any success, learns (or
 * confirms) the set's console name so later cards in the set go straight to
 * their product pages.
 */
const resolveProduct = async (input, delayMs = 1500) => {
    const language = (input.language || 'en').toLowerCase();
    const game = input.game || 'pokemon';
    const mappingLang = game === 'onepiece' ? 'onepiece' : language;
    const inferredNumber = game === 'onepiece' ? input.cardNumber : await (0, exports.inferCardNumberFromCatalog)(input);
    const resolvedInput = {
        ...input,
        game,
        language,
        cardNumber: inferredNumber || input.cardNumber,
        matchName: input.matchName || input.cardName,
    };
    const nameForUrl = resolvedInput.matchName || resolvedInput.cardName;
    const consoleName = (await (0, exports.getConsoleName)(resolvedInput.setName, mappingLang)) ||
        (0, exports.guessConsoleName)(resolvedInput.setName, language, game);
    const shouldLearnConsole = (matchInput, matchedSet) => {
        if (game !== 'onepiece')
            return true;
        const family = (0, onePiecePriceCharting_1.expectedOpPrintFamily)(matchInput);
        if ((0, onePiecePriceCharting_1.opFamilyAllowsSetMismatch)(family) && !(0, onePiecePriceCharting_1.opSetNamesMatch)(matchedSet || '', matchInput.setName || '')) {
            return false;
        }
        return true;
    };
    const attemptResolve = async (matchInput, directVariant, finishAliasedToStandard) => {
        if (consoleName && nameForUrl) {
            const directUrl = (0, priceChartingClient_1.buildDirectProductUrl)(consoleName, nameForUrl, resolvedInput.cardNumber || undefined, directVariant, { game });
            try {
                const pageData = await (0, priceChartingClient_1.fetchProductPageData)(directUrl, delayMs);
                if ((0, priceChartingClient_1.verifyProductPage)(pageData, matchInput, directUrl)) {
                    if (shouldLearnConsole(matchInput, pageData.setName)) {
                        await (0, exports.learnConsoleName)(input.setName, pageData.setName, mappingLang);
                    }
                    await (0, exports.learnMatchName)(input.cardName, input.setName, pageData.title, language);
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
                        finishAliasedToStandard,
                    };
                }
            }
            catch (error) {
                logger_1.logger.debug('Direct URL failed, falling back to search', {
                    cardName: nameForUrl,
                    url: directUrl,
                    error: error.message,
                });
            }
        }
        const match = await (0, priceChartingClient_1.searchBestProduct)(matchInput, delayMs);
        if (!match)
            return null;
        const pageData = await (0, priceChartingClient_1.fetchProductPageData)(match.url, delayMs);
        if (!(0, priceChartingClient_1.verifyProductPage)(pageData, matchInput, match.url)) {
            logger_1.logger.debug('Product page failed verification', { cardName: nameForUrl });
            return null;
        }
        if (shouldLearnConsole(matchInput, match.setName)) {
            await (0, exports.learnConsoleName)(input.setName, match.setName, mappingLang);
        }
        await (0, exports.learnMatchName)(input.cardName, input.setName, pageData.title || match.title, language);
        return { match, pageData, direct: false, finishAliasedToStandard };
    };
    const strictInput = toMatchInput(resolvedInput);
    // For JA Pokemon, PC titles use English console names — prefer those for set matching.
    if (game !== 'onepiece' && consoleName && language === 'ja') {
        strictInput.setName = consoleName.replace(/^Pokemon\s+/i, '');
    }
    const strict = await attemptResolve(strictInput, resolvedInput.variant, false);
    if (strict)
        return strict;
    // One Piece reprint families must not fall back to the untagged base SKU.
    if (game === 'onepiece')
        return null;
    const wantFinish = (0, priceChartingClient_1.expectedPcFinishFamily)(resolvedInput.variant);
    if (wantFinish === 'standard')
        return null;
    // Strict finish match failed. Only alias onto the untagged PC product when
    // PriceCharting has no dedicated finish page (Southern Islands, etc.).
    // If a reverse/1st URL exists, never fall back — that was the Wobbuffet bug.
    if (!consoleName || !nameForUrl)
        return null;
    const finishUrl = (0, priceChartingClient_1.buildDirectProductUrl)(consoleName, nameForUrl, resolvedInput.cardNumber || undefined, resolvedInput.variant, { game });
    try {
        const finishHtml = await (0, priceChartingClient_1.fetchPriceChartingHtml)(finishUrl, delayMs);
        if ((0, priceChartingClient_1.isProductPageHtml)(finishHtml)) {
            logger_1.logger.debug('Finish-specific PC product exists; refusing standard alias', {
                cardName: nameForUrl,
                finishUrl,
                wantFinish,
            });
            return null;
        }
    }
    catch (error) {
        logger_1.logger.debug('Finish URL probe failed; attempting standard alias', {
            cardName: nameForUrl,
            finishUrl,
            error: error.message,
        });
    }
    const aliasInput = {
        ...strictInput,
        allowStandardFinishAlias: true,
    };
    logger_1.logger.info('Aliasing graded finish onto untagged PC product', {
        cardName: nameForUrl,
        setName: resolvedInput.setName,
        variant: resolvedInput.variant,
        wantFinish,
    });
    return attemptResolve(aliasInput, undefined, true);
};
exports.resolveProduct = resolveProduct;
