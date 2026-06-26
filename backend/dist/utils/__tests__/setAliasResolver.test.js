"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const setAliasResolver_1 = require("../../services/setAliasResolver");
(0, vitest_1.describe)('normalizeSetKey', () => {
    (0, vitest_1.it)('strips punctuation for cross-source matching', () => {
        (0, vitest_1.expect)((0, setAliasResolver_1.normalizeSetKey)('ME04: Chaos Rising')).toBe('me04chaosrising');
        (0, vitest_1.expect)((0, setAliasResolver_1.normalizeSetKey)('Chaos Rising')).toBe('chaosrising');
    });
});
