"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = void 0;
const env_1 = require("../config/env");
const requireAdmin = (req, res, next) => {
    var _a;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.username) === env_1.env.admin.username) {
        next();
        return;
    }
    res.status(403).json({ error: 'Admin access required' });
};
exports.requireAdmin = requireAdmin;
