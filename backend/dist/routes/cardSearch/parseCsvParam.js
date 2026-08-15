"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCsvParam = void 0;
const parseCsvParam = (value) => {
    if (value == null || value === '')
        return undefined;
    if (Array.isArray(value)) {
        return value.map((s) => String(s).trim()).filter(Boolean);
    }
    return String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
};
exports.parseCsvParam = parseCsvParam;
