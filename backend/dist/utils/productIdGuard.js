"use strict";
/**
 * Guards against TCGdex/TCGPlayer productId collisions across print families
 * (Trainer Gallery / Shiny Vault / Galarian Gallery vs main set).
 *
 * Upstream providers often return the main-set SKU for a subset card that shares
 * a name (Mimikyu V TG16 → Brilliant Stars #68). Trusting that productId
 * overwrites mappings and stitches the cheap main-set price series onto the
 * expensive subset uniqueIdentifier.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProductIdFromOwners = exports.productIdConflictsWithPrintFamily = exports.cardLooksLikeSubsetPrint = exports.normalizeCardNameKey = exports.normalizeCollectorNumber = void 0;
const setPrintFamily_1 = require("./setPrintFamily");
const normalizeCollectorNumber = (cardNumber) => (cardNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
exports.normalizeCollectorNumber = normalizeCollectorNumber;
const normalizeCardNameKey = (cardName) => (cardName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
exports.normalizeCardNameKey = normalizeCardNameKey;
/** True when this catalog row is a subset/secret printing family. */
const cardLooksLikeSubsetPrint = (setName, cardNumber) => (0, setPrintFamily_1.setLooksLikeSubsetPrint)(setName) || (0, setPrintFamily_1.numberLooksSecretRare)(cardNumber);
exports.cardLooksLikeSubsetPrint = cardLooksLikeSubsetPrint;
/**
 * A productId is incompatible when it is already owned by a mapping in a
 * different print family (main set vs Trainer Gallery, etc.).
 */
const productIdConflictsWithPrintFamily = (productId, setName, owners) => {
    if (productId == null || !Number.isFinite(productId) || productId <= 0)
        return false;
    if (!setName || owners.length === 0)
        return false;
    return owners.some((owner) => {
        if (!owner.setName)
            return false;
        return !(0, setPrintFamily_1.setsSharePrintFamily)(owner.setName, setName);
    });
};
exports.productIdConflictsWithPrintFamily = productIdConflictsWithPrintFamily;
/**
 * Pick the single TCGCSV productId that matches name + collector number + print family.
 */
const resolveProductIdFromOwners = (cardName, setName, cardNumber, candidates) => {
    const nameKey = (0, exports.normalizeCardNameKey)(cardName);
    const numKey = (0, exports.normalizeCollectorNumber)(cardNumber);
    if (!nameKey || !numKey)
        return null;
    const matches = candidates.filter((c) => {
        if ((0, exports.normalizeCardNameKey)(c.cardName) !== nameKey)
            return false;
        if ((0, exports.normalizeCollectorNumber)(c.cardNumber) !== numKey)
            return false;
        if (!(0, setPrintFamily_1.setsSharePrintFamily)(c.setName, setName))
            return false;
        return Number.isFinite(c.productId) && c.productId > 0;
    });
    const ids = [...new Set(matches.map((m) => m.productId))];
    return ids.length === 1 ? ids[0] : null;
};
exports.resolveProductIdFromOwners = resolveProductIdFromOwners;
