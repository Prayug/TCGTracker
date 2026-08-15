"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const setPrintFamily_1 = require("../setPrintFamily");
describe('setPrintFamily', () => {
    it('treats Shiny Vault / Trainer Gallery as subset prints', () => {
        expect((0, setPrintFamily_1.setLooksLikeSubsetPrint)('Hidden Fates')).toBe(false);
        expect((0, setPrintFamily_1.setLooksLikeSubsetPrint)('Pokemon Hidden Fates')).toBe(false);
        expect((0, setPrintFamily_1.setLooksLikeSubsetPrint)('Hidden Fates Shiny Vault')).toBe(true);
        expect((0, setPrintFamily_1.setLooksLikeSubsetPrint)('Hidden Fates: Shiny Vault')).toBe(true);
        expect((0, setPrintFamily_1.setLooksLikeSubsetPrint)('Brilliant Stars Trainer Gallery')).toBe(true);
    });
    it('detects letter-prefixed collector numbers', () => {
        expect((0, setPrintFamily_1.numberLooksSecretRare)('9')).toBe(false);
        expect((0, setPrintFamily_1.numberLooksSecretRare)('212')).toBe(false);
        expect((0, setPrintFamily_1.numberLooksSecretRare)('SV49')).toBe(true);
        expect((0, setPrintFamily_1.numberLooksSecretRare)('sv49')).toBe(true);
        expect((0, setPrintFamily_1.numberLooksSecretRare)('TG03')).toBe(true);
        expect((0, setPrintFamily_1.numberLooksSecretRare)('GG44')).toBe(true);
    });
    it('does not treat parent Hidden Fates as the Shiny Vault set', () => {
        expect((0, setPrintFamily_1.setsSharePrintFamily)('Hidden Fates', 'Hidden Fates Shiny Vault')).toBe(false);
        expect((0, setPrintFamily_1.setsSharePrintFamily)('Pokemon Hidden Fates', 'Hidden Fates')).toBe(true);
        expect((0, setPrintFamily_1.setsSharePrintFamily)('Hidden Fates: Shiny Vault', 'Hidden Fates Shiny Vault')).toBe(true);
    });
});
