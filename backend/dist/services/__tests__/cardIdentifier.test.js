"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const cardIdentifier_1 = require("../cardIdentifier");
(0, globals_1.describe)('generateUniqueIdentifier', () => {
    (0, globals_1.it)('normalizes set ID by removing special characters and lowercasing', () => {
        const id = (0, cardIdentifier_1.generateUniqueIdentifier)('SWORD & SHIELD', '1', 'Pikachu', 'normal');
        (0, globals_1.expect)(id).toContain('sword');
        (0, globals_1.expect)(id).not.toContain('&');
    });
    (0, globals_1.it)('includes variant key in the identifier', () => {
        const normal = (0, cardIdentifier_1.generateUniqueIdentifier)('set1', '1', 'Pikachu', 'normal');
        const holo = (0, cardIdentifier_1.generateUniqueIdentifier)('set1', '1', 'Pikachu', 'holofoil');
        (0, globals_1.expect)(normal).not.toBe(holo);
    });
    (0, globals_1.it)('produces consistent output for same inputs', () => {
        const a = (0, cardIdentifier_1.generateUniqueIdentifier)('base1', '4', 'Charizard', 'holofoil');
        const b = (0, cardIdentifier_1.generateUniqueIdentifier)('base1', '4', 'Charizard', 'holofoil');
        (0, globals_1.expect)(a).toBe(b);
    });
    (0, globals_1.it)('handles missing card number', () => {
        const id = (0, cardIdentifier_1.generateUniqueIdentifier)('swsh1', undefined, 'Energy', 'normal');
        (0, globals_1.expect)(id).toMatch(/swsh1\|\|energy\|normal/);
    });
    (0, globals_1.it)('defaults variant to normal when empty', () => {
        const id = (0, cardIdentifier_1.generateUniqueIdentifier)('set1', '1', 'Card', '');
        (0, globals_1.expect)(id).toContain('normal');
    });
});
