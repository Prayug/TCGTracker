"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const packEraBand_1 = require("../packEraBand");
describe('packEraBandFromSet', () => {
    it('puts SV / SWSH / Mega in modern', () => {
        expect((0, packEraBand_1.packEraBandFromSet)({ id: 'sv2', name: 'Paldea Evolved' })).toBe('modern');
        expect((0, packEraBand_1.packEraBandFromSet)({ id: 'swsh1', name: 'Sword & Shield' })).toBe('modern');
        expect((0, packEraBand_1.packEraBandFromSet)({ id: 'me1', name: 'Mega Evolution' })).toBe('modern');
        expect((0, packEraBand_1.packEraBandFromSet)({ id: 'sv151', name: 'SV: Scarlet & Violet 151' })).toBe('modern');
    });
    it('puts XY / SM in sm_xy', () => {
        expect((0, packEraBand_1.packEraBandFromSet)({ id: 'xy1', name: 'XY' })).toBe('sm_xy');
        expect((0, packEraBand_1.packEraBandFromSet)({ id: 'sm1', name: 'Sun & Moon' })).toBe('sm_xy');
    });
    it('puts EX / POP / e-Card in vintage', () => {
        expect((0, packEraBand_1.packEraBandFromSet)({ id: 'ex13', name: 'Holon Phantoms' })).toBe('vintage');
        expect((0, packEraBand_1.packEraBandFromSet)({ id: 'ex11', name: 'Delta Species' })).toBe('vintage');
        expect((0, packEraBand_1.packEraBandFromSet)({ id: 'pop3', name: 'POP Series 3' })).toBe('vintage');
        expect((0, packEraBand_1.packEraBandFromSet)({ id: 'ecard3', name: 'Skyridge' })).toBe('vintage');
    });
    it('maps classifySetEra ids through eraToPackBand', () => {
        expect((0, packEraBand_1.eraToPackBand)('sv')).toBe('modern');
        expect((0, packEraBand_1.eraToPackBand)('xy')).toBe('sm_xy');
        expect((0, packEraBand_1.eraToPackBand)('dp')).toBe('bw_dp');
        expect((0, packEraBand_1.eraToPackBand)('ex')).toBe('vintage');
    });
});
describe('stratifiedPoolSliceSizes', () => {
    it('splits 10000 into 4 bands of bulk+chase', () => {
        const { bulk, chase } = (0, packEraBand_1.stratifiedPoolSliceSizes)(10000);
        expect(bulk + chase).toBe(2500);
        expect(chase).toBe(1000);
        expect(bulk).toBe(1500);
    });
});
