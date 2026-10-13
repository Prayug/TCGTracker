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
  cardId?: string | null;
  uniqueIdentifier?: string | null;
  imageSmall?: string | null;
}): TaggedMover {
  return {
    changePercent: partial.changePercent,
    currentPrice: partial.currentPrice,
    previousPrice: partial.previousPrice,
    dollarMove: partial.currentPrice - partial.previousPrice,
    era: partial.era,
    finish: partial.finish,
    specials: partial.specials || [],
    uniqueIdentifier: partial.uniqueIdentifier ?? null,
    exemplar: {
      productName: partial.name || 'Test Card',
      changePercent: partial.changePercent,
      currentPrice: partial.currentPrice,
      previousPrice: partial.previousPrice,
      imageSmall: partial.imageSmall ?? null,
      imageLarge: null,
      cardId: partial.cardId ?? null,
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
    expect(flow.headline.summary).toMatch(/No data/i);
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
    expect(vintage.story).toMatch(/Vintage/i);
    expect(flow.rotationInto.length).toBeGreaterThan(0);
    expect(flow.rotationInto.length).toBeLessThanOrEqual(3);
    expect(flow.rotationOut.some((c) => c.key.includes('modern') || c.key === 'modern')).toBe(true);
    expect(flow.headline.summary).toMatch(/up|down|Into|Out/i);
    expect(flow.headline.filteredOutCount).toBe(12);

    const intoKeys = flow.rotationInto.map((c) => c.key);
    const outKeys = flow.rotationOut.map((c) => c.key);
    if (intoKeys.includes('vintage|psa10')) {
      expect(intoKeys.includes('vintage')).toBe(false);
    }
    if (outKeys.some((k) => k.startsWith('modern|'))) {
      expect(outKeys.includes('modern')).toBe(false);
    }
    const outFaces = flow.rotationOut.map(
      (c) => c.exemplars[0]?.cardId || c.exemplars[0]?.productName
    );
    expect(new Set(outFaces).size).toBe(outFaces.length);

    const gold = flow.specials.find((c) => c.key === 'gold_star')!;
    expect(gold.sampleSize).toBe(5);
    expect(gold.confidence).toBe('thin');
    expect(gold.dataNote).toMatch(/n=5/);

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

  it('collapses duplicate PSA 10 series for the same card', () => {
    const tagged: TaggedMover[] = [
      member({
        changePercent: -61.1,
        currentPrice: 5700,
        previousPrice: 14650,
        era: 'vintage',
        finish: 'psa10',
        name: 'Suicune ex',
        cardId: 'ex4-94',
        uniqueIdentifier: 'ex4-94::normal',
      }),
      member({
        changePercent: -61.1,
        currentPrice: 5700,
        previousPrice: 14650,
        era: 'vintage',
        finish: 'psa10',
        name: 'Suicune ex',
        cardId: 'ex4-94',
        uniqueIdentifier: 'ex4-94::holofoil',
      }),
    ];
    const flow = buildMoneyFlowFromTagged(7, tagged);
    expect(flow.summary.trackedCount).toBe(1);
    expect(flow.topLosers).toHaveLength(1);
    expect(flow.topLosers[0]?.productName).toBe('Suicune ex');
  });

  it('faces a cohort with an imaged print when the $ leader has no art', () => {
    const tagged: TaggedMover[] = [];
    for (let i = 0; i < 20; i++) {
      tagged.push(
        member({
          changePercent: i === 0 ? -40 : -7 - i * 0.05,
          currentPrice: 40,
          previousPrice: 50,
          era: 'modern',
          finish: 'raw',
          specials: ['sir_alt'],
          name: i === 0 ? 'Oricorio EX' : `Alt Art ${i}`,
          cardId: i === 0 ? 'm2-111' : `sv1-${i}`,
          rarity: 'Special Illustration Rare',
          imageSmall: i === 0 ? null : `https://images.pokemontcg.io/sv1/${i}.png`,
        })
      );
    }
    const flow = buildMoneyFlowFromTagged(7, tagged);
    const sir = flow.specials.find((c) => c.key === 'sir_alt')!;
    expect(sir.exemplars[0]?.productName).not.toBe('Oricorio EX');
    expect(sir.exemplars[0]?.imageSmall).toBeTruthy();
  });

  it('does not stack a parent era over era×finish or repeat a card face', () => {
    const tagged: TaggedMover[] = [];
    for (let i = 0; i < 25; i++) {
      tagged.push(
        member({
          changePercent: -8 - i * 0.05,
          currentPrice: 40,
          previousPrice: 50,
          era: 'modern',
          finish: 'raw',
          specials: i < 12 ? ['sir_alt'] : [],
          name: i < 12 ? 'Tympole' : `Other ${i}`,
          cardId: i < 12 ? 'zsv10pt5-103' : `sv1-${i}`,
          rarity: i < 12 ? 'Illustration Rare' : 'Rare Holo',
        })
      );
    }
    const flow = buildMoneyFlowFromTagged(7, tagged);
    const outKeys = flow.rotationOut.map((c) => c.key);
    expect(outKeys.includes('modern')).toBe(false);
    const faces = flow.rotationOut.map((c) => c.exemplars[0]?.productName);
    expect(new Set(faces).size).toBe(faces.length);
  });

  it('tracks unchanged prints without flattening rotation', () => {
    const tagged: TaggedMover[] = [];
    for (let i = 0; i < 25; i++) {
      tagged.push(
        member({
          changePercent: 8,
          currentPrice: 50,
          previousPrice: 46,
          era: 'vintage',
          finish: 'raw',
          name: `Vintage ${i}`,
          rarity: 'Rare Holo',
        })
      );
    }
    for (let i = 0; i < 80; i++) {
      tagged.push(
        member({
          changePercent: 0,
          currentPrice: 20,
          previousPrice: 20,
          era: 'vintage',
          finish: 'raw',
          name: `Flat ${i}`,
          rarity: 'Rare Holo',
        })
      );
    }
    const flow = buildMoneyFlowFromTagged(7, tagged);
    expect(flow.summary.trackedCount).toBe(105);
    expect(flow.summary.flatCount).toBe(80);
    const vintage = flow.eras.find((c) => c.key === 'vintage')!;
    expect(vintage.sampleSize).toBe(105);
    expect(vintage.medianReturnPct).toBeGreaterThan(0);
    expect(vintage.rotation).toBe('into');
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
