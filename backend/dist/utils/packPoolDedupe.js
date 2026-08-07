"use strict";
/**
 * Pack-shop pool identity. Pokemon API ids (pop3-1) and TCGCSV ids
 * (tcgcsv-83891) are often the same physical card with different cardIds.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePackToken = normalizePackToken;
exports.normalizePackNumber = normalizePackNumber;
exports.packCardIdentity = packCardIdentity;
exports.preferPackPoolCard = preferPackPoolCard;
exports.dedupePackPoolCards = dedupePackPoolCards;
function normalizePackToken(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}
function normalizePackNumber(value) {
    const raw = normalizePackToken(value);
    const stripped = raw.replace(/^0+/, '');
    return stripped || raw || '';
}
function packCardIdentity(card) {
    var _a, _b;
    const name = normalizePackToken(card.name);
    const setName = normalizePackToken((_a = card.set) === null || _a === void 0 ? void 0 : _a.name);
    const number = normalizePackNumber(card.number);
    if (name && setName) {
        return `${setName}|${number}|${name}`;
    }
    return card.id || `${normalizePackToken((_b = card.set) === null || _b === void 0 ? void 0 : _b.id)}|${number}|${name}`;
}
function preferPackPoolCard(a, b) {
    var _a, _b, _c, _d;
    const aTcg = String(a.id || '').startsWith('tcgcsv-');
    const bTcg = String(b.id || '').startsWith('tcgcsv-');
    if (aTcg !== bTcg)
        return aTcg ? b : a;
    const aImg = Boolean(((_a = a.images) === null || _a === void 0 ? void 0 : _a.small) || ((_b = a.images) === null || _b === void 0 ? void 0 : _b.large));
    const bImg = Boolean(((_c = b.images) === null || _c === void 0 ? void 0 : _c.small) || ((_d = b.images) === null || _d === void 0 ? void 0 : _d.large));
    if (aImg !== bImg)
        return aImg ? a : b;
    const aPrice = Math.max(a.marketPrice || 0, a.psa10Price || 0);
    const bPrice = Math.max(b.marketPrice || 0, b.psa10Price || 0);
    return bPrice > aPrice ? b : a;
}
function dedupePackPoolCards(cards) {
    const byKey = new Map();
    for (const card of cards) {
        const key = packCardIdentity(card);
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, card);
            continue;
        }
        const winner = preferPackPoolCard(existing, card);
        const psa10Price = winner.psa10Price || existing.psa10Price || card.psa10Price;
        byKey.set(key, psa10Price ? { ...winner, psa10Price } : winner);
    }
    return [...byKey.values()];
}
