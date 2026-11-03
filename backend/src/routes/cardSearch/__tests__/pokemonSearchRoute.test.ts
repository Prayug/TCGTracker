import express from 'express';
import request from 'supertest';

const searchCardsBulk = jest.fn();
const getCatalogCardsForQuery = jest.fn();

jest.mock('../../../services/pokemonApiClient', () => ({
  pokemonApiClient: { searchCardsBulk: (...args: unknown[]) => searchCardsBulk(...args) },
}));
jest.mock('../../../services/cardCache', () => ({
  pokemonApiCache: new Map(),
  POKEMON_CACHE_TTL: 5 * 60 * 1000,
  POKEMON_PERSISTENT_CACHE_TTL: 6 * 60 * 60 * 1000,
  getPersistentPokemonCache: jest.fn().mockResolvedValue(null),
  savePersistentPokemonCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../services/cardDatabase', () => ({
  getCatalogCardsForQuery: (...args: unknown[]) => getCatalogCardsForQuery(...args),
  getLocalCardsForQuery: jest.fn().mockResolvedValue([]),
  mapCatalogRowsToPokemonCards: (rows: any[]) =>
    rows.map((row) => ({ id: row.cardId, name: row.cardName })),
  mapLocalRowsToPokemonCards: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../services/cardEnrichment', () => ({
  enrichCardsWithInvestmentData: async (cards: unknown[]) => cards,
}));
jest.mock('../../../services/catalogSync', () => ({ upsertJapaneseCatalogCards: jest.fn() }));
jest.mock('../../../services/providers/tcgdexJaCatalogProvider', () => ({
  tcgdexJaCatalogProvider: { searchCardsByName: jest.fn().mockResolvedValue([]) },
}));

import searchRoutes from '../searchRoutes';

const app = express();
app.use('/api/cards', searchRoutes);

describe('GET /api/cards/pokemon', () => {
  beforeEach(() => {
    searchCardsBulk.mockReset();
    getCatalogCardsForQuery.mockReset();
  });

  it('answers from the local catalog when the live API is slow', async () => {
    searchCardsBulk.mockReturnValue(new Promise(() => {}));
    getCatalogCardsForQuery.mockResolvedValue([{ cardId: 'neo2-7', cardName: 'Ho-Oh' }]);

    const started = Date.now();
    const res = await request(app).get('/api/cards/pokemon').query({ query: 'ho oh slow' });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('catalog_database');
    expect(res.body.data.map((c: any) => c.id)).toEqual(['neo2-7']);
    expect(Date.now() - started).toBeLessThan(6000);
  }, 10000);

  it('answers from the local catalog when the live API fails', async () => {
    searchCardsBulk.mockRejectedValue(new Error('Pokemon API 400 Bad Request'));
    getCatalogCardsForQuery.mockResolvedValue([{ cardId: 'neo2-7', cardName: 'Ho-Oh' }]);

    const res = await request(app).get('/api/cards/pokemon').query({ query: 'ho oh fail' });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('catalog_database');
  });

  it('prefers live results that arrive within the budget', async () => {
    searchCardsBulk.mockResolvedValue({
      cards: [{ id: 'sm7-131', name: 'Ho-Oh GX' }],
      totalCount: 1,
      pagesFetched: 1,
    });
    getCatalogCardsForQuery.mockResolvedValue([{ cardId: 'neo2-7', cardName: 'Ho-Oh' }]);

    const res = await request(app).get('/api/cards/pokemon').query({ query: 'ho oh live' });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('pokemon_tcg_api');
  });

  it('serves set-name matches when the live name search is empty', async () => {
    searchCardsBulk.mockResolvedValue({ cards: [], totalCount: 0, pagesFetched: 1 });
    getCatalogCardsForQuery.mockResolvedValue([{ cardId: 'xy9-1', cardName: 'Pinsir' }]);

    const res = await request(app).get('/api/cards/pokemon').query({ query: 'breakpoint' });

    expect(res.status).toBe(200);
    expect(res.body.data.map((c: any) => c.id)).toEqual(['xy9-1']);
  });

  it('returns 404, not 502, when nothing matches anywhere', async () => {
    searchCardsBulk.mockResolvedValue({ cards: [], totalCount: 0, pagesFetched: 1 });
    getCatalogCardsForQuery.mockResolvedValue([]);

    const res = await request(app).get('/api/cards/pokemon').query({ query: 'zzzz' });

    expect(res.status).toBe(404);
  });
});
