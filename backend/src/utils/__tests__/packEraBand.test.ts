import { eraToPackBand, packEraBandFromSet, stratifiedPoolSliceSizes } from '../packEraBand';

describe('packEraBandFromSet', () => {
  it('puts SV / SWSH / Mega in modern', () => {
    expect(packEraBandFromSet({ id: 'sv2', name: 'Paldea Evolved' })).toBe('modern');
    expect(packEraBandFromSet({ id: 'swsh1', name: 'Sword & Shield' })).toBe('modern');
    expect(packEraBandFromSet({ id: 'me1', name: 'Mega Evolution' })).toBe('modern');
    expect(packEraBandFromSet({ id: 'sv151', name: 'SV: Scarlet & Violet 151' })).toBe('modern');
  });

  it('puts XY / SM in sm_xy', () => {
    expect(packEraBandFromSet({ id: 'xy1', name: 'XY' })).toBe('sm_xy');
    expect(packEraBandFromSet({ id: 'sm1', name: 'Sun & Moon' })).toBe('sm_xy');
  });

  it('puts EX / POP / e-Card in vintage', () => {
    expect(packEraBandFromSet({ id: 'ex13', name: 'Holon Phantoms' })).toBe('vintage');
    expect(packEraBandFromSet({ id: 'ex11', name: 'Delta Species' })).toBe('vintage');
    expect(packEraBandFromSet({ id: 'pop3', name: 'POP Series 3' })).toBe('vintage');
    expect(packEraBandFromSet({ id: 'ecard3', name: 'Skyridge' })).toBe('vintage');
  });

  it('maps classifySetEra ids through eraToPackBand', () => {
    expect(eraToPackBand('sv')).toBe('modern');
    expect(eraToPackBand('xy')).toBe('sm_xy');
    expect(eraToPackBand('dp')).toBe('bw_dp');
    expect(eraToPackBand('ex')).toBe('vintage');
  });
});

describe('stratifiedPoolSliceSizes', () => {
  it('splits 10000 into 4 bands of bulk+chase', () => {
    const { bulk, chase } = stratifiedPoolSliceSizes(10000);
    expect(bulk + chase).toBe(2500);
    expect(chase).toBe(1000);
    expect(bulk).toBe(1500);
  });
});
