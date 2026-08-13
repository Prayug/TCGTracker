import { describe, expect, it } from 'vitest';
import {
  canonicalFinishVariantKey,
  classifySetEra,
  eraToPackBand,
  extractBestListingPrice,
  isAskWallPrice,
  normalizeVariantKey,
  packEraBandFromSet,
  packEraBandFromSetLabel,
  queryContainsCjk,
  queryContainsNonEnglishScript,
  resolveHistoryPointPrice,
  resolveListingPrice,
  scoreVariantMatch,
  stratifiedPoolSliceSizes,
} from '../index';

describe('normalizeVariantKey contract', () => {
  it('keeps real finishes and maps Cardmarket channels', () => {
    expect(canonicalFinishVariantKey('Reverse Holofoil')).toBe('reverseholofoil');
    expect(canonicalFinishVariantKey('holofoil')).toBe('holofoil');
    expect(canonicalFinishVariantKey('cardmarket')).toBe('normal');
    expect(canonicalFinishVariantKey('cardmarket-holo')).toBe('holofoil');
    expect(normalizeVariantKey('cardmarket-holo')).toBe('cardmarketholo');
  });
});

describe('scoreVariantMatch contract', () => {
  it('does not bleed reverse into holofoil charts', () => {
    expect(scoreVariantMatch('holofoil', 'Holofoil')).toBe(3);
    expect(scoreVariantMatch('holofoil', 'Reverse Holofoil')).toBe(0);
    expect(scoreVariantMatch('holofoil', '1stEditionHolofoil')).toBe(2);
    expect(scoreVariantMatch('reverseHolofoil', 'Holofoil')).toBe(0);
    expect(scoreVariantMatch('holofoil', 'cardmarket-holo')).toBe(2);
    expect(scoreVariantMatch('normal', 'cardmarket')).toBe(2);
  });
});

describe('scriptDetection contract', () => {
  it('detects CJK and Hangul', () => {
    expect(queryContainsCjk('ピカチュウ')).toBe(true);
    expect(queryContainsCjk('Pikachu')).toBe(false);
    expect(queryContainsNonEnglishScript('피카츄')).toBe(true);
    expect(queryContainsNonEnglishScript('Pikachu')).toBe(false);
  });
});

describe('resolveListingPrice contract', () => {
  it('keeps coherent market and rejects ask walls', () => {
    expect(resolveListingPrice({ market: 3998.99, mid: 4999.98, low: 1650, high: 6504.97 })).toBe(
      3998.99
    );
    expect(resolveListingPrice({ market: 1150, mid: 19999.99, low: 749.99, high: 21999.99 })).toBe(
      1150
    );
    expect(isAskWallPrice(19999.99, 749.99)).toBe(true);
    expect(
      resolveHistoryPointPrice({
        marketPrice: 2100,
        lowPrice: 4500,
        highPrice: 4500,
      })
    ).toBe(2100);
    expect(
      extractBestListingPrice({
        holofoil: { market: 1150, mid: 19999.99, low: 749.99, high: 21999.99 },
      }).price
    ).toBe(1150);
  });
});

describe('setEra contract', () => {
  it('maps official promo set ids into parent eras', () => {
    expect(classifySetEra({ id: 'svp', name: 'SV Black Star Promos' })).toBe('sv');
    expect(classifySetEra({ id: 'np', name: 'Nintendo Black Star Promos' })).toBe('neo');
    expect(classifySetEra({ id: 'misc', name: 'Random Promo Pack' })).toBe('promo');
  });
});

describe('packEraBand contract', () => {
  it('classifies catalog sets via set-era rules', () => {
    expect(packEraBandFromSet({ id: 'sv2', name: 'Paldea Evolved' })).toBe('modern');
    expect(packEraBandFromSet({ id: 'xy1', name: 'XY' })).toBe('sm_xy');
    expect(packEraBandFromSet({ id: 'ex11', name: 'Delta Species' })).toBe('vintage');
    expect(eraToPackBand('dp')).toBe('bw_dp');
  });

  it('keeps the frontend label-regex classifier', () => {
    expect(packEraBandFromSetLabel({ id: 'sv2', name: 'Paldea Evolved' })).toBe('modern');
    expect(packEraBandFromSetLabel({ id: 'xy1', name: 'XY' })).toBe('sm_xy');
    expect(packEraBandFromSetLabel({ id: 'bw1', name: 'Black & White' })).toBe('bw_dp');
    expect(packEraBandFromSetLabel({ id: 'ex11', name: 'Delta Species' })).toBe('vintage');
  });

  it('splits 10000 into 4 bands of bulk+chase', () => {
    const { bulk, chase } = stratifiedPoolSliceSizes(10000);
    expect(bulk + chase).toBe(2500);
    expect(chase).toBe(1000);
  });
});
