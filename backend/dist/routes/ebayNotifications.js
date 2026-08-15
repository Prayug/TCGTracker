"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
const ebayMarketplaceDeletion_1 = require("../services/ebayMarketplaceDeletion");
const router = (0, express_1.Router)();
const resolveEndpoint = (req) => {
    var _a;
    if (env_1.env.ebay.notificationEndpoint)
        return env_1.env.ebay.notificationEndpoint.replace(/\/$/, '');
    const host = (_a = req.get('host')) !== null && _a !== void 0 ? _a : 'localhost';
    const path = req.originalUrl.split('?')[0];
    return `${req.protocol}://${host}${path}`;
};
/** GET: eBay ownership challenge. POST: account-deletion notice (we store no eBay user identities). */
router.get('/', (req, res) => {
    const challengeCode = typeof req.query.challenge_code === 'string' ? req.query.challenge_code : '';
    const token = env_1.env.ebay.verificationToken;
    if (!challengeCode || !token) {
        res.status(400).json({ error: 'Missing challenge_code or EBAY_VERIFICATION_TOKEN' });
        return;
    }
    const endpoint = resolveEndpoint(req);
    res.json({ challengeResponse: (0, ebayMarketplaceDeletion_1.ebayChallengeResponse)(challengeCode, token, endpoint) });
});
router.post('/', (req, res) => {
    var _a, _b, _c;
    const data = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.notification) === null || _b === void 0 ? void 0 : _b.data;
    logger_1.logger.info('eBay marketplace account deletion notification', {
        userId: (_c = data === null || data === void 0 ? void 0 : data.userId) !== null && _c !== void 0 ? _c : null,
    });
    res.status(200).json({ ok: true });
});
exports.default = router;
