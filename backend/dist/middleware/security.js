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
    return (0, cors_1.default)({
        origin: origins.length === 1 ? origins[0] : origins,
        credentials: true,
        optionsSuccessStatus: 200,
    });
};
exports.corsMiddleware = corsMiddleware;
