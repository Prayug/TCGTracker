"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const variantMatch_1 = require("../variantMatch");
describe('scoreVariantMatch', () => {
    it('scores exact finish matches highest', () => {
        expect((0, variantMatch_1.scoreVariantMatch)('holofoil', 'Holofoil')).toBe(3);
        expect((0, variantMatch_1.scoreVariantMatch)('reverseHolofoil', 'Reverse Holofoil')).toBe(3);
    });
    it('does not let reverseHolofoil match preferred holofoil', () => {
        // Regression: row.includes('holofoil') was true for reverseholofoil and
        // bled Expedition / Legendary reverse history into holo charts.
        expect((0, variantMatch_1.scoreVariantMatch)('holofoil', 'Reverse Holofoil')).toBe(0);
        expect((0, variantMatch_1.scoreVariantMatch)('holofoil', 'reverseHolofoil')).toBe(0);
    });
    it('still matches 1st edition / unlimited holo to holofoil', () => {
        expect((0, variantMatch_1.scoreVariantMatch)('holofoil', '1stEditionHolofoil')).toBe(2);
        expect((0, variantMatch_1.scoreVariantMatch)('holofoil', 'unlimitedHolofoil')).toBe(2);
    });
    it('matches reverse family together', () => {
        expect((0, variantMatch_1.scoreVariantMatch)('reverseHolofoil', 'Reverse Holo')).toBe(2);
    });
    it('does not match holofoil into reverse preference', () => {
        expect((0, variantMatch_1.scoreVariantMatch)('reverseHolofoil', 'Holofoil')).toBe(0);
    });
    it('maps Cardmarket channel labels onto the matching finish', () => {
        expect((0, variantMatch_1.scoreVariantMatch)('holofoil', 'cardmarket-holo')).toBe(2);
        expect((0, variantMatch_1.scoreVariantMatch)('holofoil', 'cardmarket')).toBe(0);
        expect((0, variantMatch_1.scoreVariantMatch)('normal', 'cardmarket')).toBe(2);
        expect((0, variantMatch_1.scoreVariantMatch)('reverseHolofoil', 'cardmarket-holo')).toBe(0);
    });
});
