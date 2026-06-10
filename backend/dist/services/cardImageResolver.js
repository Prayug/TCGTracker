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
exports.resolveCardImages = resolveCardImages;
exports.resolveCardImagesCached = resolveCardImagesCached;
exports.clearCardImageResolverCache = clearCardImageResolverCache;
const database_1 = require("../db/database");
const cardImageUtils_1 = require("./cardImageUtils");
const setAliasResolver_1 = require("./setAliasResolver");
const setCodeService_1 = require("./setCodeService");
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().all(sql, params, (err, rows) => {
        if (err)
            reject(err);
        else
            resolve(rows || []);
    });
});
const normalizeCardNumber = (value) => {
    if (!value)
        return '';
    const beforeSlash = value.split('/')[0].trim();
    if (/^\d+$/.test(beforeSlash)) {
        return String(parseInt(beforeSlash, 10));
    }
    return beforeSlash.toLowerCase().replace(/^0+/, '');
};
const pickCatalogRow = (rows, cardNumber) => {
    if (rows.length === 0)
        return null;
    if (rows.length === 1)
        return rows[0];
    if (cardNumber) {
        const requested = normalizeCardNumber(cardNumber);
        const byNumber = rows.find((row) => normalizeCardNumber(row.cardNumber) === requested);
        if (byNumber)
            return byNumber;
    }
    return rows.find((row) => row.imageSmall || row.imageLarge) || rows[0];
};
function findCatalogCard(cardName, setId, setName, cardNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        yield setCodeService_1.setCodeService.initialize();
        const keys = yield (0, setAliasResolver_1.resolveSetSearchKeys)(setId, setName);
        const normalizedSetId = yield setCodeService_1.setCodeService.normalizeSetIdForImageUrl(setId, setName);
        const setIds = new Set(keys.setIds);
        if (normalizedSetId)
            setIds.add(normalizedSetId);
        if (setIds.size === 0)
            return null;
        const placeholders = [...setIds].map(() => '?').join(',');
        const rows = yield dbAll(`SELECT cardNumber, imageSmall, imageLarge
     FROM catalog_cards
     WHERE cardName = ? AND setId IN (${placeholders})`, [cardName, ...setIds]);
        return pickCatalogRow(rows, cardNumber);
    });
}
/** Resolve card images from stored data, local catalog, or deterministic Pokemon TCG URLs. */
function resolveCardImages(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (input.imageSmall || input.imageLarge) {
            return {
                imageSmall: input.imageSmall,
                imageLarge: input.imageLarge || input.imageSmall,
                cardNumber: input.cardNumber,
            };
        }
        const catalogMatch = yield findCatalogCard(input.cardName, input.setId, input.setName, input.cardNumber);
        if ((catalogMatch === null || catalogMatch === void 0 ? void 0 : catalogMatch.imageSmall) || (catalogMatch === null || catalogMatch === void 0 ? void 0 : catalogMatch.imageLarge)) {
            return {
                imageSmall: catalogMatch.imageSmall || catalogMatch.imageLarge || undefined,
                imageLarge: catalogMatch.imageLarge || catalogMatch.imageSmall || undefined,
                cardNumber: input.cardNumber || catalogMatch.cardNumber || undefined,
            };
        }
        const cardNumber = input.cardNumber || (catalogMatch === null || catalogMatch === void 0 ? void 0 : catalogMatch.cardNumber) || undefined;
        const deterministic = yield (0, cardImageUtils_1.buildDeterministicImageUrls)(input.setId, cardNumber, input.setName);
        if (deterministic) {
            return {
                imageSmall: deterministic.small,
                imageLarge: deterministic.large,
                cardNumber,
            };
        }
        return { cardNumber };
    });
}
const batchCache = new Map();
function resolveCardImagesCached(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const cacheKey = `${input.cardName}|${input.setId}|${input.cardNumber || ''}`;
        const cached = batchCache.get(cacheKey);
        if (cached)
            return cached;
        const resolved = yield resolveCardImages(input);
        batchCache.set(cacheKey, resolved);
        return resolved;
    });
}
function clearCardImageResolverCache() {
    batchCache.clear();
}
