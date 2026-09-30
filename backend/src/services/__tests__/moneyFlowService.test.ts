import {
  classifyMoneyFlowEra,
  detectSpecialCohorts,
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
      rarity: null,
      finish: partial.finish,
    },
  };
}

describe('moneyFlowService aggregation', () => {
  it('returns thin empty cohorts without inventing returns', () => {
    const flow = buildMoneyFlowFromTagged(7, []);
    expect(flow.eras.every((c) => c.sampleSize === 0)).toBe(true);
    expect(flow.eras.every((c) => c.medianReturnPct === null)).toBe(true);
    expect(flow.headline.summary).toMatch(/Not enough qualified/i);
    expect(flow.rotationInto).toEqual([]);
    expect(flow.rotationOut).toEqual([]);
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
        })
      );
    }

    const flow = buildMoneyFlowFromTagged(7, tagged, '2026-09-30');
    const vintage = flow.eras.find((c) => c.key === 'vintage')!;
    const modern = flow.eras.find((c) => c.key === 'modern')!;
    expect(vintage.medianReturnPct).toBeGreaterThan(0);
    expect(modern.medianReturnPct).toBeLessThan(0);
    expect(vintage.rotation).toBe('into');
    expect(modern.rotation).toBe('out');
    expect(flow.rotationInto.some((c) => c.key === 'vintage' || c.key.includes('vintage'))).toBe(
      true
    );
    expect(flow.rotationOut.some((c) => c.key === 'modern' || c.key.includes('modern'))).toBe(true);
    expect(flow.headline.summary).toMatch(/rotat/i);

    const gold = flow.specials.find((c) => c.key === 'gold_star')!;
    expect(gold.sampleSize).toBe(5);
    expect(gold.confidence).toBe('thin');
    expect(gold.dataNote).toMatch(/Thin sample/i);
  });

  it('classifies eras and specials from catalog metadata helpers', () => {
    expect(classifyMoneyFlowEra({ id: 'ex11', name: 'Delta Species' })).toBe('vintage');
    expect(classifyMoneyFlowEra({ id: 'sv3', name: 'Obsidian Flames' })).toBe('modern');
    expect(
      detectSpecialCohorts({ name: 'Shining Charizard', rarity: 'Rare Shining', era: 'vintage' })
    ).toContain('shining');
  });
});
