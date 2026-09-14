import { detectListingRiskFlags, parseEbayListingTitle } from '../ebayListingParser';
import { pickBestListingMatch, scoreListingAgainstCard } from '../ebayDealMatcher';
import type { CatalogCardRef } from '../ebayDealMatcher';

const umbreonEn: CatalogCardRef = {
  cardId: 'swsh7-215',
  cardName: 'Umbreon VMAX',
  setId: 'swsh7',
  setName: 'Evolving Skies',
  cardNumber: '215/203',
  rarity: 'Secret Rare',
  variantKey: 'holofoil',
  uniqueIdentifier: 'swsh7|215|umbreonvmax|holofoil',
  language: 'en',
};

const umbreonJa: CatalogCardRef = {
  cardId: 's6a-095',
  cardName: 'ブラッキーVMAX',
  matchName: 'Umbreon VMAX',
  setId: 's6a',
  setName: 'Eevee Heroes',
  cardNumber: '095/069',
  variantKey: 'holofoil',
  uniqueIdentifier: 'ja|s6a|095|umbreonvmax|holofoil',
  language: 'ja',
};

describe('parseEbayListingTitle', () => {
  it('parses a PSA 10 Evolving Skies Umbreon', () => {
    const parsed = parseEbayListingTitle('PSA 10 Umbreon VMAX 215 Evolving Skies Pokemon');
    expect(parsed.isGraded).toBe(true);
    expect(parsed.grade).toEqual({ grader: 'psa', grade: '10' });
    expect(parsed.collectorNumber).toBe('215');
  });

  it('parses a raw alt-art with a fraction number', () => {
    const parsed = parseEbayListingTitle('Pokemon Umbreon VMAX Alt Art 215/203 Evolving Skies NM');
    expect(parsed.isGraded).toBe(false);
    expect(parsed.cardNumber).toBe('215/203');
    expect(parsed.collectorNumber).toBe('215');
  });

  it('detects Japanese Moonbreon listings', () => {
    const parsed = parseEbayListingTitle('Japanese Moonbreon Eevee Heroes PSA 10');
    expect(parsed.language).toBe('ja');
    expect(parsed.grade?.grader).toBe('psa');
  });

  it('parses One Piece card numbers', () => {
    const parsed = parseEbayListingTitle('One Piece OP09-118 Monkey D Luffy Alternate Art PSA 10');
    expect(parsed.onePieceNumber).toBe('OP09-118');
    expect(parsed.language).toBe('unknown');
  });

  it('normalizes hyphenated One Piece numbers', () => {
    const parsed = parseEbayListingTitle('One Piece OP-09-118 Luffy Japanese');
    expect(parsed.onePieceNumber).toBe('OP09-118');
    expect(parsed.language).toBe('ja');
  });

  it('detects Japanese One Piece listings that share English set codes', () => {
    expect(parseEbayListingTitle('OP09-118 Luffy JP').language).toBe('ja');
    expect(parseEbayListingTitle('One Piece OP09-118 Monkey D Luffy JPN ver').language).toBe('ja');
    expect(parseEbayListingTitle('OP09-118 Luffy JAP version').language).toBe('ja');
    expect(parseEbayListingTitle('ワンピース OP09-118 ルフィ').language).toBe('ja');
    expect(parseEbayListingTitle('【PSA10】モンキー・D・ルフィ OP09-118').language).toBe('ja');
  });

  it('detects JP glued to a One Piece card number', () => {
    expect(parseEbayListingTitle('One Piece OP09-118JP Luffy Alternate Art').language).toBe('ja');
  });

  it('detects Asian English One Piece listings', () => {
    expect(parseEbayListingTitle('One Piece OP09-118 Luffy Asian English').language).toBe('other');
    expect(parseEbayListingTitle('OP09-118 Luffy AE ver PSA 10').language).toBe('other');
  });

  it('keeps explicit English One Piece listings even when shipped from Japan', () => {
    const parsed = parseEbayListingTitle('One Piece OP09-118 Luffy English Alternate Art', null, {
      itemCountry: 'JP',
    });
    expect(parsed.language).toBe('en');
  });

  it('treats unlabeled Japan-shipped One Piece listings as Japanese', () => {
    const parsed = parseEbayListingTitle('One Piece OP09-118 Monkey D Luffy Alternate Art', null, {
      itemCountry: 'JP',
    });
    expect(parsed.language).toBe('ja');
  });
});

