"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeVariantKey = void 0;
/**
 * Normalizes a variant key (e.g., "Reverse Holofoil", "1st Edition Holofoil")
 * to a consistent lowercase alphanumeric string.
 *
 * This function must be used consistently across all price ingestion and
 * lookup paths to ensure uniqueIdentifier generation matches.
 */
const normalizeVariantKey = (value) => {
    if (!value)
        return 'normal';
    const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalized || 'normal';
};
exports.normalizeVariantKey = normalizeVariantKey;
