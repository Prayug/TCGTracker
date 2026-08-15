"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMatchName = exports.buildMatchNameFromDex = void 0;
const pokedexEnNames_1 = require("./pokedexEnNames");
/**
 * Build an ASCII matchName for Japanese cards from dexId + TCGdex suffix.
 * Falls back to null when we cannot derive a usable English name.
 */
const buildMatchNameFromDex = (dexId, suffix, category) => {
    const id = Array.isArray(dexId) ? dexId[0] : dexId;
    const base = (0, pokedexEnNames_1.getPokedexEnglishName)(id);
    if (!base)
        return null;
    // Trainers / Energy shouldn't get a Pokemon species name.
    if (category && /trainer|energy/i.test(category) && !suffix) {
        return null;
    }
    const suffixPart = (suffix || '').trim();
    if (!suffixPart)
        return base;
    // Modern TCG often prints "ex" (lowercase); older eras use "EX".
    if (suffixPart === 'EX' || suffixPart === 'GX' || suffixPart === 'V' || suffixPart === 'VMAX' || suffixPart === 'VSTAR') {
        return `${base} ${suffixPart}`;
    }
    if (/^ex$/i.test(suffixPart))
        return `${base} ex`;
    return `${base} ${suffixPart}`;
};
exports.buildMatchNameFromDex = buildMatchNameFromDex;
/** Prefer an existing matchName; otherwise derive from dex + suffix. */
const resolveMatchName = (opts) => {
    var _a;
    if ((_a = opts.matchName) === null || _a === void 0 ? void 0 : _a.trim())
        return opts.matchName.trim();
    if ((opts.language || 'en') !== 'ja') {
        return (opts.cardName || '').trim();
    }
    const derived = (0, exports.buildMatchNameFromDex)(opts.dexId, opts.suffix, opts.category);
    return derived || (opts.cardName || '').trim();
};
exports.resolveMatchName = resolveMatchName;
