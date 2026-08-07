"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.passwordChangeLimiter = exports.authLimiter = exports.captureSessionLimiter = exports.apiLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("../config/env");
function isCaptureSessionsPath(req) {
    const url = req.originalUrl || req.url || '';
    return url.includes('/api/capture-sessions');
}
// General API rate limiter
exports.apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: env_1.env.rateLimit.windowMs,
    max: env_1.env.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Phone QR capture polls every couple seconds from desktop + phone; don't
    // burn the global budget on that relay traffic.
    skip: isCaptureSessionsPath,
});
/** Generous limiter for phone↔desktop capture relay (poll + image upload). */
exports.captureSessionLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 240,
    message: 'Too many capture-session requests, please wait a moment.',
    standardHeaders: true,
    legacyHeaders: false,
});
// Strict rate limiter for authentication endpoints
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});
// Very strict rate limiter for password change
exports.passwordChangeLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 requests per hour
    message: 'Too many password change attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
