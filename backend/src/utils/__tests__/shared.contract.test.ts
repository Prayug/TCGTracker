import {
  canonicalFinishVariantKey,
  classifySetEra,
  normalizeVariantKey,
  packEraBandFromSet,
  queryContainsCjk,
  resolveListingPrice,
  scoreVariantMatch,
} from '@tcgtracker/shared';

/**
 * Jest contract: backend must resolve the same shared module the frontend
 * Vitest suite exercises. If these drift, FE/BE charts and pack bands diverge.
 */
describe('@tcgtracker/shared jest contract', () => {
  it('normalizes finishes the same way as the backend wrappers', () => {
    expect(normalizeVariantKey('Reverse Holofoil')).toBe('reverseholofoil');
    expect(canonicalFinishVariantKey('cardmarket-holo')).toBe('holofoil');
  });

  it('scores variants without reverse-holo bleed', () => {
    expect(scoreVariantMatch('holofoil', 'Reverse Holofoil')).toBe(0);
    expect(scoreVariantMatch('holofoil', '1stEditionHolofoil')).toBe(2);
  });

  it('detects CJK queries', () => {
    expect(queryContainsCjk('リザードン')).toBe(true);
  });

  it('resolves listing prices without ask-wall mids', () => {
    expect(
      resolveListingPrice({ market: 1150, mid: 19999.99, low: 749.99, high: 21999.99 })
    ).toBe(1150);
  });

  it('classifies eras and pack bands', () => {
    expect(classifySetEra({ id: 'svp', name: 'SV Black Star Promos' })).toBe('sv');
    expect(packEraBandFromSet({ id: 'swsh1', name: 'Sword & Shield' })).toBe('modern');
  });
});
