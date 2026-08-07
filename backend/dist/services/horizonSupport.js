"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HORIZON_HISTORY_REQUIREMENTS = void 0;
exports.getPriceHistorySpanDays = getPriceHistorySpanDays;
exports.getHorizonSupportStatus = getHorizonSupportStatus;
exports.isHorizonSupported = isHorizonSupported;
exports.isHorizonExperimental = isHorizonExperimental;
exports.windowToHorizonDays = windowToHorizonDays;
exports.applyHorizonHonesty = applyHorizonHonesty;
exports.invalidateHorizonSupportCache = invalidateHorizonSupportCache;
const database_1 = require("../db/database");
/** Need ≥ horizon days of span (with a small buffer) before claiming the horizon. */
exports.HORIZON_HISTORY_REQUIREMENTS = {
    7: 14,
    30: 45,
    90: 120,
    180: 220,
    365: 400,
};
const ALL_HORIZONS = [7, 30, 90, 180, 365];
let cachedStatus = null;
let cachedAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;
async function getPriceHistorySpanDays() {
    var _a, _b, _c;
    const db = (0, database_1.getDb)();
    const row = await new Promise((resolve, reject) => {
        db.get(`SELECT MIN(date) AS minDate, MAX(date) AS maxDate,
                CAST(julianday(MAX(date)) - julianday(MIN(date)) AS INTEGER) AS days
         FROM price_history
         WHERE source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')`, [], (err, r) => (err ? reject(err) : resolve(r)));
    });
    return {
        days: (_a = row === null || row === void 0 ? void 0 : row.days) !== null && _a !== void 0 ? _a : 0,
        minDate: (_b = row === null || row === void 0 ? void 0 : row.minDate) !== null && _b !== void 0 ? _b : null,
        maxDate: (_c = row === null || row === void 0 ? void 0 : row.maxDate) !== null && _c !== void 0 ? _c : null,
    };
}
async function getHorizonSupportStatus(force = false) {
    if (!force && cachedStatus && Date.now() - cachedAt < CACHE_TTL_MS) {
        return cachedStatus;
    }
    const span = await getPriceHistorySpanDays();
    const supported = [];
    const experimental = [];
    const unsupported = [];
    for (const h of ALL_HORIZONS) {
        const need = exports.HORIZON_HISTORY_REQUIREMENTS[h];
        if (span.days >= need) {
            supported.push(h);
        }
        else if (span.days >= Math.floor(need * 0.55)) {
            // Enough to compute a scaled estimate, but not enough for mature forward tests.
            experimental.push(h);
        }
        else {
            unsupported.push(h);
        }
    }
    cachedStatus = {
        historyDays: span.days,
        historyMinDate: span.minDate,
        historyMaxDate: span.maxDate,
        supported,
        experimental,
        unsupported,
        requirements: { ...exports.HORIZON_HISTORY_REQUIREMENTS },
    };
    cachedAt = Date.now();
    return cachedStatus;
}
function isHorizonSupported(status, days) {
    return status.supported.includes(days);
}
function isHorizonExperimental(status, days) {
    return status.experimental.includes(days);
}
/** Map API window string → horizon days. */
function windowToHorizonDays(window) {
    return Number(window.replace('d', ''));
}
/**
 * Null out expected returns / bands for horizons the DB cannot honestly support.
 * Experimental horizons are kept but callers should surface the flag.
 */
function applyHorizonHonesty(prediction, status) {
    const out = { ...prediction, horizonSupport: status };
    if (status.unsupported.includes(180)) {
        out.expected180dReturn = null;
    }
    if (status.unsupported.includes(365)) {
        out.expected365dReturn = null;
    }
    return out;
}
function invalidateHorizonSupportCache() {
    cachedStatus = null;
    cachedAt = 0;
}
