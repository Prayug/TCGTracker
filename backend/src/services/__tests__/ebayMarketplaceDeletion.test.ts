import { ebayChallengeResponse } from '../ebayMarketplaceDeletion';

describe('ebayChallengeResponse', () => {
  it('hashes challenge + token + endpoint in that order', () => {
    const hex = ebayChallengeResponse(
      'challenge123',
      'verification-token-32-chars-minxx',
      'https://example.com/api/ebay/marketplace-account-deletion'
    );
    expect(hex).toHaveLength(64);
    expect(hex).toMatch(/^[0-9a-f]+$/);
    expect(hex).toBe(
      ebayChallengeResponse(
        'challenge123',
        'verification-token-32-chars-minxx',
        'https://example.com/api/ebay/marketplace-account-deletion'
      )
    );
    expect(hex).not.toBe(
      ebayChallengeResponse(
        'challenge123',
        'verification-token-32-chars-minxx',
        'https://example.com/api/ebay/marketplace-account-deletion/'
      )
    );
  });
});
