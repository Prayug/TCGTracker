"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdminUnlessDev = exports.requireAdmin = void 0;
const env_1 = require("../config/env");
const auth_1 = require("./auth");
const requireAdmin = (req, res, next) => {
    var _a;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) === env_1.env.admin.username) {
        next();
        return;
    }
    res.status(403).json({ error: 'Admin access required' });
};
exports.requireAdmin = requireAdmin;
/** Skip auth in local development; require admin account in production. */
const requireAdminUnlessDev = (req, res, next) => {
    if (env_1.env.isDevelopment) {
        next();
        return;
    }
    (0, auth_1.authenticate)(req, res, () => (0, exports.requireAdmin)(req, res, next));
};
exports.requireAdminUnlessDev = requireAdminUnlessDev;
