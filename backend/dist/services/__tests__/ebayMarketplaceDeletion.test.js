"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ebayMarketplaceDeletion_1 = require("../ebayMarketplaceDeletion");
describe('ebayChallengeResponse', () => {
    it('hashes challenge + token + endpoint in that order', () => {
        const hex = (0, ebayMarketplaceDeletion_1.ebayChallengeResponse)('challenge123', 'verification-token-32-chars-minxx', 'https://example.com/api/ebay/marketplace-account-deletion');
        expect(hex).toHaveLength(64);
        expect(hex).toMatch(/^[0-9a-f]+$/);
        expect(hex).toBe((0, ebayMarketplaceDeletion_1.ebayChallengeResponse)('challenge123', 'verification-token-32-chars-minxx', 'https://example.com/api/ebay/marketplace-account-deletion'));
        expect(hex).not.toBe((0, ebayMarketplaceDeletion_1.ebayChallengeResponse)('challenge123', 'verification-token-32-chars-minxx', 'https://example.com/api/ebay/marketplace-account-deletion/'));
    });
});
