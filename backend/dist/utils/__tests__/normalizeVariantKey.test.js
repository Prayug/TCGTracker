"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const normalizeVariantKey_1 = require("../normalizeVariantKey");
describe('canonicalFinishVariantKey', () => {
    it('keeps real finishes', () => {
        expect((0, normalizeVariantKey_1.canonicalFinishVariantKey)('Reverse Holofoil')).toBe('reverseholofoil');
        expect((0, normalizeVariantKey_1.canonicalFinishVariantKey)('holofoil')).toBe('holofoil');
    });
    it('maps Cardmarket channel names onto finishes', () => {
        expect((0, normalizeVariantKey_1.canonicalFinishVariantKey)('cardmarket')).toBe('normal');
        expect((0, normalizeVariantKey_1.canonicalFinishVariantKey)('cardmarket-holo')).toBe('holofoil');
        expect((0, normalizeVariantKey_1.normalizeVariantKey)('cardmarket-holo')).toBe('cardmarketholo');
    });
});
