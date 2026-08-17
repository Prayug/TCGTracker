import { Router } from 'express';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ebayChallengeResponse } from '../services/ebayMarketplaceDeletion';

const router = Router();

const resolveEndpoint = (req: { protocol: string; get: (h: string) => string | undefined; originalUrl: string }): string => {
  if (env.ebay.notificationEndpoint) return env.ebay.notificationEndpoint.replace(/\/$/, '');
  const host = req.get('host') ?? 'localhost';
  const path = req.originalUrl.split('?')[0];
  return `${req.protocol}://${host}${path}`;
};

/** GET: eBay ownership challenge. POST: account-deletion notice (we store no eBay user identities). */
router.get('/', (req, res) => {
  const challengeCode = typeof req.query.challenge_code === 'string' ? req.query.challenge_code : '';
  const token = env.ebay.verificationToken;
  if (!challengeCode || !token) {
    res.status(400).json({ error: 'Missing challenge_code or EBAY_VERIFICATION_TOKEN' });
    return;
  }
  const endpoint = resolveEndpoint(req);
  res.json({ challengeResponse: ebayChallengeResponse(challengeCode, token, endpoint) });
});

router.post('/', (req, res) => {
  const data = req.body?.notification?.data;
  logger.info('eBay marketplace account deletion notification', {
    userId: data?.userId ?? null,
  });
  res.status(200).json({ ok: true });
});

export default router;
