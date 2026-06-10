"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const setAliasResolver_1 = require("../../services/setAliasResolver");
(0, globals_1.describe)('normalizeSetKey', () => {
    (0, globals_1.it)('strips punctuation for cross-source matching', () => {
        (0, globals_1.expect)((0, setAliasResolver_1.normalizeSetKey)('ME04: Chaos Rising')).toBe('me04chaosrising');
        (0, globals_1.expect)((0, setAliasResolver_1.normalizeSetKey)('Chaos Rising')).toBe('chaosrising');
    });
});
