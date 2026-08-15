"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const productIdGuard_1 = require("../productIdGuard");
const cardIdentifier_1 = require("../../services/cardIdentifier");
describe('productIdGuard', () => {
    it('detects Trainer Gallery / letter-prefix subset prints', () => {
        expect((0, productIdGuard_1.cardLooksLikeSubsetPrint)('Brilliant Stars Trainer Gallery', 'TG16')).toBe(true);
        expect((0, productIdGuard_1.cardLooksLikeSubsetPrint)('Brilliant Stars', '68')).toBe(false);
        expect((0, productIdGuard_1.cardLooksLikeSubsetPrint)('Hidden Fates', 'SV49')).toBe(true);
    });
    it('flags productIds owned by a different print family', () => {
        const owners = [
            { cardId: 'swsh9-68', setName: 'Brilliant Stars', cardNumber: '68' },
            { cardId: 'swsh9tg-TG16', setName: 'Brilliant Stars Trainer Gallery', cardNumber: 'TG16' },
        ];
        expect((0, productIdGuard_1.productIdConflictsWithPrintFamily)(263784, 'Brilliant Stars Trainer Gallery', owners)).toBe(true);
        expect((0, productIdGuard_1.productIdConflictsWithPrintFamily)(263784, 'Brilliant Stars', owners)).toBe(true);
    });
    it('does not flag when all owners share the print family', () => {
        const owners = [
            { cardId: 'tcgcsv-264221', setName: 'Brilliant Stars Trainer Gallery', cardNumber: 'TG16' },
            { cardId: 'swsh9tg-TG16', setName: 'Brilliant Stars Trainer Gallery', cardNumber: 'TG16' },
        ];
        expect((0, productIdGuard_1.productIdConflictsWithPrintFamily)(264221, 'Brilliant Stars Trainer Gallery', owners)).toBe(false);
    });
    it('resolves Mimikyu V TG16 to the Trainer Gallery TCGCSV productId', () => {
        const candidates = [
            {
                cardId: 'tcgcsv-263784',
                cardName: 'Mimikyu V',
                setName: 'Brilliant Stars',
                cardNumber: '68',
                productId: 263784,
            },
            {
                cardId: 'tcgcsv-264221',
                cardName: 'Mimikyu V',
                setName: 'Brilliant Stars Trainer Gallery',
                cardNumber: 'TG16',
                productId: 264221,
            },
        ];
        expect((0, productIdGuard_1.resolveProductIdFromOwners)('Mimikyu V', 'Brilliant Stars Trainer Gallery', 'TG16', candidates)).toBe(264221);
        expect((0, productIdGuard_1.resolveProductIdFromOwners)('Mimikyu V', 'Brilliant Stars', '68', candidates)).toBe(263784);
    });
});
describe('generateUniqueIdentifier letter-prefix numbers', () => {
    it('keeps TG16 as tg16 (does not strip to 16)', () => {
        const id = (0, cardIdentifier_1.generateUniqueIdentifier)('swsh9tg', 'TG16', 'Mimikyu V', 'holofoil');
        expect(id).toBe('swsh9tg|tg16|mimikyuv|holofoil');
        expect(id).not.toContain('|16|');
    });
});
