"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const slabPredictionEngine_1 = require("../slabPredictionEngine");
describe('preferCatalogOverTcgcsv', () => {
    it('keeps the catalog id when a tcgcsv SKU shares the same product', () => {
        var _a, _b;
        const rows = [
            { cardId: 'tcgcsv-197651', productId: '964029' },
            { cardId: 'sm115-9', productId: '964029' },
            { cardId: 'sv3-199', productId: '111' },
        ];
        const unique = (0, slabPredictionEngine_1.preferCatalogOverTcgcsv)(rows);
        expect(unique).toHaveLength(2);
        expect((_a = unique.find((r) => r.productId === '964029')) === null || _a === void 0 ? void 0 : _a.cardId).toBe('sm115-9');
        expect((_b = unique.find((r) => r.productId === '111')) === null || _b === void 0 ? void 0 : _b.cardId).toBe('sv3-199');
    });
    it('keeps rows without a product id', () => {
        const rows = [
            { cardId: 'a', productId: null },
            { cardId: 'b', productId: undefined },
        ];
        expect((0, slabPredictionEngine_1.preferCatalogOverTcgcsv)(rows)).toHaveLength(2);
    });
});
describe('slabUid', () => {
    it('namespaces PSA 10 series by card id', () => {
        expect((0, slabPredictionEngine_1.slabUid)('sm115-9')).toBe('slab:psa10:sm115-9');
    });
});
describe('slab universe gates', () => {
    it('does not require more calendar span than a week of nightly snapshots', () => {
        expect(slabPredictionEngine_1.SLAB_MIN_DATA_POINTS).toBeGreaterThanOrEqual(3);
        expect(slabPredictionEngine_1.SLAB_MIN_SPAN_DAYS).toBeLessThanOrEqual(7);
    });
});
