import { PokemonCard, PokemonSet } from '../types/pokemon';
import { cacheService } from './cacheService';
import { buildApiUrl } from '../config/env';
import { dedupeCards } from '../utils/cardPrice';

function estimateResultVolume(query?: string): 'small' | 'large' {
  if (!query) return 'large';
  const trimmed = query.trim();
  if (trimmed.length >= 6 && !trimmed.includes('*')) return 'small';
  return 'large';
}

const POKEMON_TCG_IMG_HOST = 'https://images.pokemontcg.io';
const POKEMON_TCG_IMG_PROXY = '/images/pokemontcg';

export function proxyImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(POKEMON_TCG_IMG_HOST, POKEMON_TCG_IMG_PROXY);
}

function rewriteCardImages<T extends { images?: { small?: string; large?: string } }>(card: T): T {
  if (!card.images) return card;
  return {
    ...card,
    images: {
      ...card.images,
      small: proxyImageUrl(card.images.small),
      large: proxyImageUrl(card.images.large),
    },
  };
}

class PokemonApiService {
  private pendingRequests = new Map<string, Promise<PokemonCard[]>>();

  private async fetchBackend<T>(endpoint: string, params?: Record<string, string>, retries = 2): Promise<T> {
    const url = new URL(buildApiUrl(endpoint));
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v) url.searchParams.append(k, v);
      });
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          if ([429, 500, 502, 503, 504].includes(response.status) && attempt < retries) {
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }
          throw new Error(`API ${response.status}: ${response.statusText}`);
        }

        return (await response.json()) as T;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err as Error;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error('Unknown API error');
  }

  async searchCards(
    query?: string,
    setId?: string,
    pageSize = 250,
  ): Promise<PokemonCard[]> {
    const cacheKey = `cards_${query || 'all'}_${setId || 'all'}_${pageSize}`;

    const cached = cacheService.get<PokemonCard[]>(cacheKey);
    if (cached) return cached;

    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey)!;
    }

    const requestPromise = (async (): Promise<PokemonCard[]> => {
      try {
        if (!query || query.trim().length < 2) {
          return [];
        }

        const volume = estimateResultVolume(query);
        const response = await this.fetchBackend<{
          data?: PokemonCard[];
          source?: string;
          totalCount?: number;
        }>('/api/cards/pokemon', {
          query: query.trim(),
          setId: setId || '',
          pageSize: pageSize.toString(),
          fetchAll: volume === 'large' ? 'true' : 'false',
          maxPages: volume === 'large' ? '10' : '2',
        });

        const cards = dedupeCards((response.data || []).filter((card) => card?.id)).map(rewriteCardImages);
        cacheService.set(cacheKey, cards, 5 * 60 * 1000);
        return cards;
      } catch (err) {
        console.error('Error searching cards:', err);
        return [];
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  async getSets(): Promise<PokemonSet[]> {
    const cacheKey = 'sets_all';
    const cached = cacheService.get<PokemonSet[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.fetchBackend<{ data?: PokemonSet[] }>('/api/cards/sets');
      const sets = response.data ?? [];
      cacheService.set(cacheKey, sets, 60 * 60 * 1000);
      return sets;
    } catch (err) {
      console.error('Error fetching sets:', err);
      return [];
    }
  }

  async getCardById(id: string): Promise<PokemonCard | null> {
    const cacheKey = `card_${id}`;
    const cached = cacheService.get<PokemonCard>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.fetchBackend<{ data?: PokemonCard[] }>(
        '/api/cards/search',
        { query: id, limit: '20' }
      );
      const card = (response.data || []).find((entry) => entry.id === id) || null;
      if (!card) {
        return null;
      }
      const rewritten = rewriteCardImages(card);
      cacheService.set(cacheKey, rewritten, 30 * 60 * 1000);
      return rewritten;
    } catch (err) {
      console.error(`Error fetching card ${id}:`, err);
      return null;
    }
  }

  extractCardPrice(card: PokemonCard, preferredVariant?: string): number {
    if (card.tcgplayer?.prices) {
      const prices = card.tcgplayer.prices;
      const variants = [
        preferredVariant,
        'normal',
        'holofoil',
        'reverseHolofoil',
        '1stEditionHolofoil',
        '1stEditionNormal',
        'unlimited',
      ].filter(Boolean) as string[];
      for (const v of variants) {
        if (prices[v]?.market) return prices[v].market!;
      }
      for (const p of Object.values(prices)) {
        if (p.market) return p.market;
        if (p.mid) return p.mid;
        if (p.high) return p.high;
        if (p.low) return p.low;
      }
    }
    if (card.cardmarket?.prices?.averageSellPrice) {
      return card.cardmarket.prices.averageSellPrice;
    }
    return 0;
  }
}

export const pokemonApi = new PokemonApiService();
