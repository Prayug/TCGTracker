import { windowIsHit, resolveStatus } from '../forwardTestTracker';

describe('windowIsHit', () => {
  it('counts a hit when direction is right and error is small relative to the move', () => {
    expect(windowIsHit(1, 0.01, 0.08)).toBe(true);
  });

  it('rejects wrong direction', () => {
    expect(windowIsHit(0, 0.01, 0.08)).toBe(false);
  });

  it('rejects directionally-correct but wildly wrong magnitude', () => {
    expect(windowIsHit(1, 0.25, 0.08)).toBe(false);
  });

  it('applies a floor so tiny flat moves do not produce free hits', () => {
    // error 0.01 vs 0.5 * max(0.005, 0.03) = 0.015 -> hit
    expect(windowIsHit(1, 0.01, 0.005)).toBe(true);
    // error 0.02 vs 0.015 -> miss, even though direction was right
    expect(windowIsHit(1, 0.02, 0.005)).toBe(false);
  });

  it('returns false on null inputs', () => {
    expect(windowIsHit(null, 0.01, 0.08)).toBe(false);
    expect(windowIsHit(1, null, 0.08)).toBe(false);
    expect(windowIsHit(1, 0.01, null)).toBe(false);
  });
});

describe('resolveStatus', () => {
  it('stays pending while no window has matured', () => {
    expect(resolveStatus([{ has: false, hit: false }, { has: false, hit: false }])).toBe('pending');
  });

  it('hit when every matured window hit', () => {
    expect(
      resolveStatus([
        { has: true, hit: true },
        { has: false, hit: false },
        { has: true, hit: true },
      ])
    ).toBe('hit');
  });

  it('missed when matured windows all missed', () => {
    expect(
      resolveStatus([
        { has: true, hit: false },
        { has: true, hit: false },
      ])
    ).toBe('missed');
  });

  it('partially_correct on a mix, ignoring not-yet-matured windows', () => {
    expect(
      resolveStatus([
        { has: true, hit: true },
        { has: false, hit: false },
        { has: true, hit: false },
      ])
    ).toBe('partially_correct');
  });
});
