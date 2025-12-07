import { env } from '../config/env';
import { logger } from '../utils/logger';

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const BASE_URL = 'https://api.pokemontcg.io/v2';

export interface PokemonApiCard {
  id: string;
  name: string;
  number: string;
  supertype?: string;
  subtypes?: string[];
  rarity?: string;
  images?: {
    small?: string;
    large?: string;
  };
  set: {
    id: string;
    name: string;
    releaseDate?: string;
  };
  tcgplayer?: {
    productId?: string | number;
    prices?: Record<
      string,
      {
        low?: number;
        mid?: number;
        high?: number;
        market?: number;
      }
    >;
  };
}

export interface PokemonApiSet {
  id: string;
  name: string;
  series?: string;
  releaseDate?: string;
  total?: number;
  printedTotal?: number;
  ptcgoCode?: string;
  images?: {
    symbol?: string;
    logo?: string;
  };
}

interface PokemonCardsResponse {
  data?: PokemonApiCard[];
  totalCount?: number;
  total?: number;
  page?: number;
  pageSize?: number;
}

interface PokemonSetsResponse {
  data?: PokemonApiSet[];
}

export interface PokemonApiSearchParams {
  nameQuery?: string;
  setId?: string;
  rawQuery?: string;
  page?: number;
  pageSize?: number;
}

