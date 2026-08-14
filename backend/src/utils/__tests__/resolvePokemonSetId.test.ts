import {
  foldSetToken,
  resolveCatalogSetId,
  resolvePokemonApiSetId,
  type PokemonSetRef,
} from '../resolvePokemonSetId';

const SETS: PokemonSetRef[] = [
  { id: 'pgo', name: 'Pokémon GO', series: 'Sword & Shield', ptcgoCode: 'PGO' },
  { id: 'bw1', name: 'Black & White', series: 'Black & White', ptcgoCode: 'BLW' },
  { id: 'dp1', name: 'Diamond & Pearl', series: 'Diamond & Pearl', ptcgoCode: 'DP' },
  { id: 'ex1', name: 'Ruby & Sapphire', series: 'EX', ptcgoCode: 'RS' },
  { id: 'sm1', name: 'Sun & Moon', series: 'Sun & Moon', ptcgoCode: 'SUM' },
  { id: 'sm7', name: 'Celestial Storm', series: 'Sun & Moon', ptcgoCode: 'CES' },
  { id: 'xy1', name: 'XY', series: 'XY', ptcgoCode: 'XY' },
  { id: 'sv1', name: 'Scarlet & Violet', series: 'Scarlet & Violet', ptcgoCode: 'SVI' },
  { id: 'sv5', name: 'Temporal Forces', series: 'Scarlet & Violet', ptcgoCode: 'TEF' },
  { id: 'sv8pt5', name: 'Prismatic Evolutions', series: 'Scarlet & Violet' },
  { id: 'swsh1', name: 'Sword & Shield', series: 'Sword & Shield', ptcgoCode: 'SSH' },
  { id: 'me2pt5', name: 'Ascended Heroes', series: 'Mega Evolution' },
  { id: 'me3', name: 'Perfect Order', series: 'Mega Evolution' },
  { id: 'cel25', name: 'Celebrations', series: 'Sword & Shield', ptcgoCode: 'CEL' },
  { id: 'base1', name: 'Base', series: 'Base' },
  { id: 'base4', name: 'Base Set 2', series: 'Base' },
  { id: 'svp', name: 'Scarlet & Violet Black Star Promos', series: 'Scarlet & Violet' },
  { id: 'swshp', name: 'SWSH Black Star Promos', series: 'Sword & Shield' },
  { id: 'smp', name: 'SM Black Star Promos', series: 'Sun & Moon' },
  { id: 'xyp', name: 'XY Black Star Promos', series: 'XY' },
  { id: 'bwp', name: 'BW Black Star Promos', series: 'Black & White' },
  { id: 'dpp', name: 'DP Black Star Promos', series: 'Diamond & Pearl' },
  { id: 'hsp', name: 'HGSS Black Star Promos', series: 'HeartGold & SoulSilver' },
  { id: 'np', name: 'Nintendo Black Star Promos', series: 'NP' },
  { id: 'basep', name: 'Wizards Black Star Promos', series: 'Base' },
  { id: 'mcd11', name: "McDonald's Collection 2011" },
  { id: 'mcd21', name: "McDonald's Collection 2021" },
  { id: 'ecard1', name: 'Expedition Base Set' },
];

const resolve = (id: string, name?: string) => resolvePokemonApiSetId(id, name, SETS);

describe('foldSetToken', () => {
  it('folds diacritics and ampersands', () => {
    expect(foldSetToken('Pokémon GO')).toBe('pokemongo');
    expect(foldSetToken('Black & White')).toBe('blackandwhite');
  });
});

describe('resolvePokemonApiSetId', () => {
  it('maps PriceCharting slugs onto official set ids', () => {
    expect(resolve('pokemongo', 'Pokemon GO')).toBe('pgo');
    expect(resolve('blackandwhite', 'Black and White')).toBe('bw1');
    expect(resolve('diamondandpearl', 'Diamond and Pearl')).toBe('dp1');
    expect(resolve('rubyandsapphire', 'Ruby and Sapphire')).toBe('ex1');
    expect(resolve('smcelestialstorm', 'SM - Celestial Storm')).toBe('sm7');
    expect(resolve('sv05temporalforces', 'SV05: Temporal Forces')).toBe('sv5');
    expect(resolve('svprismaticevolutions', 'SV: Prismatic Evolutions')).toBe('sv8pt5');
    expect(resolve('meascendedheroes', 'ME: Ascended Heroes')).toBe('me2pt5');
    expect(resolve('celebrations', 'Celebrations')).toBe('cel25');
  });

  it('maps era-prefixed base sets to that era, not Base Set', () => {
    expect(resolve('smbaseset', 'SM Base Set')).toBe('sm1');
    expect(resolve('xybaseset', 'XY Base Set')).toBe('xy1');
    expect(resolve('sv01scarletvioletbaseset', 'SV01: Scarlet & Violet Base Set')).toBe('sv1');
    expect(resolve('swsh01swordshieldbaseset', 'SWSH01: Sword & Shield Base Set')).toBe('swsh1');
    expect(resolve('baseset', 'Base Set')).toBe('base1');
    expect(resolve('baseset2', 'Base Set 2')).toBe('base4');
  });

  it('maps promo slugs to Black Star / McDonalds sets', () => {
    expect(resolve('svscarletvioletpromocards', 'SV: Scarlet & Violet Promo Cards')).toBe('svp');
    expect(resolve('swshswordshieldpromocards', 'SWSH: Sword & Shield Promo Cards')).toBe('swshp');
    expect(resolve('smpromos', 'SM Promos')).toBe('smp');
    expect(resolve('xypromos', 'XY Promos')).toBe('xyp');
    expect(resolve('blackandwhitepromos', 'Black and White Promos')).toBe('bwp');
    expect(resolve('hgsspromos', 'HGSS Promos')).toBe('hsp');
    expect(resolve('nintendopromos', 'Nintendo Promos')).toBe('np');
    expect(resolve('wotcpromo', 'WoTC Promo')).toBe('basep');
    expect(resolve('mcdonaldspromos2011', "McDonald's Promos 2011")).toBe('mcd11');
    expect(resolve('mcdonalds25thanniversarypromos', "McDonald's 25th Anniversary Promos")).toBe(
      'mcd21'
    );
  });

  it('does not use short substring matches', () => {
    expect(resolve('smcelestialstorm', 'SM - Celestial Storm')).not.toBe('cel25');
    expect(resolve('sv05temporalforces', 'SV05: Temporal Forces')).not.toBe('me3');
    expect(resolve('miscellaneouscardsproducts', 'Miscellaneous Cards & Products')).toBeNull();
    expect(resolve('worldchampionshipdecks', 'World Championship Decks')).toBeNull();
    expect(resolve('prizepackseriescards', 'Prize Pack Series Cards')).toBeNull();
    expect(resolve('jumbocards', 'Jumbo Cards')).toBeNull();
    expect(resolve('memegaevolutionpromo', 'ME: Mega Evolution Promo')).toBeNull();
  });
});

describe('resolveCatalogSetId', () => {
  it('prefers native catalog ids (Japanese set codes)', () => {
    expect(resolveCatalogSetId('S12a', 'VSTARユニバース', SETS, ['S12a', 'M2a', 'MC'])).toBe(
      'S12a'
    );
    expect(resolveCatalogSetId('M2a', 'MEGAドリームex', SETS, ['S12a', 'M2a'])).toBe('M2a');
  });

  it('falls back to API ids when the slug is not in catalog', () => {
    expect(resolveCatalogSetId('pokemongo', 'Pokemon GO', SETS, ['S12a'])).toBe('pgo');
  });
});
