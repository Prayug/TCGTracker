import { getDb } from '../../db/database';
import { getCatalogCardsForQuery } from '../cardDatabase';
import { buildPokemonTcgNameQuery, compactSearchText, searchTokens } from '../../utils/searchText';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<void>((resolve, reject) => {
    getDb().run(sql, params, (err) => (err ? reject(err) : resolve()));
  });

const CARDS: Array<[string, string, string, string, string]> = [
  // cardId, cardName, setId, setName, releaseDate
  ['neo2-7', 'Ho-Oh', 'neo3', 'Neo Revelation', '2001-09-21'],
  ['sm7-131', 'Ho-Oh GX', 'sm7', 'Celestial Storm', '2018-08-03'],
  ['ex16-100', 'Lugia & Ho-Oh', 'ex16', 'Unseen Forces', '2005-08-22'],
  ['xy9-1', 'Pinsir', 'xy9', 'BREAKpoint', '2016-02-03'],
  ['xy9-122', 'Gyarados', 'xy9', 'BREAKpoint', '2016-02-03'],
  ['base1-4', 'Charizard', 'base1', 'Base', '1999-01-09'],
  ['base1-58', 'Pikachu', 'base1', 'Base', '1999-01-09'],
  ['sv3pt5-4', 'Charizard ex', 'sv3pt5', '151', '2023-09-22'],
  ['base1-22', 'Mr. Mime', 'jungle', 'Jungle', '1999-06-16'],
  ['xy4-70', 'Hoothoot', 'xy4', 'Phantom Forces', '2014-11-05'],
];

describe('catalog search', () => {
  beforeAll(async () => {
    // Only the tables the catalog query touches; the full bootstrap leaves timers running.
    // DATABASE_PATH may resolve to a file that survives runs, so start clean.
    for (const table of ['catalog_cards', 'card_mappings', 'price_history']) {
      await run(`DROP TABLE IF EXISTS ${table}`);
    }
    await run(`CREATE TABLE catalog_cards (
      cardId TEXT PRIMARY KEY, cardName TEXT NOT NULL, setId TEXT NOT NULL, setName TEXT NOT NULL,
      setReleaseDate TEXT, cardNumber TEXT, rarity TEXT, types TEXT, artist TEXT,
      imageSmall TEXT, imageLarge TEXT, tcgplayerProductId TEXT, tcgplayerPrices TEXT,
      language TEXT NOT NULL DEFAULT 'en', matchName TEXT)`);
    await run('CREATE TABLE card_mappings (cardId TEXT, uniqueIdentifier TEXT)');
    await run(`CREATE TABLE price_history (uniqueIdentifier TEXT, date TEXT, source TEXT,
      marketPrice REAL, lowPrice REAL, highPrice REAL)`);
    for (const [cardId, cardName, setId, setName, releaseDate] of CARDS) {
      await run(
        `INSERT INTO catalog_cards (cardId, cardName, setId, setName, setReleaseDate, language)
         VALUES (?, ?, ?, ?, ?, 'en')`,
        [cardId, cardName, setId, setName, releaseDate]
      );
    }
  });

  afterAll(async () => {
    for (const table of ['catalog_cards', 'card_mappings', 'price_history']) {
      await run(`DROP TABLE IF EXISTS ${table}`);
    }
    await new Promise<void>((resolve) => getDb().close(() => resolve()));
  });

  const ids = async (query: string, setId?: string) =>
    (await getCatalogCardsForQuery(query, setId, 50, 'en')).map((row) => row.cardId);

  it('matches hyphenated names typed with spaces', async () => {
    expect(await ids('ho oh')).toEqual(['neo2-7', 'sm7-131', 'ex16-100']);
    expect(await ids('Ho-Oh')).toEqual(['neo2-7', 'sm7-131', 'ex16-100']);
    expect(await ids('hooh')).toEqual(['neo2-7', 'sm7-131', 'ex16-100']);
  });

  it('matches punctuation-free names', async () => {
    expect(await ids('mr mime')).toEqual(['base1-22']);
  });

  it('returns every card in a set searched by set name', async () => {
    expect((await ids('breakpoint')).sort()).toEqual(['xy9-1', 'xy9-122']);
  });

  it('ranks name matches ahead of set matches', async () => {
    expect(await ids('charizard')).toEqual(['base1-4', 'sv3pt5-4']);
  });

  it('falls back to matching words across name and set', async () => {
    expect(await ids('charizard base')).toEqual(['base1-4']);
    expect(await ids('pikachu base')).toEqual(['base1-58']);
  });

  it('still resolves exact card ids', async () => {
    expect(await ids('base1-4')).toEqual(['base1-4']);
  });
});

describe('search text helpers', () => {
  it('compacts names', () => {
    expect(compactSearchText('Ho-Oh')).toBe('hooh');
    expect(compactSearchText('Flabébé')).toBe('flabebe');
    expect(compactSearchText('Mr. Mime')).toBe('mrmime');
  });

  it('tokenises words', () => {
    expect(searchTokens('ho-oh  ex')).toEqual(['ho', 'oh', 'ex']);
  });

  it('builds one wildcard clause per word for pokemontcg.io', () => {
    expect(buildPokemonTcgNameQuery('ho oh')).toBe('name:*ho* name:*oh*');
    expect(buildPokemonTcgNameQuery('charizard')).toBe('name:*charizard*');
    expect(buildPokemonTcgNameQuery('  ')).toBeUndefined();
  });
});
