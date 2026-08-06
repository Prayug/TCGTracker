import { describe, expect, it } from 'vitest';
import { classifySetEra } from '../setEra';

describe('classifySetEra promo mapping', () => {
  it('maps official Black Star promo set ids into parent eras', () => {
    expect(classifySetEra({ id: 'svp', name: 'SV Black Star Promos' })).toBe('sv');
    expect(classifySetEra({ id: 'swshp', name: 'SWSH Black Star Promos' })).toBe('swsh');
    expect(classifySetEra({ id: 'smp', name: 'SM Black Star Promos' })).toBe('sm');
    expect(classifySetEra({ id: 'xyp', name: 'XY Black Star Promos' })).toBe('xy');
    expect(classifySetEra({ id: 'bwp', name: 'BW Black Star Promos' })).toBe('bw');
    expect(classifySetEra({ id: 'hsp', name: 'HGSS Black Star Promos' })).toBe('hgss');
    expect(classifySetEra({ id: 'dpp', name: 'DP Black Star Promos' })).toBe('dp');
    expect(classifySetEra({ id: 'np', name: 'Nintendo Black Star Promos' })).toBe('neo');
    expect(classifySetEra({ id: 'basep', name: 'Wizards Black Star Promos' })).toBe('base');
  });

  it('maps promo-named sets without official ids via label cues', () => {
    expect(
      classifySetEra({ id: 'tcgcsv-1', name: 'SWSH - Black Star Promos' })
    ).toBe('swsh');
    expect(
      classifySetEra({ id: 'tcgcsv-2', name: 'Scarlet & Violet Promos' })
    ).toBe('sv');
    expect(classifySetEra({ id: 'tcgcsv-3', name: 'SM Black Star Promos' })).toBe('sm');
  });

  it('keeps unclassifiable promos in the promo bucket', () => {
    expect(classifySetEra({ id: 'misc', name: 'Random Promo Pack' })).toBe('promo');
  });
});