describe('risk flags', () => {
  it('flags proxy, lot, digital, and damaged language', () => {
    expect(detectListingRiskFlags('Umbreon VMAX proxy PSA 10')).toContain('possible_proxy_card');
    expect(detectListingRiskFlags('Lot of 10 Umbreon VMAX')).toContain('possible_lot');
    expect(detectListingRiskFlags('Pokemon TCG Live digital code card')).toContain(
      'possible_digital_item'
    );
    expect(detectListingRiskFlags('Umbreon VMAX damaged creased')).toContain('possible_damaged');
  });
});

describe('listing match against canonical cards', () => {
  it('matches the English Evolving Skies printing', () => {
    const parsed = parseEbayListingTitle('Pokemon Umbreon VMAX Alt Art 215/203 Evolving Skies NM');
    const match = scoreListingAgainstCard(
      'Pokemon Umbreon VMAX Alt Art 215/203 Evolving Skies NM',
      parsed,
      umbreonEn
    );
    expect(match).not.toBeNull();
    expect(match!.evidence).toEqual(
      expect.arrayContaining(['exact_card_number', 'set_match', 'name_match'])
    );
    expect(match!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('does not silently match a Japanese listing to the English card', () => {
    const title = 'Japanese Moonbreon Eevee Heroes PSA 10 095/069';
    const parsed = parseEbayListingTitle(title);
    const enMatch = scoreListingAgainstCard(title, parsed, umbreonEn);
    expect(enMatch).toBeNull();
    const jaMatch = scoreListingAgainstCard(title, parsed, umbreonJa);
    expect(jaMatch).not.toBeNull();
    expect(jaMatch!.card.language).toBe('ja');
  });

  it('does not attach an unlabeled listing to a Japanese catalog card', () => {
    const title = 'Pokemon Umbreon VMAX 095/069';
    const parsed = parseEbayListingTitle(title);
    expect(parsed.language).toBe('unknown');
    expect(scoreListingAgainstCard(title, parsed, umbreonJa)).toBeNull();
  });

  it('treats CJK titles as Japanese', () => {
    const parsed = parseEbayListingTitle('ポケモンカード ブラッキーVMAX PSA 10');
    expect(parsed.language).toBe('ja');
  });

  it('does not pick the English card when both printings are candidates', () => {
    const title = 'Japanese Moonbreon Eevee Heroes PSA 10 095/069';
    const parsed = parseEbayListingTitle(title);
    const best = pickBestListingMatch(title, parsed, [umbreonEn, umbreonJa]);
    expect(best?.card.cardId).toBe('s6a-095');
  });
});

const luffyEn: CatalogCardRef = {
  cardId: 'op09-118',
  cardName: 'Monkey D. Luffy',
  setId: 'op09',
  setName: 'Emperors in the New World',
  cardNumber: 'OP09-118',
  variantKey: 'normal',
  uniqueIdentifier: 'op09-118',
  language: 'en',
};

describe('One Piece listings vs English comps', () => {
  it('does not score a Japanese OP listing against the English catalog card', () => {
    const title = 'One Piece OP09-118 Monkey D Luffy JP Alternate Art';
    const parsed = parseEbayListingTitle(title);
    expect(parsed.language).toBe('ja');
    expect(scoreListingAgainstCard(title, parsed, luffyEn)).toBeNull();
  });

  it('does not score Asian English OP listings against English comps', () => {
    const title = 'One Piece OP09-118 Luffy Asian English Emperors in the New World';
    const parsed = parseEbayListingTitle(title);
    expect(parsed.language).toBe('other');
    expect(scoreListingAgainstCard(title, parsed, luffyEn)).toBeNull();
  });

  it('still matches unlabeled English-market OP listings', () => {
    const title = 'One Piece OP09-118 Monkey D Luffy Alternate Art Emperors in the New World';
    const parsed = parseEbayListingTitle(title);
    expect(parsed.language).toBe('unknown');
    expect(scoreListingAgainstCard(title, parsed, luffyEn)).not.toBeNull();
  });
});
