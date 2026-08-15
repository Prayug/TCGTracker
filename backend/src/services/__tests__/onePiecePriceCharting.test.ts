import { describe, it, expect } from '@jest/globals';
import {
  stripOpNameDecorators,
  expectedOpPrintFamily,
  detectOpPrintFamily,
  opPrintFamiliesMatch,
  opSetNamesMatch,
  guessOnePieceConsoleName,
  stripOpPeriodsForSlug,
} from '../onePiecePriceCharting';
import {
  isAcceptableMatch,
  selectBestProductMatch,
  extractCardNumbers,
  normalizeCardNumber,
  buildDirectProductUrl,
  titleIncludesNumber,
} from '../priceChartingClient';
import { guessConsoleName } from '../priceChartingResolver';

describe('One Piece name / family parsing', () => {
  it('strips collector-number and variant parentheses', () => {
    expect(stripOpNameDecorators('Monkey.D.Luffy (003) (Parallel)')).toBe('Monkey.D.Luffy');
    expect(stripOpNameDecorators('Shanks (Parallel) (Manga) (Alternate Art)')).toBe('Shanks');
    expect(stripOpNameDecorators('Sabo (120) (SP)')).toBe('Sabo');
  });

  it('maps OPTCG variant tags onto PriceCharting families', () => {
    expect(
      expectedOpPrintFamily({ cardName: 'Monkey.D.Luffy (003)', cardImageId: 'OP01-003' })
    ).toBe('standard');
    expect(
      expectedOpPrintFamily({
        cardName: 'Monkey.D.Luffy (003) (Parallel)',
        cardImageId: 'OP01-003_p1',
      })
    ).toBe('parallel');
    expect(
      expectedOpPrintFamily({
        cardName: 'Shanks (Parallel) (Manga) (Alternate Art)',
        cardImageId: 'OP01-120_p2',
      })
    ).toBe('manga');
    expect(
      expectedOpPrintFamily({
        cardName: 'Sabo (120) (Red Super Alternate Art)',
        cardImageId: 'OP13-120_p3',
      })
    ).toBe('redmanga');
    expect(
      expectedOpPrintFamily({
        cardName: 'Sabo (120) (Wanted Poster)',
        cardImageId: 'OP13-120_p4',
      })
    ).toBe('wanted');
    expect(
      expectedOpPrintFamily({ cardName: 'Sabo (120) (SP)', cardImageId: 'OP13-120' })
    ).toBe('standard');
  });

  it('keeps anniversary reprints distinct from the cheap base and from each other', () => {
    expect(
      expectedOpPrintFamily({
        cardName: 'Monkey.D.Luffy (English Version 1st Anniversary Set)',
        cardImageId: 'ST10-006_pr3',
      })
    ).toBe('anniversary');
    expect(
      expectedOpPrintFamily({
        cardName: 'Monkey.D.Luffy (3rd Anniversary Treasure Campaign Pack)',
        cardImageId: 'ST10-006_pr1',
      })
    ).toBe('anniversary3');
    expect(
      expectedOpPrintFamily({ cardName: 'Monkey.D.Luffy', cardImageId: 'ST10-006' })
    ).toBe('standard');
  });

  it('does not treat OPTCG _pr3 promo reprints as red manga (_p3)', () => {
    expect(
      expectedOpPrintFamily({
        cardName: 'Monkey.D.Luffy (English Version 1st Anniversary Set)',
        cardImageId: 'ST10-006_pr3',
      })
    ).not.toBe('redmanga');
  });

  it('detects families from PriceCharting titles', () => {
    expect(detectOpPrintFamily('Monkey.D.Luffy OP01-003', '')).toBe('standard');
    expect(detectOpPrintFamily('Monkey.D.Luffy [Alt Art] OP01-003', '')).toBe('parallel');
    expect(detectOpPrintFamily('Shanks [Manga Alternate Art] OP01-120', '')).toBe('manga');
    expect(detectOpPrintFamily('Sabo [Red Manga] OP13-120', '')).toBe('redmanga');
    expect(detectOpPrintFamily('Sabo [Wanted] OP13-120', '')).toBe('wanted');
    expect(
      detectOpPrintFamily(
        '',
        'https://www.pricecharting.com/game/one-piece-romance-dawn/monkeydluffy-alt-art-op01-003'
      )
    ).toBe('parallel');
    expect(
      detectOpPrintFamily(
        'Monkey.D.Luffy [Anniversary] ST10-006',
        'https://www.pricecharting.com/game/one-piece-ultra-deck-the-three-captains/monkeydluffy-anniversary-st10-006'
      )
    ).toBe('anniversary');
    expect(
      detectOpPrintFamily(
        'Monkey.D.Luffy [3rd Anniversary] ST10-006',
        'https://www.pricecharting.com/game/one-piece-promo/monkeydluffy-3rd-anniversary-st10-006'
      )
    ).toBe('anniversary3');
    expect(detectOpPrintFamily('Monkey.D.Luffy ST10-006', '')).toBe('standard');
  });

  it('does not treat manga alt art as a cheap parallel', () => {
    expect(
      opPrintFamiliesMatch(
        expectedOpPrintFamily({ cardName: 'Shanks (Parallel) (Manga) (Alternate Art)' }),
        detectOpPrintFamily('Shanks [Alternate Art] OP01-120', '')
      )
    ).toBe(false);
    expect(
      opPrintFamiliesMatch(
        expectedOpPrintFamily({ cardName: 'Shanks (Parallel) (Manga) (Alternate Art)' }),
        detectOpPrintFamily('Shanks [Manga Alternate Art] OP01-120', '')
      )
    ).toBe(true);
  });
});

