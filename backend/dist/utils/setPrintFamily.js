"use strict";
/**
 * Distinguishes main-set printings from subset/secret printings of the same
 * card name (Hidden Fates #9 vs Shiny Vault SV49, Trainer Gallery, etc.).
 *
 * PriceCharting often files both under the parent console ("Pokemon Hidden Fates"),
 * so set-name overlap is not enough — we need the collector-number family.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setsSharePrintFamily = exports.setBaseKey = exports.numberLooksSecretRare = exports.setLooksLikeSubsetPrint = void 0;
const SUBSET_PRINT_RE = /shiny\s*vault|trainer\s*gallery|galarian\s*gallery|(?:pokemon|pokémon)\s*gallery/i;
const setLooksLikeSubsetPrint = (setName) => SUBSET_PRINT_RE.test(setName || '');
exports.setLooksLikeSubsetPrint = setLooksLikeSubsetPrint;
/** SV49, TG03, GG44, SWSH001 — letter-prefixed collector numbers. */
const numberLooksSecretRare = (cardNumber) => {
    const n = (cardNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!n)
        return false;
    return /^[a-z]+/.test(n);
};
exports.numberLooksSecretRare = numberLooksSecretRare;
const setBaseKey = (setName) => (setName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(SUBSET_PRINT_RE, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
exports.setBaseKey = setBaseKey;
/**
 * True when two labels refer to the same print family: both main-set or both
 * the same kind of subset. "Hidden Fates" must not match "Hidden Fates Shiny Vault".
 */
const setsSharePrintFamily = (a, b) => {
    if (!a || !b)
        return false;
    if ((0, exports.setLooksLikeSubsetPrint)(a) !== (0, exports.setLooksLikeSubsetPrint)(b))
        return false;
    const ka = (0, exports.setBaseKey)(a);
    const kb = (0, exports.setBaseKey)(b);
    if (!ka || !kb)
        return false;
    if (ka === kb)
        return true;
    if (ka.includes(kb) || kb.includes(ka))
        return true;
    const tokens = (s) => s.split(' ').filter((t) => t.length > 2 && !['the', 'and', 'pokemon'].includes(t));
    const ta = new Set(tokens(ka));
    const tb = tokens(kb);
    if (tb.length === 0)
        return false;
    const overlap = tb.filter((t) => ta.has(t)).length;
    return overlap >= Math.min(2, tb.length);
};
exports.setsSharePrintFamily = setsSharePrintFamily;
