"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTH_COOKIE_NAME = void 0;
exports.setAuthCookie = setAuthCookie;
exports.clearAuthCookie = clearAuthCookie;
exports.getAuthCookie = getAuthCookie;
const env_1 = require("../config/env");
exports.AUTH_COOKIE_NAME = 'tcg_token';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
function setAuthCookie(res, token) {
    const parts = [
        `${exports.AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`,
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
