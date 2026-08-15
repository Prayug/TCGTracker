"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cardCondition_1 = require("../cardCondition");
describe('parseRawCardCondition', () => {
    it('reads Near Mint from the title', () => {
        const parsed = (0, cardCondition_1.parseRawCardCondition)({
            title: 'Pokemon Umbreon VMAX 215/203 Evolving Skies NM',
            ebayCondition: 'Ungraded',
        });
        expect(parsed.condition).toBe('nm');
        expect(parsed.factor).toBe(1);
    });
    it('reads Lightly Played from the title', () => {
        expect((0, cardCondition_1.parseRawCardCondition)({ title: 'Charizard 4/102 Base Set Lightly Played' }).condition).toBe('lp');
    });
    it('does not treat Base Set HP as Heavily Played', () => {
        expect((0, cardCondition_1.parseRawCardCondition)({ title: 'Pokemon Charizard 4/102 Base Set HP Holo' }).condition).toBe('unknown');
    });
    it('reads Heavily Played from the full phrase', () => {
        expect((0, cardCondition_1.parseRawCardCondition)({ title: 'Charizard 4/102 Base Set Heavily Played holo' }).condition).toBe('hp');
    });
    it('uses eBay Very Good as LP when the title is silent', () => {
        expect((0, cardCondition_1.parseRawCardCondition)({
            title: 'Pokemon Charizard 4/102 Base Set',
            ebayCondition: 'Very Good',
            ebayConditionId: '4000',
        }).condition).toBe('lp');
    });
    it('prefers title LP over eBay New', () => {
        expect((0, cardCondition_1.parseRawCardCondition)({
            title: 'Pikachu 25/102 Lightly Played',
            ebayCondition: 'New',
            ebayConditionId: '1000',
        }).condition).toBe('lp');
    });
    it('reads a card-condition descriptor', () => {
        expect((0, cardCondition_1.parseRawCardCondition)({
            title: 'Pokemon Umbreon VMAX 215 Evolving Skies',
            conditionDescriptors: ['Card Condition: Moderately Played'],
        }).condition).toBe('mp');
    });
});
describe('applyConditionToNmMarket', () => {
    it('leaves NM marks unchanged', () => {
        const nm = (0, cardCondition_1.parseRawCardCondition)({ title: 'Umbreon NM' });
        expect((0, cardCondition_1.applyConditionToNmMarket)(100, nm)).toEqual({
            marketValue: 100,
            nmMarketValue: 100,
            factor: 1,
        });
    });
    it('haircuts LP to 70% of the NM mark', () => {
        const lp = (0, cardCondition_1.parseRawCardCondition)({ title: 'Umbreon Lightly Played' });
        expect((0, cardCondition_1.applyConditionToNmMarket)(100, lp).marketValue).toBe(70);
    });
    it('does not treat an LP listing at 80% of NM as a 20% deal', () => {
        const lp = (0, cardCondition_1.parseRawCardCondition)({ title: 'Umbreon Lightly Played' });
        const adjusted = (0, cardCondition_1.applyConditionToNmMarket)(100, lp);
        expect(adjusted.marketValue).toBe(70);
        expect(80 < adjusted.marketValue).toBe(false);
    });
});
describe('formatRawGradeLabel', () => {
    it('keeps unknown raw listings unlabeled', () => {
        expect((0, cardCondition_1.formatRawGradeLabel)((0, cardCondition_1.parseRawCardCondition)({ title: 'Umbreon VMAX 215' }))).toBe('Raw');
    });
    it('shows LP on the raw badge', () => {
        expect((0, cardCondition_1.formatRawGradeLabel)((0, cardCondition_1.parseRawCardCondition)({ title: 'Umbreon Lightly Played' }))).toBe('Raw · LP');
    });
});
