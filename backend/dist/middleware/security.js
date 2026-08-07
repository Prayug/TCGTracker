"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsMiddleware = exports.securityMiddleware = void 0;
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const env_1 = require("../config/env");
const securityMiddleware = () => {
    return (0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'https:'],
            },
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
    });
};
exports.securityMiddleware = securityMiddleware;
const corsMiddleware = () => {
    const origins = env_1.env.cors.origin
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    const allowPrivateLan = !env_1.env.isProduction;
    return (0, cors_1.default)({
        origin: (requestOrigin, callback) => {
            if (!requestOrigin) {
                callback(null, true);
                return;
            }
            if (origins.includes('*') || origins.includes(requestOrigin)) {
                callback(null, true);
                return;
            }
            if (allowPrivateLan) {
                try {
                    const host = new URL(requestOrigin).hostname;
                    const isLan = host === 'localhost' ||
                        host === '127.0.0.1' ||
                        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
                        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
                        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);
                    if (isLan) {
                        callback(null, true);
                        return;
                    }
                }
                catch (_a) {
                    // fall through
                }
            }
            callback(new Error(`CORS blocked for origin: ${requestOrigin}`));
        },
        credentials: true,
        optionsSuccessStatus: 200,
    });
};
exports.corsMiddleware = corsMiddleware;
