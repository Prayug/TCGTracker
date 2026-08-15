"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@tcgtracker/shared");
/**
 * Jest contract: backend must resolve the same shared module the frontend
 * Vitest suite exercises. If these drift, FE/BE charts and pack bands diverge.
 */
describe('@tcgtracker/shared jest contract', () => {
    it('normalizes finishes the same way as the backend wrappers', () => {
        expect((0, shared_1.normalizeVariantKey)('Reverse Holofoil')).toBe('reverseholofoil');
        expect((0, shared_1.canonicalFinishVariantKey)('cardmarket-holo')).toBe('holofoil');
    });
    it('scores variants without reverse-holo bleed', () => {
        expect((0, shared_1.scoreVariantMatch)('holofoil', 'Reverse Holofoil')).toBe(0);
        expect((0, shared_1.scoreVariantMatch)('holofoil', '1stEditionHolofoil')).toBe(2);
    });
    it('detects CJK queries', () => {
        expect((0, shared_1.queryContainsCjk)('リザードン')).toBe(true);
    });
    it('resolves listing prices without ask-wall mids', () => {
        expect((0, shared_1.resolveListingPrice)({ market: 1150, mid: 19999.99, low: 749.99, high: 21999.99 })).toBe(1150);
    });
    it('classifies eras and pack bands', () => {
        expect((0, shared_1.classifySetEra)({ id: 'svp', name: 'SV Black Star Promos' })).toBe('sv');
        expect((0, shared_1.packEraBandFromSet)({ id: 'swsh1', name: 'Sword & Shield' })).toBe('modern');
    });
});
