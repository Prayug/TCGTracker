"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.csrfProtection = void 0;
const env_1 = require("../config/env");
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const csrfProtection = (req, res, next) => {
    var _a;
    if (SAFE_METHODS.has(req.method)) {
        next();
        return;
    }
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    if (!origin && !referer) {
        if ((_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.startsWith('Bearer ')) {
            next();
            return;
        }
        next();
        return;
    }
    const allowedOrigins = env_1.env.cors.origin
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    const requestOrigin = origin || referer || '';
    const isAllowed = allowedOrigins.some((allowed) => requestOrigin === allowed || requestOrigin.startsWith(allowed + '/') || requestOrigin.startsWith(allowed + ':'));
    if (!isAllowed) {
        res.status(403).json({ error: 'CSRF validation failed' });
        return;
    }
    next();
};
exports.csrfProtection = csrfProtection;
