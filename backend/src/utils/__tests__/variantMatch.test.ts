import { scoreVariantMatch } from '../variantMatch';

describe('scoreVariantMatch', () => {
  it('scores exact finish matches highest', () => {
    expect(scoreVariantMatch('holofoil', 'Holofoil')).toBe(3);
    expect(scoreVariantMatch('reverseHolofoil', 'Reverse Holofoil')).toBe(3);
  });

  it('does not let reverseHolofoil match preferred holofoil', () => {
    // Regression: row.includes('holofoil') was true for reverseholofoil and
    // bled Expedition / Legendary reverse history into holo charts.
    expect(scoreVariantMatch('holofoil', 'Reverse Holofoil')).toBe(0);
    expect(scoreVariantMatch('holofoil', 'reverseHolofoil')).toBe(0);
  });

  it('still matches 1st edition / unlimited holo to holofoil', () => {
    expect(scoreVariantMatch('holofoil', '1stEditionHolofoil')).toBe(2);
    expect(scoreVariantMatch('holofoil', 'unlimitedHolofoil')).toBe(2);
  });

  it('matches reverse family together', () => {
    expect(scoreVariantMatch('reverseHolofoil', 'Reverse Holo')).toBe(2);
  });

  it('does not match holofoil into reverse preference', () => {
    expect(scoreVariantMatch('reverseHolofoil', 'Holofoil')).toBe(0);
  });

  it('maps Cardmarket channel labels onto the matching finish', () => {
    expect(scoreVariantMatch('holofoil', 'cardmarket-holo')).toBe(2);
    expect(scoreVariantMatch('holofoil', 'cardmarket')).toBe(0);
    expect(scoreVariantMatch('normal', 'cardmarket')).toBe(2);
    expect(scoreVariantMatch('reverseHolofoil', 'cardmarket-holo')).toBe(0);
  });
});
