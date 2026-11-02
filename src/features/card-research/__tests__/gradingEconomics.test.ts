import { describe, expect, it } from 'vitest';
import {
  breakEvenSalePrice,
  expectedProfit,
  netAfterFees,
  rawBaseline,
  scenario,
  totalOutlay,
} from '../gradingEconomics';

const base = { acquisition: 100, gradingFee: 25, shipping: 15, sellerFeePct: 0.13 };

describe('grading economics', () => {
  it('sums the outlay', () => {
    expect(totalOutlay(base)).toBe(140);
  });

  it('nets seller fees off the sale', () => {
    expect(netAfterFees(200, 0.13)).toBeCloseTo(174);
  });

  it('finds the break-even sale price', () => {
    const be = breakEvenSalePrice(base);
    expect(be).toBeCloseTo(140 / 0.87);
    expect(scenario('BE', be, base).profit).toBeCloseTo(0);
  });

  it('computes profit and ROI for a scenario', () => {
    const s = scenario('PSA 10', 400, base);
    expect(s.netProceeds).toBeCloseTo(348);
    expect(s.profit).toBeCloseTo(208);
    expect(s.roi).toBeCloseTo(208 / 140);
  });

  it('raw baseline excludes grading costs', () => {
    expect(rawBaseline(100, base).profit).toBeCloseTo(-13);
  });

  it('refuses expected value without probabilities that sum to one', () => {
    const a = scenario('10', 400, base);
    const b = scenario('9', 150, base);
    expect(expectedProfit([{ probability: 0.5, outcome: a }])).toBeNull();
    expect(
      expectedProfit([
        { probability: 0.5, outcome: a },
        { probability: 0.5, outcome: b },
      ])
    ).toBeCloseTo((a.profit + b.profit) / 2);
  });
});
