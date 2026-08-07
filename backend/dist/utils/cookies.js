"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTH_COOKIE_NAME = void 0;
exports.parseExpiresInToSeconds = parseExpiresInToSeconds;
exports.setAuthCookie = setAuthCookie;
exports.clearAuthCookie = clearAuthCookie;
exports.getAuthCookie = getAuthCookie;
const env_1 = require("../config/env");
exports.AUTH_COOKIE_NAME = 'tcg_token';
/** Parse JWT_EXPIRES_IN-style values (`7d`, `24h`, `3600s`, bare seconds) into seconds. */
function parseExpiresInToSeconds(value, fallbackSeconds = 7 * 24 * 60 * 60) {
    const trimmed = value.trim();
    const match = /^(\d+)([smhd])?$/i.exec(trimmed);
    if (!match)
        return fallbackSeconds;
    const amount = parseInt(match[1], 10);
    const unit = (match[2] || 's').toLowerCase();
    switch (unit) {
        case 's':
            return amount;
        case 'm':
            return amount * 60;
        case 'h':
            return amount * 60 * 60;
        case 'd':
            return amount * 24 * 60 * 60;
        default:
            return fallbackSeconds;
    }
}
function setAuthCookie(res, token) {
    const maxAgeSeconds = parseExpiresInToSeconds(env_1.env.jwt.expiresIn);
    const parts = [
        `${exports.AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        `Max-Age=${maxAgeSeconds}`,
    ];
    if (env_1.env.isProduction) {
        parts.push('Secure');
    }
    res.setHeader('Set-Cookie', parts.join('; '));
}
function clearAuthCookie(res) {
    const parts = [
        `${exports.AUTH_COOKIE_NAME}=`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        'Max-Age=0',
    ];
    if (env_1.env.isProduction) {
        parts.push('Secure');
    }
    res.setHeader('Set-Cookie', parts.join('; '));
}
function getAuthCookie(cookieHeader) {
    if (!cookieHeader)
        return undefined;
    for (const part of cookieHeader.split(';')) {
        const trimmed = part.trim();
        if (trimmed.startsWith(`${exports.AUTH_COOKIE_NAME}=`)) {
            return decodeURIComponent(trimmed.slice(exports.AUTH_COOKIE_NAME.length + 1));
        }
    }
    return undefined;
}
