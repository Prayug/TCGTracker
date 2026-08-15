"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../../db/database");
const logger_1 = require("../../utils/logger");
const pokemonApiClient_1 = require("../../services/pokemonApiClient");
const cardIdentifier_1 = require("../../services/cardIdentifier");
const cardCache_1 = require("../../services/cardCache");
const cardImageBackfillService_1 = require("../../services/cardImageBackfillService");
const router = (0, express_1.Router)();
function persistMatchedCardRarity(card) {
    var _a;
    const db = (0, database_1.getDb)();
    const setIdNormalized = ((_a = card.set) === null || _a === void 0 ? void 0 : _a.id) || '';
    const cardNumber = card.number || '';
    const resolvedCardName = card.name || '';
    const uniqueIdentifier = (0, cardIdentifier_1.generateUniqueIdentifier)(setIdNormalized, cardNumber, resolvedCardName);
    db.run('UPDATE card_mappings SET rarity = ? WHERE uniqueIdentifier = ?', [card.rarity, uniqueIdentifier], (err) => {
        if (err) {
            logger_1.logger.warn(`Failed to update rarity for ${resolvedCardName}:`, err);
        }
        else {
            logger_1.logger.info(`Updated rarity for ${resolvedCardName}: ${card.rarity}`);
        }
    });
}
function lookupMappedImageRow(cardName, setId) {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.get(`SELECT imageSmall, imageLarge, cardNumber FROM card_mappings
       WHERE cardName = ? AND setId = ?
         AND (imageSmall IS NOT NULL OR imageLarge IS NOT NULL)
       LIMIT 1`, [cardName.trim(), setId.trim()], (err, result) => {
            if (err)
                reject(err);
            else
                resolve(result);
        });
    });
}
function lookupSearchPokemonCache(cardName, setId, cardNumber, setName) {
    const cacheKey = (0, cardCache_1.getCacheKey)(cardName, typeof setId === 'string' && setId.trim().length > 0
        ? setId
        : setName || 'unknown', cardNumber);
    const cached = cardCache_1.cardImageCache.get(cacheKey);
    const hit = cached && Date.now() - cached.timestamp < cardCache_1.CACHE_TTL ? cached : undefined;
    return { cacheKey, hit };
}
function missingPokemonImageJson(searchResult, searched) {
    return {
        error: `Card not found or missing images`,
        searched,
        attempts: searchResult.attempts,
        availableCards: searchResult.candidates.slice(0, 5).map((card) => {
            var _a;
            return ({
                name: card.name,
                set: (_a = card.set) === null || _a === void 0 ? void 0 : _a.id,
                number: card.number,
            });
        }),
    };
}
function buildAndCacheImageMatch(cacheKey, card, searchResult) {
    var _a;
    const responsePayload = {
        card,
        images: {
            small: card.images.small,
            large: card.images.large,
        },
        id: card.id,
        matchedSet: (_a = card.set) === null || _a === void 0 ? void 0 : _a.name,
        matchedNumber: card.number,
        rarity: card.rarity,
        cached: false,
        attempts: searchResult.attempts,
        usedFallback: searchResult.usedFallback,
    };
    cardCache_1.cardImageCache.set(cacheKey, {
        ...responsePayload,
        timestamp: Date.now(),
    });
    return responsePayload;
}
function mappingImagesPayload(row) {
    return {
        images: {
            small: row.imageSmall || row.imageLarge || '',
            large: row.imageLarge || row.imageSmall || '',
        },
        cardNumber: row.cardNumber,
        source: 'card_mappings',
    };
}
function cachedSearchPokemonBody(cached) {
    return {
        card: cached.card,
        images: cached.images,
        id: cached.id,
        matchedSet: cached.matchedSet,
        matchedNumber: cached.matchedNumber,
        cached: true,
    };
}
async function respondUncachedSearchPokemon(res, cacheKey, cardName, setId, setName, cardNumber) {
    var _a, _b, _c, _d;
    const searchResult = await pokemonApiClient_1.pokemonApiClient.findBestImageMatch({
        cardName,
        setId: typeof setId === 'string' ? setId.trim() : undefined,
        setName: typeof setName === 'string' ? setName.trim() : undefined,
        cardNumber: typeof cardNumber === 'string' ? cardNumber.trim() : undefined,
    });
    if (!searchResult.card || !((_a = searchResult.card.images) === null || _a === void 0 ? void 0 : _a.small) || !((_b = searchResult.card.images) === null || _b === void 0 ? void 0 : _b.large)) {
        res.status(404).json(missingPokemonImageJson(searchResult, { cardName, setId, setName, cardNumber }));
        return;
    }
    const responsePayload = buildAndCacheImageMatch(cacheKey, searchResult.card, searchResult);
    logger_1.logger.info(`✅ Matched card: ${searchResult.card.name} from ${(_c = searchResult.card.set) === null || _c === void 0 ? void 0 : _c.name} (#${searchResult.card.number})`);
    // Update rarity in database if available
    if (((_d = searchResult.card) === null || _d === void 0 ? void 0 : _d.rarity) && searchResult.card.rarity.trim()) {
        persistMatchedCardRarity(searchResult.card);
    }
    res.json(responsePayload);
}
/**
 * Read persisted card images from card_mappings (populated by the image backfill pipeline).
 */
router.get('/resolve-image', async (req, res) => {
    try {
        const { cardId, cardName, setId } = req.query;
        if (cardId && typeof cardId === 'string') {
            const stored = await (0, cardImageBackfillService_1.getCardMappingImages)(cardId);
            if ((stored === null || stored === void 0 ? void 0 : stored.imageSmall) || (stored === null || stored === void 0 ? void 0 : stored.imageLarge)) {
                return res.json(mappingImagesPayload(stored));
            }
        }
        if (!cardName || typeof cardName !== 'string' || !setId || typeof setId !== 'string') {
            return res.status(400).json({
                error: 'Provide cardId, or both cardName and setId',
            });
        }
        const row = await lookupMappedImageRow(cardName, setId);
        if (!row) {
            return res.status(404).json({
                error: 'No persisted image found for this card',
                searched: { cardId, cardName, setId },
            });
        }
        res.json(mappingImagesPayload(row));
    }
    catch (error) {
        logger_1.logger.error('Error reading card image:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});
/**
 * Search Pokemon API for card images (proxy endpoint to avoid CORS)
 */
router.get('/search-pokemon', async (req, res) => {
    try {
        const { cardName, setId, cardNumber, setName } = req.query;
        if (!cardName || typeof cardName !== 'string') {
            return res.status(400).json({
                error: 'cardName query parameter is required',
            });
        }
        const { cacheKey, hit: cached } = lookupSearchPokemonCache(cardName, setId, cardNumber, setName);
        if (cached) {
            logger_1.logger.info(`💾 Cache hit for ${cardName} from ${setId || setName || 'unknown set'}`);
            return res.json(cachedSearchPokemonBody(cached));
        }
        await respondUncachedSearchPokemon(res, cacheKey, cardName, setId, setName, cardNumber);
    }
    catch (error) {
        logger_1.logger.error('Error searching Pokemon API:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});
exports.default = router;
