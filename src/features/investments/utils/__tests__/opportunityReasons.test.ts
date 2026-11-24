import { describe, it, expect } from 'vitest';
import { displayGrade, opportunityReasons } from '../opportunityReasons';
import type { Opportunity } from '../../types';

const base: Opportunity = {
  cardId: 'x',
  cardName: 'Umbreon VMAX',
  setId: null,
  setName: 'Evolving Skies',
  imageSmall: null,
  currentPrice: 100,
  score: 82,
  grade: 'strong_buy',
  predictedReturn90d: 12.4,
  confidence: 68,
  momentumPct: 8,
  momentumDays: 30,
  buyoutScore: 0,
  netSentiment: null,
  compMomentumPct: null,
  riskScore: null,
  why: '',
  keySignals: ['predicted_90d:12.4%', 'momentum_30d:+8%'],
};

describe('displayGrade', () => {
  it('keeps a positive forecast as scored', () => {
    expect(displayGrade(base)).toEqual({ grade: 'strong_buy', capped: false });
  });
  it('caps buy grades when the forecast is negative', () => {
    expect(displayGrade({ ...base, predictedReturn90d: -3 })).toEqual({
      grade: 'watch',
      capped: true,
    });
    expect(displayGrade({ grade: 'pass', predictedReturn90d: -3 }).grade).toBe('pass');
  });
});

describe('opportunityReasons', () => {
  it('writes plain reasons, never raw signal keys', () => {
    const r = opportunityReasons(base);
    expect(r).toEqual([
      'Model expects +12.4% over 90 days (68% confidence)',
      'Graded price up 8% in 30 days',
    ]);
    expect(r.join(' ')).not.toMatch(/momentum_|predicted_|_/);
  });
  it('leads with the cap and caps at three reasons', () => {
    const r = opportunityReasons({
      ...base,
      predictedReturn90d: -4,
      momentumPct: -6,
      buyoutScore: 70,
      netSentiment: 0.4,
    });
    expect(r).toHaveLength(3);
    expect(r[0]).toMatch(/Held at Watch/);
    expect(r[1]).toBe('Model expects −4% over 90 days (68% confidence)');
    expect(r[2]).toBe('Graded price down 6% in 30 days');
  });
  it('explains a missing forecast', () => {
    expect(opportunityReasons({ ...base, predictedReturn90d: null })[0]).toMatch(/No forecast/);
  });
});
