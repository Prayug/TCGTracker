import {
  classifyMoneyFlowEra,
  detectSpecialCohorts,
  isMoneyFlowRelevantPrint,
  type MoneyFlowEra,
  type MoneyFlowFinish,
  type MoneyFlowSpecial,
} from '@tcgtracker/shared';
import { buildMoneyFlowFromTagged, type TaggedMover } from '../moneyFlowAggregate';

function member(partial: {
  changePercent: number;
  currentPrice: number;
  previousPrice: number;
  era: MoneyFlowEra;
  finish: MoneyFlowFinish;
  specials?: MoneyFlowSpecial[];
  name?: string;
  rarity?: string | null;
}): TaggedMover {
  return {
    changePercent: partial.changePercent,
    currentPrice: partial.currentPrice,
    previousPrice: partial.previousPrice,
    dollarMove: partial.currentPrice - partial.previousPrice,
    era: partial.era,
    finish: partial.finish,
    specials: partial.specials || [],
    exemplar: {
      productName: partial.name || 'Test Card',
      changePercent: partial.changePercent,
      currentPrice: partial.currentPrice,
      previousPrice: partial.previousPrice,
      imageSmall: null,
      imageLarge: null,
      cardId: null,
      setId: null,
      setName: null,
      rarity: partial.rarity ?? null,
      finish: partial.finish,
    },
  };
}

describe('moneyFlowService aggregation', () => {
  it('returns thin empty cohorts without inventing returns', () => {
    const flow = buildMoneyFlowFromTagged(7, []);
    expect(flow.eras.every((c) => c.sampleSize === 0)).toBe(true);
    expect(flow.eras.every((c) => c.medianReturnPct === null)).toBe(true);
    expect(flow.eras.every((c) => typeof c.story === 'string' && c.story.length > 0)).toBe(true);
    expect(flow.headline.summary).toMatch(/Not enough chase|No chase/i);
    expect(flow.headline.filteredOutCount).toBe(0);
    expect(flow.rotationInto).toEqual([]);
    expect(flow.rotationOut).toEqual([]);
    expect(flow.summary.trackedCount).toBe(0);
    expect(flow.breadthBuckets).toHaveLength(6);
    expect(flow.topGainers).toEqual([]);
    expect(flow.topLosers).toEqual([]);
    expect(flow.mostActive).toEqual([]);
  });

  it('surfaces vintage into vs modern out when members rotate that way', () => {
    const tagged: TaggedMover[] = [];
    for (let i = 0; i < 25; i++) {
      tagged.push(
        member({
          changePercent: 8 + i * 0.1,
          currentPrice: 100 + i,
          previousPrice: 90,
          era: 'vintage',
          finish: 'psa10',
          specials: i < 5 ? ['gold_star'] : [],
          name: `Vintage Gem ${i}`,
          rarity: 'Rare Holo',
        })
      );
    }
    for (let i = 0; i < 25; i++) {
      tagged.push(
        member({
          changePercent: -6 - i * 0.1,
          currentPrice: 40,
          previousPrice: 50 + i,
          era: 'modern',
          finish: 'raw',
          specials: i < 5 ? ['sir_alt'] : [],
          name: `Modern Chase ${i}`,
          rarity: 'Special Illustration Rare',
        })
      );
    }

    const flow = buildMoneyFlowFromTagged(7, tagged, '2026-09-30', 12);
    const vintage = flow.eras.find((c) => c.key === 'vintage')!;
    const modern = flow.eras.find((c) => c.key === 'modern')!;
    expect(vintage.medianReturnPct).toBeGreaterThan(0);
    expect(modern.medianReturnPct).toBeLessThan(0);
    expect(vintage.rotation).toBe('into');
    expect(modern.rotation).toBe('out');
    expect(vintage.story).toMatch(/Chased|chased|Vintage/i);
    expect(flow.rotationInto.length).toBeGreaterThan(0);
    expect(flow.rotationInto.length).toBeLessThanOrEqual(3);
    expect(flow.rotationOut.some((c) => c.key.includes('modern') || c.key === 'modern')).toBe(true);
    expect(flow.headline.summary).toMatch(/up|down|Into|Out/i);
    expect(flow.headline.filteredOutCount).toBe(12);

    const intoKeys = flow.rotationInto.map((c) => c.key);
    if (intoKeys.includes('vintage|psa10')) {
      expect(intoKeys.includes('vintage')).toBe(false);
    }

    const gold = flow.specials.find((c) => c.key === 'gold_star')!;
    expect(gold.sampleSize).toBe(5);
    expect(gold.confidence).toBe('thin');
    expect(gold.dataNote).toMatch(/Only 5|hint/i);

    expect(flow.summary.trackedCount).toBe(50);
    expect(flow.summary.risingCount).toBe(25);
    expect(flow.summary.fallingCount).toBe(25);
    expect(flow.summary.strongestLabel).toBeTruthy();
    expect(flow.breadthBuckets.reduce((s, b) => s + b.count, 0)).toBe(50);
    expect(flow.insights.length).toBeGreaterThan(0);
    expect(flow.topGainers.length).toBeGreaterThan(0);
    expect(flow.topLosers.length).toBeGreaterThan(0);
    expect(flow.mostActive.length).toBeGreaterThan(0);
  });

  it('classifies eras and keeps bulk commons out of relevance', () => {
    expect(classifyMoneyFlowEra({ id: 'ex11', name: 'Delta Species' })).toBe('vintage');
    expect(classifyMoneyFlowEra({ id: 'sv3', name: 'Obsidian Flames' })).toBe('modern');
    expect(
      detectSpecialCohorts({ name: 'Shining Charizard', rarity: 'Rare Shining', era: 'vintage' })
    ).toContain('shining');
    expect(
      isMoneyFlowRelevantPrint({
        rarity: 'Common',
        name: 'Pidgey',
        currentPrice: 2,
        finish: 'raw',
      })
    ).toBe(false);
    expect(
      isMoneyFlowRelevantPrint({
        rarity: 'Rare Holo',
        name: 'Charizard',
        currentPrice: 45,
        finish: 'raw',
      })
    ).toBe(true);
  });
});
