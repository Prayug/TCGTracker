import { OnePieceCard, OnePieceSet } from '../types/onepiece';
import { cacheService } from './cacheService';
import { buildApiUrl } from '../config/env';
import { fetchFullOptcgCatalog, searchOptcgCatalog } from './onePieceOptcgCatalog';

/** Vite dev proxy in development; direct API only as last resort in production. */
function getOptcgBaseUrl(): string {
  if (import.meta.env.DEV) {
    return '/api/optcg';
  }
  return 'https://optcgapi.com/api';
}

interface OPTCGCardResponse {
  inventory_price: number;
  market_price: number;
  card_name: string;
  set_name: string;
  card_text: string;
  set_id: string;
  rarity: string;
  card_set_id: string;
  card_color: string;
  card_type: string;
  life: string | null;
  card_cost: string | null;
  card_power: string | null;
  sub_types: string | null;
  counter_amount: number | null;
  attribute: string | null;
  date_scraped: string;
  card_image_id: string;
  card_image: string;
}

function buildCatalogId(raw: Pick<OPTCGCardResponse, 'set_id' | 'card_image_id' | 'card_name'>): string {
  return `${raw.set_id}::${raw.card_image_id}::${raw.card_name}`;
}

function mapCard(raw: OPTCGCardResponse): OnePieceCard {
  return {
    id: buildCatalogId(raw),
    name: raw.card_name,
    images: {
      small: raw.card_image,
      large: raw.card_image,
    },
    set: {
      id: raw.set_id,
      name: raw.set_name,
    },
    number: raw.card_set_id,
    rarity: raw.rarity || undefined,
    cardColor: raw.card_color || undefined,
    cardType: raw.card_type || undefined,
    cardCost: raw.card_cost || undefined,
    cardPower: raw.card_power || undefined,
    counterAmount: raw.counter_amount ?? undefined,
    life: raw.life || undefined,
    subTypes: raw.sub_types || undefined,
    attribute: raw.attribute || undefined,
    cardText: raw.card_text || undefined,
    marketPrice: raw.market_price ?? undefined,
    inventoryPrice: raw.inventory_price ?? undefined,
  };
}

async function fetchBackend<T>(endpoint: string, params?: Record<string, string>, retries = 2): Promise<T> {
  const url = new URL(buildApiUrl(endpoint));
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.append(k, v);
    });
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < retries) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        throw new Error(`API ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err as Error;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error('Unknown API error');
}

async function fetchOptcgFallback<T>(path: string): Promise<T> {
  const base = getOptcgBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${base}${normalized}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`OPTCG API ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

class OnePieceApiService {
  async getSets(): Promise<OnePieceSet[]> {
    const cacheKey = 'op_sets_all';
    const cached = cacheService.get<OnePieceSet[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetchBackend<{ data?: OnePieceSet[] }>('/api/cards/onepiece/sets');
      const sets = response.data ?? [];
      cacheService.set(cacheKey, sets, 60 * 60 * 1000);
      return sets;
    } catch (err) {
      console.error('Error fetching One Piece sets from backend, trying OPTCG:', err);
      try {
        const raw = await fetchOptcgFallback<{ set_name: string; set_id: string }[]>('/allSets/');
        const sets = raw.map((s) => ({ id: s.set_id, name: s.set_name }));
        cacheService.set(cacheKey, sets, 60 * 60 * 1000);
        return sets;
      } catch {
        return [];
      }
    }
  }

  async getSetCards(setId: string): Promise<OnePieceCard[]> {
    const cacheKey = `op_cards_${setId}`;
    const cached = cacheService.get<OnePieceCard[]>(cacheKey);
    if (cached) return cached;

    try {
      const raw = await fetchOptcgFallback<OPTCGCardResponse[]>(`/sets/${encodeURIComponent(setId)}/`);
      const cards = raw.map(mapCard);
      cacheService.set(cacheKey, cards, 15 * 60 * 1000);
      return cards;
    } catch (err) {
      console.error(`Error fetching One Piece cards for set ${setId}:`, err);
      return [];
    }
  }

  async searchCards(query?: string, setId?: string): Promise<OnePieceCard[]> {
    if (!query || query.trim().length < 2) return [];

    const cacheKey = `op_search_v3_${query}_${setId || 'all'}`;
    const cached = cacheService.get<OnePieceCard[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetchBackend<{ data?: OnePieceCard[] }>('/api/cards/onepiece', {
        query: query.trim(),
        setId: setId || '',
        limit: '2000',
      });
      const cards = (response.data || []).filter((c) => c?.id);
      cacheService.set(cacheKey, cards, 10 * 60 * 1000);
      return cards;
    } catch (err) {
      console.error('Backend One Piece search failed, falling back to full OPTCG catalog:', err);

      try {
        const catalog = await fetchFullOptcgCatalog(fetchOptcgFallback);
        const filtered = searchOptcgCatalog(catalog, query, setId);
        cacheService.set(cacheKey, filtered, 10 * 60 * 1000);
        return filtered;
      } catch (fallbackErr) {
        console.error('One Piece search fallback failed:', fallbackErr);
        return [];
      }
    }
  }

  async getCardById(cardSetId: string): Promise<OnePieceCard | null> {
    const cacheKey = `op_card_${cardSetId}`;
    const cached = cacheService.get<OnePieceCard>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetchBackend<{ data?: OnePieceCard }>(
        `/api/cards/onepiece/card/${encodeURIComponent(cardSetId)}`
      );
      const card = response.data ?? null;
      if (card) {
        cacheService.set(cacheKey, card, 30 * 60 * 1000);
      }
      return card;
    } catch (err) {
      console.error(`Backend card fetch failed for ${cardSetId}, trying OPTCG:`, err);
      try {
        const raw = await fetchOptcgFallback<OPTCGCardResponse | OPTCGCardResponse[]>(
          `/sets/card/${encodeURIComponent(cardSetId)}/`
        );
        const variants = Array.isArray(raw) ? raw : [raw];
        if (!variants.length) return null;

        const best = variants.reduce((a, b) =>
          (b.market_price ?? 0) >= (a.market_price ?? 0) ? b : a
        );
        const card = mapCard(best);
        cacheService.set(cacheKey, card, 30 * 60 * 1000);
        return card;
      } catch {
        return null;
      }
    }
  }

  extractCardPrice(card: OnePieceCard): number {
    return card.marketPrice ?? card.inventoryPrice ?? 0;
  }

  async getPriceHistory(catalogId: string): Promise<{ date: string; price: number }[]> {
    const cacheKey = `op_price_history_${catalogId}`;
    const cached = cacheService.get<{ date: string; price: number }[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await fetchBackend<{ priceHistory?: { date: string; price: number }[] }>(
        `/api/prices/onepiece/${encodeURIComponent(catalogId)}`
      );
      const history = (response.priceHistory || []).filter((e) => e.price > 0 && e.date);
      cacheService.set(cacheKey, history, 30 * 60 * 1000);
      return history;
    } catch (err) {
      console.error(`Error fetching price history for ${catalogId}:`, err);
      return [];
    }
  }
}

export const onePieceApi = new OnePieceApiService();
