"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const security_1 = require("./middleware/security");
const csrf_1 = require("./middleware/csrf");
const rateLimiter_1 = require("./middleware/rateLimiter");
const logger_1 = require("./utils/logger");
const BODY_LIMIT = '20mb';
const REQUEST_TIMEOUT_MS = 120000;
function createApp() {
    const app = (0, express_1.default)();
    app.set('trust proxy', 1);
    app.use((0, security_1.securityMiddleware)());
    app.use((0, security_1.corsMiddleware)());
    app.use(csrf_1.csrfProtection);
    app.use(express_1.default.json({ limit: BODY_LIMIT }));
    app.use(express_1.default.urlencoded({ extended: true, limit: BODY_LIMIT }));
    app.use((req, res, next) => {
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            logger_1.logger.warn('Request timed out', { method: req.method, url: req.url });
            if (!res.headersSent) {
                res.status(503).json({ error: 'Request timed out' });
            }
        });
        next();
    });
    app.use(logger_1.requestLogger);
    app.use('/api/', rateLimiter_1.apiLimiter);
    return app;
}
