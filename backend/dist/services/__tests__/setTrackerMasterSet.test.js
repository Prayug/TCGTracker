"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const setTrackerService_1 = require("../setTrackerService");
describe('isReverseFinish', () => {
    it('detects common reverse key forms', () => {
        expect((0, setTrackerService_1.isReverseFinish)('reverseHolofoil', 'normal')).toBe(true);
        expect((0, setTrackerService_1.isReverseFinish)('Reverse Holofoil', 'normal')).toBe(true);
        expect((0, setTrackerService_1.isReverseFinish)('normal', 'reverseholofoil')).toBe(true);
        expect((0, setTrackerService_1.isReverseFinish)('holofoil', 'holofoil')).toBe(false);
        expect((0, setTrackerService_1.isReverseFinish)('normal', 'normal')).toBe(false);
    });
});
describe('extractReversePriceFromVariants', () => {
    it('reads reverseHolofoil market from catalog JSON', () => {
        const price = (0, setTrackerService_1.extractReversePriceFromVariants)({
            normal: { market: 0.14, low: 0.01, mid: 0.17, high: 1 },
            reverseHolofoil: { market: 0.26, low: 0.03, mid: 0.26, high: 1 },
        });
        expect(price).toBe(0.26);
    });
    it('returns null when no reverse listing exists', () => {
        expect((0, setTrackerService_1.extractReversePriceFromVariants)({
            normal: { market: 0.14 },
            holofoil: { market: 1.2 },
        })).toBeNull();
    });
});
const card = (partial) => {
    var _a, _b, _c, _d;
    return ({
        name: partial.name || partial.id,
        number: partial.number || '1',
        reverseMarketPrice: (_a = partial.reverseMarketPrice) !== null && _a !== void 0 ? _a : 0,
        hasPriceData: ((_b = partial.marketPrice) !== null && _b !== void 0 ? _b : 0) > 0,
        priceSource: (_c = partial.priceSource) !== null && _c !== void 0 ? _c : 'market_sync',
        priceDate: (_d = partial.priceDate) !== null && _d !== void 0 ? _d : '2026-08-04',
        images: { small: '', large: '' },
        set: {
            id: 'sv8',
            name: 'Surging Sparks',
            releaseDate: '2024-11-08',
            total: 2,
        },
        ...partial,
    });
};
describe('computeSetSummary master set', () => {
    it('adds reverse holos on top of the checklist total', () => {
        const summary = (0, setTrackerService_1.computeSetSummary)([
            card({ id: 'sv8-1', marketPrice: 0.14, reverseMarketPrice: 0.26 }),
            card({ id: 'sv8-2', marketPrice: 10, reverseMarketPrice: 0 }),
        ], new Set(['sv8-1']), new Set());
        expect(summary.checklistValue).toBeCloseTo(10.14);
        expect(summary.reverseHoloValue).toBeCloseTo(0.26);
        expect(summary.reverseHoloCount).toBe(1);
        expect(summary.masterSetValue).toBeCloseTo(10.4);
        expect(summary.ownedValue).toBeCloseTo(0.14);
        expect(summary.costToComplete).toBeCloseTo(10);
        expect(summary.missingReverseValue).toBe(0);
    });
    it('includes missing reverse finishes in master-set cost-to-complete', () => {
        const summary = (0, setTrackerService_1.computeSetSummary)([
            card({ id: 'sv8-1', marketPrice: 0.14, reverseMarketPrice: 0.26 }),
            card({ id: 'sv8-2', marketPrice: 10, reverseMarketPrice: 2 }),
        ], new Set(['sv8-1']), new Set(), { ownedReverseIds: new Set(['sv8-1']), includeReverseInCost: true });
        // Missing primary: sv8-2 ($10). Missing reverse: sv8-2 ($2). Owned reverse counted in ownedValue.
        expect(summary.ownedValue).toBeCloseTo(0.14 + 0.26);
        expect(summary.ownedReverseCount).toBe(1);
        expect(summary.missingReverseValue).toBeCloseTo(2);
        expect(summary.costToComplete).toBeCloseTo(12);
    });
});
