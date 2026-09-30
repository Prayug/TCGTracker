import { describe, expect, it } from 'vitest';
import {
  aggregateCohortReturns,
  classifyMoneyFlowEra,
  classifyRotation,
  confidenceFromSample,
  detectSpecialCohorts,
  isGoldStarPrint,
  isShiningPrint,
  isSirAltPrint,
  median,
  trimmedMean,
} from '../moneyFlowCohorts';

describe('classifyMoneyFlowEra', () => {
  it('maps set eras into vintage / mid / modern', () => {
    expect(classifyMoneyFlowEra({ id: 'sv2', name: 'Paldea Evolved' })).toBe('modern');
    expect(classifyMoneyFlowEra({ id: 'swsh1', name: 'Sword & Shield' })).toBe('modern');
    expect(classifyMoneyFlowEra({ id: 'xy1', name: 'XY' })).toBe('mid');
    expect(classifyMoneyFlowEra({ id: 'sm1', name: 'Sun & Moon' })).toBe('mid');
    expect(classifyMoneyFlowEra({ id: 'bw1', name: 'Black & White' })).toBe('mid');
    expect(classifyMoneyFlowEra({ id: 'ex11', name: 'Delta Species' })).toBe('vintage');
    expect(classifyMoneyFlowEra({ id: 'base1', name: 'Base Set' })).toBe('vintage');
    expect(classifyMoneyFlowEra({ id: 'neo1', name: 'Neo Genesis' })).toBe('vintage');
  });
});

describe('special cohort detection', () => {
  it('detects Gold Stars from name / star glyph', () => {
    expect(isGoldStarPrint('Rayquaza Gold Star', 'Rare Holo')).toBe(true);
    expect(isGoldStarPrint('Rayquaza ☆', null)).toBe(true);
    expect(isGoldStarPrint('Charizard', 'Rare Holo')).toBe(false);
  });

  it('detects Shinings on vintage/mid, not modern shiny names alone', () => {
    expect(isShiningPrint('Shining Magikarp', 'Rare Shining', 'vintage')).toBe(true);
    expect(isShiningPrint('Shiny Charizard', 'Rare', 'modern')).toBe(false);
  });

  it('detects SIR / alt-art from rarity metadata', () => {
    expect(isSirAltPrint('Gardevoir', 'Special Illustration Rare')).toBe(true);
    expect(isSirAltPrint('Umbreon', 'Illustration Rare')).toBe(true);
    expect(isSirAltPrint('Pikachu', 'Common')).toBe(false);
  });

  it('returns only identifiable specials', () => {
    expect(
      detectSpecialCohorts({
        name: 'Rayquaza ☆',
        rarity: 'Rare Holo',
        era: 'vintage',
      })
    ).toContain('gold_star');
    expect(
      detectSpecialCohorts({
        name: 'Basic Energy',
        rarity: 'Common',
        era: 'modern',
      })
    ).toEqual([]);
  });
});

describe('cohort aggregation', () => {
  it('returns thin empty stats without inventing numbers', () => {
    const empty = aggregateCohortReturns([]);
    expect(empty.sampleSize).toBe(0);
    expect(empty.medianReturnPct).toBeNull();
    expect(empty.trimmedMeanReturnPct).toBeNull();
    expect(empty.breadthUpPct).toBeNull();
    expect(empty.confidence).toBe('thin');
  });

  it('marks thin cohorts and computes median / breadth', () => {
    const stats = aggregateCohortReturns([10, -5, 8, 2, -1], [5, -2, 4, 1, -0.5]);
    expect(stats.sampleSize).toBe(5);
    expect(stats.confidence).toBe('thin');
    expect(stats.medianReturnPct).toBe(2);
    expect(stats.upCount).toBe(3);
    expect(stats.downCount).toBe(2);
    expect(stats.breadthUpPct).toBe(60);
  });

  it('median and trimmed mean stay honest on outliers', () => {
    expect(median([1, 2, 100])).toBe(2);
    expect(trimmedMean([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 0.1)).toBeLessThan(20);
  });

  it('confidence ladders with sample size', () => {
    expect(confidenceFromSample(0)).toBe('thin');
    expect(confidenceFromSample(7)).toBe('thin');
    expect(confidenceFromSample(15)).toBe('low');
    expect(confidenceFromSample(30)).toBe('medium');
    expect(confidenceFromSample(80)).toBe('high');
  });

  it('classifies rotation into / out / neutral', () => {
    expect(
      classifyRotation({
        shareOfGainers: 0.4,
        shareOfLosers: 0.15,
        medianReturnPct: 6,
        sampleSize: 40,
        confidence: 'medium',
      })
    ).toBe('into');
    expect(
      classifyRotation({
        shareOfGainers: 0.1,
        shareOfLosers: 0.35,
        medianReturnPct: -5,
        sampleSize: 40,
        confidence: 'medium',
      })
    ).toBe('out');
    expect(
      classifyRotation({
        shareOfGainers: 0.2,
        shareOfLosers: 0.2,
        medianReturnPct: 1,
        sampleSize: 4,
        confidence: 'thin',
      })
    ).toBe('neutral');
  });
});
