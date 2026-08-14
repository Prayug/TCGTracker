import {
  applyConditionToNmMarket,
  formatRawGradeLabel,
  parseRawCardCondition,
} from '../cardCondition';

describe('parseRawCardCondition', () => {
  it('reads Near Mint from the title', () => {
    const parsed = parseRawCardCondition({
      title: 'Pokemon Umbreon VMAX 215/203 Evolving Skies NM',
      ebayCondition: 'Ungraded',
    });
    expect(parsed.condition).toBe('nm');
    expect(parsed.factor).toBe(1);
  });

  it('reads Lightly Played from the title', () => {
    expect(
      parseRawCardCondition({ title: 'Charizard 4/102 Base Set Lightly Played' }).condition
    ).toBe('lp');
  });

  it('does not treat Base Set HP as Heavily Played', () => {
    expect(
      parseRawCardCondition({ title: 'Pokemon Charizard 4/102 Base Set HP Holo' }).condition
    ).toBe('unknown');
  });

  it('reads Heavily Played from the full phrase', () => {
    expect(
      parseRawCardCondition({ title: 'Charizard 4/102 Base Set Heavily Played holo' }).condition
    ).toBe('hp');
  });

  it('uses eBay Very Good as LP when the title is silent', () => {
    expect(
      parseRawCardCondition({
        title: 'Pokemon Charizard 4/102 Base Set',
        ebayCondition: 'Very Good',
        ebayConditionId: '4000',
      }).condition
    ).toBe('lp');
  });

  it('prefers title LP over eBay New', () => {
    expect(
      parseRawCardCondition({
        title: 'Pikachu 25/102 Lightly Played',
        ebayCondition: 'New',
        ebayConditionId: '1000',
      }).condition
    ).toBe('lp');
  });

  it('reads a card-condition descriptor', () => {
    expect(
      parseRawCardCondition({
        title: 'Pokemon Umbreon VMAX 215 Evolving Skies',
        conditionDescriptors: ['Card Condition: Moderately Played'],
      }).condition
    ).toBe('mp');
  });
});

describe('applyConditionToNmMarket', () => {
  it('leaves NM marks unchanged', () => {
    const nm = parseRawCardCondition({ title: 'Umbreon NM' });
    expect(applyConditionToNmMarket(100, nm)).toEqual({
      marketValue: 100,
      nmMarketValue: 100,
      factor: 1,
    });
  });

  it('haircuts LP to 70% of the NM mark', () => {
    const lp = parseRawCardCondition({ title: 'Umbreon Lightly Played' });
    expect(applyConditionToNmMarket(100, lp).marketValue).toBe(70);
  });

  it('does not treat an LP listing at 80% of NM as a 20% deal', () => {
    const lp = parseRawCardCondition({ title: 'Umbreon Lightly Played' });
    const adjusted = applyConditionToNmMarket(100, lp);
    expect(adjusted.marketValue).toBe(70);
    expect(80 < adjusted.marketValue).toBe(false);
  });
});

describe('formatRawGradeLabel', () => {
  it('keeps unknown raw listings unlabeled', () => {
    expect(formatRawGradeLabel(parseRawCardCondition({ title: 'Umbreon VMAX 215' }))).toBe('Raw');
  });

  it('shows LP on the raw badge', () => {
    expect(formatRawGradeLabel(parseRawCardCondition({ title: 'Umbreon Lightly Played' }))).toBe(
      'Raw · LP'
    );
  });
});