describe('One Piece collector numbers', () => {
  it('normalizes hyphenated codes without dropping the set prefix', () => {
    expect(normalizeCardNumber('OP01-003')).toBe('op01003');
    expect(normalizeCardNumber('#OP01-003')).toBe('op01003');
    expect(normalizeCardNumber('ST01-016')).toBe('st01016');
  });

  it('extracts OP01-003 from PriceCharting titles and slugs', () => {
    expect(extractCardNumbers('Monkey.D.Luffy [Alt Art] OP01-003')).toContain('op01003');
    expect(extractCardNumbers('Monkey.D.Luffy #OP01-003')).toContain('op01003');
    expect(
      extractCardNumbers(
        'https://www.pricecharting.com/game/one-piece-romance-dawn/monkeydluffy-alt-art-op01-003'
      )
    ).toContain('op01003');
  });

  it('matches OP numbers without treating 003 as a hit inside OP01-003', () => {
    expect(
      titleIncludesNumber(
        'Monkey.D.Luffy #OP01-003',
        'OP01-003',
        'https://www.pricecharting.com/game/one-piece-romance-dawn/monkeydluffy-op01-003'
      )
    ).toBe(true);
    expect(titleIncludesNumber('Monkey.D.Luffy #OP01-024', 'OP01-003')).toBe(false);
  });
});

describe('One Piece product matching', () => {
  const base = {
    productId: '6235261',
    url: 'https://www.pricecharting.com/game/one-piece-romance-dawn/monkeydluffy-op01-003',
    title: 'Monkey.D.Luffy OP01-003',
    setName: 'One Piece Romance Dawn',
  };
  const alt = {
    productId: '6235243',
    url: 'https://www.pricecharting.com/game/one-piece-romance-dawn/monkeydluffy-alt-art-op01-003',
    title: 'Monkey.D.Luffy [Alt Art] OP01-003',
    setName: 'One Piece Romance Dawn',
  };
  const manga = {
    productId: '1',
    url: 'https://www.pricecharting.com/game/one-piece-romance-dawn/shanks-manga-alternate-art-op01-120',
    title: 'Shanks [Manga Alternate Art] OP01-120',
    setName: 'One Piece Romance Dawn',
  };

  it('accepts the base print and rejects the alt art for a standard leader', () => {
    const input = {
      cardName: 'Monkey.D.Luffy (003)',
      setName: 'Romance Dawn',
      cardNumber: 'OP01-003',
      game: 'onepiece' as const,
      cardImageId: 'OP01-003',
    };
    expect(isAcceptableMatch(base, input)).toBe(true);
    expect(isAcceptableMatch(alt, input)).toBe(false);
  });

  it('accepts alt art for Parallel and rejects the cheap base', () => {
    const input = {
      cardName: 'Monkey.D.Luffy (003) (Parallel)',
      setName: 'Romance Dawn',
      cardNumber: 'OP01-003',
      game: 'onepiece' as const,
      cardImageId: 'OP01-003_p1',
    };
    expect(isAcceptableMatch(alt, input)).toBe(true);
    expect(isAcceptableMatch(base, input)).toBe(false);
    expect(selectBestProductMatch([base, alt], input)?.row.productId).toBe('6235243');
  });

  it('does not match a Pokemon product to a One Piece request', () => {
    const pikachu = {
      productId: 'x',
      url: 'x',
      title: 'Pikachu ex #276',
      setName: 'Pokemon Ascended Heroes',
    };
    expect(
      isAcceptableMatch(pikachu, {
        cardName: 'Monkey.D.Luffy (003)',
        setName: 'Romance Dawn',
        cardNumber: 'OP01-003',
        game: 'onepiece',
      })
    ).toBe(false);
  });

  it('does not match a One Piece product to a Pokemon request', () => {
    expect(
      isAcceptableMatch(base, {
        cardName: 'Monkey.D.Luffy',
        setName: 'Romance Dawn',
        cardNumber: 'OP01-003',
      })
    ).toBe(false);
  });

  it('keeps manga distinct from alternate art', () => {
    const altShanks = {
      ...manga,
      productId: '2',
      title: 'Shanks [Alternate Art] OP01-120',
      url: 'https://www.pricecharting.com/game/one-piece-romance-dawn/shanks-alternate-art-op01-120',
    };
    const input = {
      cardName: 'Shanks (Parallel) (Manga) (Alternate Art)',
      setName: 'Romance Dawn',
      cardNumber: 'OP01-120',
      game: 'onepiece' as const,
      cardImageId: 'OP01-120_p2',
    };
    expect(isAcceptableMatch(manga, input)).toBe(true);
    expect(isAcceptableMatch(altShanks, input)).toBe(false);
  });
});

