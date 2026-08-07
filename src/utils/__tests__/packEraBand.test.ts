import { describe, expect, it } from 'vitest';
import { packEraBandFromSet, pickCandidateByEraBand } from '../packEraBand';

describe('packEraBandFromSet', () => {
  it('classifies modern vs vintage sets', () => {
    expect(packEraBandFromSet({ id: 'sv2', name: 'Paldea Evolved' })).toBe('modern');
    expect(packEraBandFromSet({ id: 'swsh3', name: 'Darkness Ablaze' })).toBe('modern');
    expect(packEraBandFromSet({ id: 'ex11', name: 'Delta Species' })).toBe('vintage');
    expect(packEraBandFromSet({ id: 'pop3', name: 'POP Series 3' })).toBe('vintage');
    expect(packEraBandFromSet({ id: 'xy1', name: 'XY' })).toBe('sm_xy');
    expect(packEraBandFromSet({ id: 'bw1', name: 'Black & White' })).toBe('bw_dp');
  });
});

describe('pickCandidateByEraBand', () => {
  it('does not let a huge vintage pile drown a small modern pile', () => {
    const candidates = [
      ...Array.from({ length: 80 }, (_, i) => ({
        id: `v${i}`,
        set: { id: 'ex11', name: 'Delta Species' },
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `m${i}`,
        set: { id: 'sv2', name: 'Paldea Evolved' },
      })),
    ];

    const counts = { modern: 0, vintage: 0, other: 0 };
    for (let i = 0; i < 400; i++) {
      const pick = pickCandidateByEraBand(candidates, (c) => packEraBandFromSet(c.set));
      const band = packEraBandFromSet(pick.set);
      if (band === 'modern') counts.modern += 1;
      else if (band === 'vintage') counts.vintage += 1;
      else counts.other += 1;
    }

    expect(counts.modern).toBeGreaterThan(120);
    expect(counts.vintage).toBeGreaterThan(120);
    expect(counts.other).toBe(0);
  });
});
