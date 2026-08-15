"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const setEra_1 = require("../setEra");
describe('classifySetEra promo mapping', () => {
    it('maps official Black Star promo set ids into parent eras', () => {
        expect((0, setEra_1.classifySetEra)({ id: 'svp', name: 'SV Black Star Promos' })).toBe('sv');
        expect((0, setEra_1.classifySetEra)({ id: 'swshp', name: 'SWSH Black Star Promos' })).toBe('swsh');
        expect((0, setEra_1.classifySetEra)({ id: 'smp', name: 'SM Black Star Promos' })).toBe('sm');
        expect((0, setEra_1.classifySetEra)({ id: 'xyp', name: 'XY Black Star Promos' })).toBe('xy');
        expect((0, setEra_1.classifySetEra)({ id: 'bwp', name: 'BW Black Star Promos' })).toBe('bw');
        expect((0, setEra_1.classifySetEra)({ id: 'hsp', name: 'HGSS Black Star Promos' })).toBe('hgss');
        expect((0, setEra_1.classifySetEra)({ id: 'dpp', name: 'DP Black Star Promos' })).toBe('dp');
        expect((0, setEra_1.classifySetEra)({ id: 'np', name: 'Nintendo Black Star Promos' })).toBe('neo');
        expect((0, setEra_1.classifySetEra)({ id: 'basep', name: 'Wizards Black Star Promos' })).toBe('base');
    });
    it('maps promo-named sets without official ids via label cues', () => {
        expect((0, setEra_1.classifySetEra)({ id: 'tcgcsv-1', name: 'SWSH - Black Star Promos' })).toBe('swsh');
        expect((0, setEra_1.classifySetEra)({ id: 'tcgcsv-2', name: 'Scarlet & Violet Promos' })).toBe('sv');
        expect((0, setEra_1.classifySetEra)({ id: 'tcgcsv-3', name: 'SM Black Star Promos' })).toBe('sm');
    });
    it('keeps unclassifiable promos in the promo bucket', () => {
        expect((0, setEra_1.classifySetEra)({ id: 'misc', name: 'Random Promo Pack' })).toBe('promo');
    });
});
