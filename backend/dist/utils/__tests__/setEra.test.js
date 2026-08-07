"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const setEra_1 = require("../setEra");
(0, vitest_1.describe)('classifySetEra promo mapping', () => {
    (0, vitest_1.it)('maps official Black Star promo set ids into parent eras', () => {
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'svp', name: 'SV Black Star Promos' })).toBe('sv');
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'swshp', name: 'SWSH Black Star Promos' })).toBe('swsh');
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'smp', name: 'SM Black Star Promos' })).toBe('sm');
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'xyp', name: 'XY Black Star Promos' })).toBe('xy');
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'bwp', name: 'BW Black Star Promos' })).toBe('bw');
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'hsp', name: 'HGSS Black Star Promos' })).toBe('hgss');
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'dpp', name: 'DP Black Star Promos' })).toBe('dp');
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'np', name: 'Nintendo Black Star Promos' })).toBe('neo');
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'basep', name: 'Wizards Black Star Promos' })).toBe('base');
    });
    (0, vitest_1.it)('maps promo-named sets without official ids via label cues', () => {
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'tcgcsv-1', name: 'SWSH - Black Star Promos' })).toBe('swsh');
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'tcgcsv-2', name: 'Scarlet & Violet Promos' })).toBe('sv');
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'tcgcsv-3', name: 'SM Black Star Promos' })).toBe('sm');
    });
    (0, vitest_1.it)('keeps unclassifiable promos in the promo bucket', () => {
        (0, vitest_1.expect)((0, setEra_1.classifySetEra)({ id: 'misc', name: 'Random Promo Pack' })).toBe('promo');
    });
});
