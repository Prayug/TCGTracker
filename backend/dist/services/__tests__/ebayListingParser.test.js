"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ebayListingParser_1 = require("../ebayListingParser");
const ebayDealMatcher_1 = require("../ebayDealMatcher");
const umbreonEn = {
    cardId: 'swsh7-215',
    cardName: 'Umbreon VMAX',
    setId: 'swsh7',
    setName: 'Evolving Skies',
    cardNumber: '215/203',
    rarity: 'Secret Rare',
    variantKey: 'holofoil',
    uniqueIdentifier: 'swsh7|215|umbreonvmax|holofoil',
    language: 'en',
};
const umbreonJa = {
    cardId: 's6a-095',
    cardName: 'ブラッキーVMAX',
    matchName: 'Umbreon VMAX',
    setId: 's6a',
    setName: 'Eevee Heroes',
    cardNumber: '095/069',
    variantKey: 'holofoil',
    uniqueIdentifier: 'ja|s6a|095|umbreonvmax|holofoil',
    language: 'ja',
};
describe('parseEbayListingTitle', () => {
    it('parses a PSA 10 Evolving Skies Umbreon', () => {
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)('PSA 10 Umbreon VMAX 215 Evolving Skies Pokemon');
        expect(parsed.isGraded).toBe(true);
        expect(parsed.grade).toEqual({ grader: 'psa', grade: '10' });
        expect(parsed.collectorNumber).toBe('215');
    });
    it('parses a raw alt-art with a fraction number', () => {
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)('Pokemon Umbreon VMAX Alt Art 215/203 Evolving Skies NM');
        expect(parsed.isGraded).toBe(false);
        expect(parsed.cardNumber).toBe('215/203');
        expect(parsed.collectorNumber).toBe('215');
    });
    it('detects Japanese Moonbreon listings', () => {
        var _a;
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)('Japanese Moonbreon Eevee Heroes PSA 10');
        expect(parsed.language).toBe('ja');
        expect((_a = parsed.grade) === null || _a === void 0 ? void 0 : _a.grader).toBe('psa');
    });
    it('parses One Piece card numbers', () => {
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)('One Piece OP09-118 Monkey D Luffy Alternate Art PSA 10');
        expect(parsed.onePieceNumber).toBe('OP09-118');
        expect(parsed.language).toBe('unknown');
    });
    it('normalizes hyphenated One Piece numbers', () => {
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)('One Piece OP-09-118 Luffy Japanese');
        expect(parsed.onePieceNumber).toBe('OP09-118');
        expect(parsed.language).toBe('ja');
    });
    it('detects Japanese One Piece listings that share English set codes', () => {
        expect((0, ebayListingParser_1.parseEbayListingTitle)('OP09-118 Luffy JP').language).toBe('ja');
        expect((0, ebayListingParser_1.parseEbayListingTitle)('One Piece OP09-118 Monkey D Luffy JPN ver').language).toBe('ja');
        expect((0, ebayListingParser_1.parseEbayListingTitle)('OP09-118 Luffy JAP version').language).toBe('ja');
        expect((0, ebayListingParser_1.parseEbayListingTitle)('ワンピース OP09-118 ルフィ').language).toBe('ja');
        expect((0, ebayListingParser_1.parseEbayListingTitle)('【PSA10】モンキー・D・ルフィ OP09-118').language).toBe('ja');
    });
    it('detects JP glued to a One Piece card number', () => {
        expect((0, ebayListingParser_1.parseEbayListingTitle)('One Piece OP09-118JP Luffy Alternate Art').language).toBe('ja');
    });
    it('detects Asian English One Piece listings', () => {
        expect((0, ebayListingParser_1.parseEbayListingTitle)('One Piece OP09-118 Luffy Asian English').language).toBe('other');
        expect((0, ebayListingParser_1.parseEbayListingTitle)('OP09-118 Luffy AE ver PSA 10').language).toBe('other');
    });
    it('keeps explicit English One Piece listings even when shipped from Japan', () => {
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)('One Piece OP09-118 Luffy English Alternate Art', null, {
            itemCountry: 'JP',
        });
        expect(parsed.language).toBe('en');
    });
    it('treats unlabeled Japan-shipped One Piece listings as Japanese', () => {
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)('One Piece OP09-118 Monkey D Luffy Alternate Art', null, {
            itemCountry: 'JP',
        });
        expect(parsed.language).toBe('ja');
    });
});
describe('risk flags', () => {
    it('flags proxy, lot, digital, and damaged language', () => {
        expect((0, ebayListingParser_1.detectListingRiskFlags)('Umbreon VMAX proxy PSA 10')).toContain('possible_proxy_card');
        expect((0, ebayListingParser_1.detectListingRiskFlags)('Lot of 10 Umbreon VMAX')).toContain('possible_lot');
        expect((0, ebayListingParser_1.detectListingRiskFlags)('Pokemon TCG Live digital code card')).toContain('possible_digital_item');
        expect((0, ebayListingParser_1.detectListingRiskFlags)('Umbreon VMAX damaged creased')).toContain('possible_damaged');
    });
});
describe('listing match against canonical cards', () => {
    it('matches the English Evolving Skies printing', () => {
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)('Pokemon Umbreon VMAX Alt Art 215/203 Evolving Skies NM');
        const match = (0, ebayDealMatcher_1.scoreListingAgainstCard)('Pokemon Umbreon VMAX Alt Art 215/203 Evolving Skies NM', parsed, umbreonEn);
        expect(match).not.toBeNull();
        expect(match.evidence).toEqual(expect.arrayContaining(['exact_card_number', 'set_match', 'name_match']));
        expect(match.confidence).toBeGreaterThanOrEqual(0.7);
    });
    it('does not silently match a Japanese listing to the English card', () => {
        const title = 'Japanese Moonbreon Eevee Heroes PSA 10 095/069';
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)(title);
        const enMatch = (0, ebayDealMatcher_1.scoreListingAgainstCard)(title, parsed, umbreonEn);
        expect(enMatch).toBeNull();
        const jaMatch = (0, ebayDealMatcher_1.scoreListingAgainstCard)(title, parsed, umbreonJa);
        expect(jaMatch).not.toBeNull();
        expect(jaMatch.card.language).toBe('ja');
    });
    it('does not attach an unlabeled listing to a Japanese catalog card', () => {
        const title = 'Pokemon Umbreon VMAX 095/069';
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)(title);
        expect(parsed.language).toBe('unknown');
        expect((0, ebayDealMatcher_1.scoreListingAgainstCard)(title, parsed, umbreonJa)).toBeNull();
    });
    it('treats CJK titles as Japanese', () => {
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)('ポケモンカード ブラッキーVMAX PSA 10');
        expect(parsed.language).toBe('ja');
    });
    it('does not pick the English card when both printings are candidates', () => {
        const title = 'Japanese Moonbreon Eevee Heroes PSA 10 095/069';
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)(title);
        const best = (0, ebayDealMatcher_1.pickBestListingMatch)(title, parsed, [umbreonEn, umbreonJa]);
        expect(best === null || best === void 0 ? void 0 : best.card.cardId).toBe('s6a-095');
    });
});
const luffyEn = {
    cardId: 'op09-118',
    cardName: 'Monkey D. Luffy',
    setId: 'op09',
    setName: 'Emperors in the New World',
    cardNumber: 'OP09-118',
    variantKey: 'normal',
    uniqueIdentifier: 'op09-118',
    language: 'en',
};
describe('One Piece listings vs English comps', () => {
    it('does not score a Japanese OP listing against the English catalog card', () => {
        const title = 'One Piece OP09-118 Monkey D Luffy JP Alternate Art';
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)(title);
        expect(parsed.language).toBe('ja');
        expect((0, ebayDealMatcher_1.scoreListingAgainstCard)(title, parsed, luffyEn)).toBeNull();
    });
    it('does not score Asian English OP listings against English comps', () => {
        const title = 'One Piece OP09-118 Luffy Asian English Emperors in the New World';
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)(title);
        expect(parsed.language).toBe('other');
        expect((0, ebayDealMatcher_1.scoreListingAgainstCard)(title, parsed, luffyEn)).toBeNull();
    });
    it('still matches unlabeled English-market OP listings', () => {
        const title = 'One Piece OP09-118 Monkey D Luffy Alternate Art Emperors in the New World';
        const parsed = (0, ebayListingParser_1.parseEbayListingTitle)(title);
        expect(parsed.language).toBe('unknown');
        expect((0, ebayDealMatcher_1.scoreListingAgainstCard)(title, parsed, luffyEn)).not.toBeNull();
    });
});