describe('One Piece same-number reprint matching', () => {
  const baseSt10 = {
    productId: '6239262',
    url: 'https://www.pricecharting.com/game/one-piece-ultra-deck-the-three-captains/monkeydluffy-st10-006',
    title: 'Monkey.D.Luffy ST10-006',
    setName: 'One Piece Ultra Deck: The Three Captains',
  };
  const anniversary = {
    productId: '7574931',
    url: 'https://www.pricecharting.com/game/one-piece-ultra-deck-the-three-captains/monkeydluffy-anniversary-st10-006',
    title: 'Monkey.D.Luffy [Anniversary] ST10-006',
    setName: 'One Piece Ultra Deck: The Three Captains',
  };
  const anniversary3 = {
    productId: '11355191',
    url: 'https://www.pricecharting.com/game/one-piece-promo/monkeydluffy-3rd-anniversary-st10-006',
    title: 'Monkey.D.Luffy [3rd Anniversary] ST10-006',
    setName: 'One Piece Promo',
  };

  const firstAnniversaryInput = {
    cardName: 'Monkey.D.Luffy (English Version 1st Anniversary Set)',
    setName: 'One Piece Promotion Cards',
    cardNumber: 'ST10-006',
    game: 'onepiece' as const,
    cardImageId: 'ST10-006_pr3',
  };

  it('does not treat two One Piece sets as the same just because they share One Piece', () => {
    expect(opSetNamesMatch('One Piece Ultra Deck: The Three Captains', 'One Piece Promotion Cards')).toBe(
      false
    );
    expect(opSetNamesMatch('One Piece Promo', 'One Piece Promotion Cards')).toBe(true);
    expect(opSetNamesMatch('One Piece Romance Dawn', 'Romance Dawn')).toBe(true);
  });

  it('maps the English 1st Anniversary reprint to [Anniversary], not the $10 base or 3rd Anniversary', () => {
    expect(isAcceptableMatch(anniversary, firstAnniversaryInput)).toBe(true);
    expect(isAcceptableMatch(baseSt10, firstAnniversaryInput)).toBe(false);
    expect(isAcceptableMatch(anniversary3, firstAnniversaryInput)).toBe(false);
    expect(selectBestProductMatch([baseSt10, anniversary, anniversary3], firstAnniversaryInput)?.row.productId).toBe(
      '7574931'
    );
  });

  it('keeps the Ultra Deck base ST10-006 off anniversary SKUs', () => {
    const input = {
      cardName: 'Monkey.D.Luffy',
      setName: 'Ultra Deck: The Three Captains',
      cardNumber: 'ST10-006',
      game: 'onepiece' as const,
      cardImageId: 'ST10-006',
    };
    expect(isAcceptableMatch(baseSt10, input)).toBe(true);
    expect(isAcceptableMatch(anniversary, input)).toBe(false);
    expect(isAcceptableMatch(anniversary3, input)).toBe(false);
  });

  it('maps 3rd Anniversary Treasure Campaign to the Promo console SKU', () => {
    const input = {
      cardName: 'Monkey.D.Luffy (3rd Anniversary Treasure Campaign Pack)',
      setName: 'One Piece Promotion Cards',
      cardNumber: 'ST10-006',
      game: 'onepiece' as const,
      cardImageId: 'ST10-006_pr1',
    };
    expect(isAcceptableMatch(anniversary3, input)).toBe(true);
    expect(isAcceptableMatch(anniversary, input)).toBe(false);
    expect(isAcceptableMatch(baseSt10, input)).toBe(false);
  });
});

describe('One Piece console + slug', () => {
  it('guesses One Piece console names without the Pokemon prefix', () => {
    expect(guessConsoleName('Romance Dawn', 'en', 'onepiece')).toBe('One Piece Romance Dawn');
    expect(guessOnePieceConsoleName('Starter Deck 1: Straw Hat Crew')).toBe(
      'One Piece Starter Deck 1: Straw Hat Crew'
    );
    expect(guessConsoleName('Ascended Heroes', 'en')).toBe('Pokemon Ascended Heroes');
  });

  it('strips periods so Monkey.D.Luffy hits monkeydluffy', () => {
    expect(stripOpPeriodsForSlug('Monkey.D.Luffy')).toBe('MonkeyDLuffy');
    expect(
      buildDirectProductUrl(
        'One Piece Romance Dawn',
        'Monkey.D.Luffy (003) (Parallel)',
        'OP01-003',
        'parallel',
        { game: 'onepiece' }
      )
    ).toBe(
      'https://www.pricecharting.com/game/one-piece-romance-dawn/monkeydluffy-alternate-art-op01-003'
    );
    expect(
      buildDirectProductUrl(
        'One Piece Ultra Deck: The Three Captains',
        'Monkey.D.Luffy (English Version 1st Anniversary Set)',
        'ST10-006',
        undefined,
        { game: 'onepiece' }
      )
    ).toBe(
      'https://www.pricecharting.com/game/one-piece-ultra-deck-the-three-captains/monkeydluffy-anniversary-st10-006'
    );
  });
});