export interface PokemonApiPage {
  cards: PokemonApiCard[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface PokemonApiBulkSearchOptions extends Omit<PokemonApiSearchParams, 'page'> {
  fetchAll?: boolean;
  maxPages?: number;
  startPage?: number;
}

export interface PokemonApiBulkResult {
  cards: PokemonApiCard[];
  totalCount: number;
  pagesFetched: number;
}

export interface CardImageSearchOptions {
  cardName: string;
  setId?: string;
  setName?: string;
  cardNumber?: string;
}

export interface CardSearchAttempt {
  strategy: string;
  results: number;
  error?: string;
}

export interface CardImageMatchResult {
  card: PokemonApiCard | null;
  attempts: CardSearchAttempt[];
  candidates: PokemonApiCard[];
  usedFallback: boolean;
}

class PokemonApiClient {
  private readonly apiKey = env.apis.pokemonTcg || '';
  private readonly maxRetries = 2;
  private readonly defaultTimeout = 30000; // Increased to 30 seconds for large requests

  private buildHeaders(): HeadersInit {
    const headers: HeadersInit = {
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers['X-Api-Key'] = this.apiKey;
    }
    return headers;
  }

  private buildQuery(params: PokemonApiSearchParams): string | undefined {
    if (params.rawQuery) {
      return params.rawQuery;
    }

    const parts: string[] = [];
    if (params.nameQuery && params.nameQuery.trim().length > 0) {
      const sanitizedName = params.nameQuery.trim();
      parts.push(`name:*${sanitizedName}*`);
    }
    if (params.setId) {
      parts.push(`set.id:${params.setId}`);
    }
    return parts.length > 0 ? parts.join(' ') : undefined;
  }

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldRetry(status: number) {
    return RETRYABLE_STATUS.has(status);
  }

  private async request<T>(
    endpoint: string,
    params?: Record<string, string>,
    timeoutMs = this.defaultTimeout
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (typeof value === 'string' && value.length > 0) {
          url.searchParams.append(key, value);
        }
      });
    }

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.maxRetries) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url.toString(), {
          headers: this.buildHeaders(),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          if (this.shouldRetry(response.status) && attempt < this.maxRetries) {
            attempt += 1;
            const backoff = 1500 * attempt;
            logger.warn(`Pokemon API ${response.status}. Retrying in ${backoff}ms...`, {
              endpoint,
              params,
            });
            await this.delay(backoff);
            continue;
          }
          throw new Error(`Pokemon API ${response.status} ${response.statusText}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        clearTimeout(timeout);
        lastError = error as Error;
        if (attempt >= this.maxRetries) {
          break;
        }
        attempt += 1;
        const backoff = 1500 * attempt;
        logger.warn(`Pokemon API request failed (attempt ${attempt}). Retrying in ${backoff}ms`, {
          endpoint,
          params,
          error: lastError.message,
        });
        await this.delay(backoff);
      }
    }

    throw lastError || new Error('Pokemon API request failed');
  }

  async searchCards(params: PokemonApiSearchParams): Promise<PokemonApiPage> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 250;

    const query = this.buildQuery(params);
    const requestParams: Record<string, string> = {
      page: page.toString(),
      pageSize: pageSize.toString(),
    };

    if (query) {
      requestParams.q = query;
    }

    const response = await this.request<PokemonCardsResponse>('/cards', requestParams);

    return {
      cards: response.data ?? [],
      totalCount: response.totalCount ?? response.total ?? 0,
      page,
      pageSize,
    };
  }

  async searchCardsBulk(options: PokemonApiBulkSearchOptions): Promise<PokemonApiBulkResult> {
    const fetchAll = options.fetchAll !== false;
    const maxPages = options.maxPages ?? 4;
    const pageSize = options.pageSize ?? 250;
    let currentPage = options.startPage ?? 1;
    let pagesFetched = 0;
    let totalCount = 0;
    const collected: PokemonApiCard[] = [];

    while (true) {
      const pageResult = await this.searchCards({
        nameQuery: options.nameQuery,
        setId: options.setId,
        rawQuery: options.rawQuery,
        page: currentPage,
        pageSize,
      });

      pagesFetched += 1;
      if (!totalCount && pageResult.totalCount) {
        totalCount = pageResult.totalCount;
      }
      if (pageResult.cards.length > 0) {
        collected.push(...pageResult.cards);
      }

      if (!fetchAll || pageResult.cards.length < pageSize || pagesFetched >= maxPages) {
        break;
      }

      currentPage += 1;
    }

    return {
      cards: this.uniqueCards(collected),
      totalCount: totalCount || collected.length,
      pagesFetched,
    };
  }

  async findBestImageMatch(options: CardImageSearchOptions): Promise<CardImageMatchResult> {
    const strategies = this.buildImageSearchStrategies(options);
    const attempts: CardSearchAttempt[] = [];

    const strategyResults = await Promise.all(
      strategies.map(async (strategy) => {
        try {
          const page = await this.searchCards({
            rawQuery: strategy.rawQuery,
            pageSize: strategy.pageSize,
          });
          attempts.push({
            strategy: strategy.label,
            results: page.cards.length,
          });
          return page.cards;
        } catch (error) {
          attempts.push({
            strategy: strategy.label,
            results: 0,
            error: (error as Error).message,
          });
          return [] as PokemonApiCard[];
        }
      })
    );

    const combined = this.uniqueCards(strategyResults.flat());
    if (combined.length === 0) {
      return {
        card: null,
        attempts,
        candidates: [],
        usedFallback: false,
      };
    }

    const selection = this.selectBestCard(combined, options);
    return {
      card: selection.card,
      attempts,
      candidates: combined.slice(0, 25),
      usedFallback: selection.usedFallback,
    };
  }

  async getSets(limit = 250): Promise<PokemonApiSet[]> {
    try {
      // Use longer timeout for set fetching (can be a large request)
      const response = await this.request<PokemonSetsResponse>('/sets', {
        orderBy: '-releaseDate',
        pageSize: String(limit),
      }, 45000); // 45 second timeout for large set lists
      return response.data ?? [];
    } catch (error) {
      logger.warn('Pokemon API failed, falling back to cached/empty data', { error: (error as Error).message });
      // Return empty array to allow fallback logic to handle this
      return [];
    }
  }

  /**
   * Get all sets and return them as a map of set codes to set data
   */
  async getSetCodeMap(): Promise<Map<string, PokemonApiSet>> {
    try {
      const sets = await this.getSets(1000); // Get many sets
      const setMap = new Map<string, PokemonApiSet>();

      sets.forEach(set => {
        if (set.id && set.name) {
          setMap.set(set.id.toLowerCase(), set);
          // Also map by name for fuzzy matching
          setMap.set(set.name.toLowerCase().replace(/[^a-z0-9]/g, ''), set);
        }
      });

      logger.info(`Loaded ${setMap.size} sets into code map`);
      return setMap;
    } catch (error) {
      logger.error('Failed to load set code map', { error: (error as Error).message });
      return new Map();
    }
  }

  /**
   * Get cards from a specific set with improved error handling
   */
  async getCardsFromSet(setId: string, pageSize = 250): Promise<PokemonApiCard[]> {
    try {
      const response = await this.request<PokemonCardsResponse>('/cards', {
        q: `set.id:${setId}`,
        pageSize: String(pageSize),
        orderBy: 'number'
      });
      return response.data ?? [];
    } catch (error) {
      logger.warn(`Failed to fetch cards for set ${setId}`, { error: (error as Error).message });
      return [];
    }
  }

  private uniqueCards(cards: PokemonApiCard[]): PokemonApiCard[] {
    const map = new Map<string, PokemonApiCard>();
    cards.forEach((card) => {
      if (!map.has(card.id)) {
        map.set(card.id, card);
      }
    });
    return Array.from(map.values());
  }

  private normalizeCardNumber(value?: string | null): string {
    if (!value) return '';
    const beforeSlash = value.split('/')[0].trim();
    return beforeSlash.toLowerCase().replace(/^0+/, '').replace(/[^a-z0-9]/g, '');
  }

  private selectBestCard(
    candidates: PokemonApiCard[],
    options: CardImageSearchOptions
  ): { card: PokemonApiCard | null; usedFallback: boolean } {
    const normalizedName = options.cardName.toLowerCase();
    const exactNameMatches = candidates.filter(
      (card) => card.name.toLowerCase() === normalizedName
    );
    const nameMatches = exactNameMatches.length > 0 ? exactNameMatches : candidates;

    if (nameMatches.length === 0) {
      return { card: null, usedFallback: false };
    }

    if (options.cardNumber) {
      const requestedNumber = this.normalizeCardNumber(options.cardNumber);
      const strictMatch = nameMatches.find(
        (card) => this.normalizeCardNumber(card.number) === requestedNumber
      );
      if (strictMatch) {
        return { card: strictMatch, usedFallback: false };
      }

      const numericRequested = /^\d+$/.test(requestedNumber)
        ? parseInt(requestedNumber, 10)
        : null;
      if (numericRequested !== null) {
        const closeMatch = nameMatches.find((card) => {
          const cardNumber = this.normalizeCardNumber(card.number);
          if (!/^\d+$/.test(cardNumber)) {
            return false;
          }
          const numericCard = parseInt(cardNumber, 10);
          return Math.abs(numericCard - numericRequested) <= 1;
        });
        if (closeMatch) {
          return { card: closeMatch, usedFallback: true };
        }
      }
    }

    if (!options.cardNumber && options.setId) {
      const sameSet = nameMatches.find(
        (card) => card.set?.id?.toLowerCase() === options.setId!.toLowerCase()
      );
      if (sameSet) {
        return { card: sameSet, usedFallback: false };
      }
    }

    if (!options.cardNumber && options.setName) {
      const normalizedSet = options.setName.toLowerCase();
      const sameSetName = nameMatches.find(
        (card) => card.set?.name?.toLowerCase() === normalizedSet
      );
      if (sameSetName) {
        return { card: sameSetName, usedFallback: false };
      }
    }

    if (!options.cardNumber && exactNameMatches.length > 0) {
      return { card: exactNameMatches[0], usedFallback: true };
    }

    if (!options.cardNumber) {
      const fuzzyMatch = nameMatches.find(
        (card) =>
          card.name.toLowerCase().includes(normalizedName) ||
          normalizedName.includes(card.name.toLowerCase())
      );
      if (fuzzyMatch) {
        return { card: fuzzyMatch, usedFallback: true };
      }
    }

    const fallback = nameMatches[0];
    return { card: fallback, usedFallback: true };
  }

  private buildImageSearchStrategies(options: CardImageSearchOptions) {
    const cardName = options.cardName.replace(/"/g, '').trim();
    const strategies: Array<{ label: string; rawQuery: string; pageSize: number }> = [];

    if (options.cardNumber) {
      const numberOnly = options.cardNumber.split('/')[0].trim();
      if (options.setId) {
        strategies.push({
          label: 'name+set+num',
          rawQuery: `name:${cardName} set.id:${options.setId} number:${numberOnly}`,
          pageSize: 5,
        });
      }
      strategies.push({
        label: 'name+num',
        rawQuery: `name:${cardName} number:${numberOnly}`,
        pageSize: 10,
      });
    }

    if (options.setId) {
      strategies.push({
        label: 'name+set',
        rawQuery: `name:${cardName} set.id:${options.setId}`,
        pageSize: 10,
      });
    }

    if (options.setName) {
      const sanitizedSet = options.setName.replace(/"/g, '').trim();
      strategies.push({
        label: 'name+set.name',
        rawQuery: `name:${cardName} set.name:"${sanitizedSet}"`,
        pageSize: 10,
      });
    }

    strategies.push({
      label: 'name-only',
      rawQuery: `name:${cardName}`,
      pageSize: 20,
    });

    return strategies;
  }
}

export const pokemonApiClient = new PokemonApiClient();

