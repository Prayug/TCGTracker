import { PokemonCard, PokemonSet, ApiResponse } from '../types/pokemon';
import { cacheService } from './cacheService';

const API_BASE_URL = 'https://api.pokemontcg.io/v2';
const API_KEY = import.meta.env.VITE_POKEMON_TCG_API_KEY || '';

// How many results a query is expected to have — drives pagination strategy
function estimateResultVolume(query?: string): 'small' | 'large' {
  if (!query) return 'large';
  // Single well-known cards typically have small result sets; generic terms are large
  const trimmed = query.trim();
  // Short queries or exact names → likely small set
  if (trimmed.length >= 6 && !trimmed.includes('*')) return 'small';
  return 'large';
}

class PokemonApiService {
  private pendingRequests = new Map<string, Promise<PokemonCard[]>>();

  private buildHeaders(): HeadersInit {
    const headers: HeadersInit = { Accept: 'application/json' };
    if (API_KEY) headers['X-Api-Key'] = API_KEY;
    return headers;
  }

  private async fetchApi<T>(
    endpoint: string,
    params?: Record<string, string>,
    retries = 2
  ): Promise<ApiResponse<T>> {
    const url = new URL(`${API_BASE_URL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.append(k, v); });
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: this.buildHeaders(),
          mode: 'cors',
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          if ([429, 500, 502, 503, 504].includes(response.status) && attempt < retries) {
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }
          throw new Error(`API ${response.status}: ${response.statusText}`);
        }

        return await response.json();
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

    const queryParts: string[] = [];
    if (query?.trim()) queryParts.push(`name:*${query.trim()}*`);
    if (setId) queryParts.push(`set.id:${setId}`);
    const q = queryParts.join(' ') || undefined;

    const requestPromise = (async (): Promise<PokemonCard[]> => {
      try {
        const volume = estimateResultVolume(query);
        // For specific queries, fetch 1 page first; if full, fetch up to 3 pages total
        const initialParams: Record<string, string> = { pageSize: pageSize.toString(), page: '1' };
        if (q) initialParams.q = q;

        const firstPage = await this.fetchApi<PokemonCard>('/cards', initialParams);
        const firstCards = firstPage.data ?? [];

        // If first page isn't full or query is specific → no need for more pages
        const needsMore = volume === 'large' && firstCards.length === pageSize;

        if (!needsMore) {
          cacheService.set(cacheKey, firstCards, 10 * 60 * 1000);
          return firstCards;
        }

        // Fetch up to 2 more pages in parallel (total 3 pages = 750 cards max)
        const extraPages = [2, 3].map((page) => {
          const params: Record<string, string> = { pageSize: pageSize.toString(), page: page.toString() };
          if (q) params.q = q;
          return this.fetchApi<PokemonCard>('/cards', params)
            .then(r => r.data ?? [])
            .catch(() => [] as PokemonCard[]);
        });

        const [p2, p3] = await Promise.all(extraPages);
        const allCards = [...firstCards, ...p2, ...p3].filter(c => c?.id);

        cacheService.set(cacheKey, allCards, 10 * 60 * 1000);
        return allCards;
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
      const response = await this.fetchApi<PokemonSet>('/sets', {
        orderBy: '-releaseDate',
        pageSize: '250',
      });
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
      const response = await this.fetchApi<PokemonCard>(`/cards/${id}`);
      const card = response.data as unknown as PokemonCard;
      cacheService.set(cacheKey, card, 30 * 60 * 1000);
      return card;
    } catch (err) {
      console.error(`Error fetching card ${id}:`, err);
      return null;
    }
  }

  extractCardPrice(card: PokemonCard): number {
    if (card.tcgplayer?.prices) {
      const prices = card.tcgplayer.prices;
      const variants = ['normal', 'holofoil', '1stEditionHolofoil', '1stEditionNormal', 'unlimited'];
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
