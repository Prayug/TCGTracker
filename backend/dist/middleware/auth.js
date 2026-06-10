"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const cookies_1 = require("../utils/cookies");
function extractToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    const cookieToken = (0, cookies_1.getAuthCookie)(req.headers.cookie);
    return cookieToken !== null && cookieToken !== void 0 ? cookieToken : null;
}
function verifyToken(token) {
    return jsonwebtoken_1.default.verify(token, env_1.env.jwt.secret);
}
const authenticate = (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        req.user = verifyToken(token);
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res.status(401).json({ error: 'Token expired' });
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: 'Authentication failed' });
    }
};
exports.authenticate = authenticate;
const optionalAuth = (req, _res, next) => {
    try {
        const token = extractToken(req);
        if (token) {
            req.user = verifyToken(token);
        }
        next();
    }
    catch (_a) {
        next();
    }
};
exports.optionalAuth = optionalAuth;
