"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const gradeWorthinessService_1 = require("../gradeWorthinessService");
(0, vitest_1.describe)('grade worthiness image name normalization', () => {
    (0, vitest_1.it)('folds accents and hyphens', () => {
        (0, vitest_1.expect)((0, gradeWorthinessService_1.normalizeName)('Pokémon GO')).toBe('pokemon go');
        (0, vitest_1.expect)((0, gradeWorthinessService_1.normalizeName)('Charizard-GX')).toBe('charizard gx');
        (0, vitest_1.expect)((0, gradeWorthinessService_1.normalizeName)('Charizard GX')).toBe('charizard gx');
        (0, vitest_1.expect)((0, gradeWorthinessService_1.normalizeName)('Hidden Fates: Shiny Vault')).toBe('hidden fates shiny vault');
    });
    (0, vitest_1.it)('strips TCGCSV era prefixes from set labels', () => {
        (0, vitest_1.expect)((0, gradeWorthinessService_1.normalizeSetKey)('SM - Celestial Storm')).toBe('celestial storm');
        (0, vitest_1.expect)((0, gradeWorthinessService_1.normalizeSetKey)('SWSH - Evolving Skies')).toBe('evolving skies');
        (0, vitest_1.expect)((0, gradeWorthinessService_1.normalizeSetKey)('Hidden Fates')).toBe('hidden fates');
        (0, vitest_1.expect)((0, gradeWorthinessService_1.normalizeSetKey)('Pokemon GO')).toBe('pokemon go');
    });
});
