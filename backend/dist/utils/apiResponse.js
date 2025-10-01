"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.fail = fail;
const env_1 = require("../config/env");
function ok(res, data, status = 200) {
    return res.status(status).json({ success: true, data });
}
function fail(res, message, status = 500) {
    const clientMessage = env_1.env.isProduction ? 'An internal error occurred' : message;
    return res.status(status).json({ success: false, error: clientMessage });
}
