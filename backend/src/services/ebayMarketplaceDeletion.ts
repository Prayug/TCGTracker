import crypto from 'crypto';

/**
 * eBay Marketplace Account Deletion challenge hash.
 * SHA-256 hex of challengeCode + verificationToken + endpointUrl (exact portal URL).
 */
export function ebayChallengeResponse(
  challengeCode: string,
  verificationToken: string,
  endpointUrl: string
): string {
  return crypto
    .createHash('sha256')
    .update(challengeCode + verificationToken + endpointUrl, 'utf8')
    .digest('hex');
}
