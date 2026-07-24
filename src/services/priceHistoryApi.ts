import { PricePoint } from '../types/pokemon';
import { CardIdentifier } from '../types/identifiers';
import { env } from '../config/env';
import { resolveHistoryPointPrice } from '../utils/resolveListingPrice';
import { normalizeVariantKey } from '../utils/normalizeVariantKey';

interface PriceHistoryPoint {
  date: string;
  price: number;
  marketPrice?: number;
  subTypeName?: string;
  lowPrice?: number;
  highPrice?: number;
  volume?: number;
  source: string;
  message?: string;
}

interface CardPriceHistoryResponse {
  uniqueIdentifier: string;
  cardDetails: {
    cardName: string;
    setId: string;
    cardNumber?: string;
  };
  priceHistory: PriceHistoryPoint[];
  rollingAverages: any[];
}

interface CardMatchResponse {
  matchedProduct?: {
    productId: number;
    productName: string;
    groupName: string;
    uniqueIdentifier?: string;
  };
  priceHistory: PriceHistoryPoint[];
  rollingAverages: any[];
  message?: string;
  searchCriteria?: {
    cardName: string;
    setName: string;
    cardNumber?: string;
  };
}

export interface TopMoverEntry {
  productName: string;
  currentPrice: number;
  previousPrice: number;
  changePercent: number;
  uniqueIdentifier?: string | null;
  subTypeName?: string | null;
  groupName?: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  cardId: string | null;
  setId: string | null;
  setName: string | null;
  cardNumber: string | null;
  rarity: string | null;
  tcgplayerProductId: string | null;
  tcgplayerPrices: string | null;
  productId: number;
}

export interface TopMoversResponse {
  date: string | null;
  days: number;
  gainers: TopMoverEntry[];
  losers: TopMoverEntry[];
}

const TOP_MOVERS_TTL_MS = 10 * 60 * 1000; // match backend TTL

type TopMoversCacheEntry = {
  expiresAt: number;
  data: TopMoversResponse;
};

/**
 * Fetches top movers (biggest gainers/losers) over a given period
 */
export class PriceHistoryApi {
  private static baseUrl = `${env.apiUrl}/api/prices`;
  public static dataMode: 'live' | 'static' = 'live'; // Use live mode by default (backend server)
  private static staticMappings: CardIdentifier[] | null = null;
  private static latestPrices: { [uniqueIdentifier: string]: PricePoint } | null = null;
  private static topMoversMemory = new Map<string, TopMoversCacheEntry>();

  private static topMoversCacheKey(days: number, limit: number): string {
    return `${days}:${limit}`;
  }

  private static topMoversStorageKey(days: number, limit: number): string {
    return `tcgtracker:top-movers:${days}:${limit}`;
  }

  private static readTopMoversStorage(days: number, limit: number): TopMoversCacheEntry | null {
    try {
      const raw = localStorage.getItem(this.topMoversStorageKey(days, limit));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as TopMoversCacheEntry;
      if (!parsed?.data || typeof parsed.expiresAt !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private static writeTopMoversCache(days: number, limit: number, data: TopMoversResponse): void {
    const entry: TopMoversCacheEntry = {
      expiresAt: Date.now() + TOP_MOVERS_TTL_MS,
      data,
    };
    const key = this.topMoversCacheKey(days, limit);
    this.topMoversMemory.set(key, entry);
    try {
      localStorage.setItem(this.topMoversStorageKey(days, limit), JSON.stringify(entry));
    } catch {
      // Quota / private mode — memory cache still works for the session
    }
  }

  /** Instant cache read for stale-while-revalidate UI (may be expired). */
  static peekTopMovers(days: number = 7, limit: number = 20): TopMoversResponse | null {
    const key = this.topMoversCacheKey(days, limit);
    const mem = this.topMoversMemory.get(key);
    if (mem?.data) return mem.data;
    const stored = this.readTopMoversStorage(days, limit);
    if (stored?.data) {
      this.topMoversMemory.set(key, stored);
      return stored.data;
    }
    return null;
  }

  static async getTopMovers(
    days: number = 7,
    limit: number = 20,
    options: { force?: boolean } = {}
  ): Promise<TopMoversResponse> {
    const key = this.topMoversCacheKey(days, limit);
    const mem = this.topMoversMemory.get(key);
    if (
      !options.force &&
      mem &&
      mem.expiresAt > Date.now() &&
      (mem.data.gainers.length > 0 || mem.data.losers.length > 0)
    ) {
      return mem.data;
    }

    const stored = this.readTopMoversStorage(days, limit);
    if (
      !options.force &&
      stored &&
      stored.expiresAt > Date.now() &&
      (stored.data.gainers.length > 0 || stored.data.losers.length > 0)
    ) {
      this.topMoversMemory.set(key, stored);
      return stored.data;
    }

    try {
      const response = await fetch(`${this.baseUrl}/top-movers?days=${days}&limit=${limit}`);
      if (!response.ok) {
        return mem?.data ?? stored?.data ?? { date: null, days, gainers: [], losers: [] };
      }
      const data = (await response.json()) as TopMoversResponse;
      if (data.gainers.length > 0 || data.losers.length > 0) {
        this.writeTopMoversCache(days, limit, data);
      }
      return data;
    } catch {
      return mem?.data ?? stored?.data ?? { date: null, days, gainers: [], losers: [] };
    }
  }

  private static async getStaticMappings(): Promise<CardIdentifier[]> {
    if (this.staticMappings) {
      return this.staticMappings;
    }
    try {
      const response = await fetch('/data/mappings.json');
      if (!response.ok) return [];
      const mappings = await response.json();
      this.staticMappings = mappings;
      return mappings;
    } catch (error) {
      console.error('Failed to load static mappings:', error);
      return [];
    }
  }

  public static async getLatestPrices(): Promise<{ [uniqueIdentifier: string]: PricePoint }> {
    if (this.latestPrices) {
      return this.latestPrices;
    }
    try {
      const response = await fetch('/data/latest-prices.json');
      if (!response.ok) return {};
      const prices = await response.json();
      this.latestPrices = prices;
      return prices;
    } catch (error) {
      console.error('Failed to load latest prices:', error);
      return {};
    }
  }

  private static async findCardStatically(card: {
    name: string;
    set: { id: string; name: string };
    number?: string;
    rarity?: string;
    productId?: string;
  }): Promise<CardIdentifier | null> {
    const mappings = await this.getStaticMappings();
    if (mappings.length === 0) return null;

    // Priority 1: Find by TCGPlayer Product ID (most reliable)
    if (card.productId) {
      const found = mappings.find(m => m.tcgplayerProductId === card.productId);
      if (found) return found;
    }

    // Priority 2: Find by details with improved matching
    const isPromo = card.rarity === 'Promo' || card.set.name.toLowerCase().includes('promo');
    const normalizedCardName = card.name.toLowerCase().trim();

    // Score each potential match
    const scoredMatches = mappings
      .map(m => {
        const dbCardName = m.cardName.toLowerCase().trim();
        let score = 0;

        // STEP 1: Name matching (most critical)
        // Must be exact match for the full name to avoid confusion between similar cards
        if (dbCardName !== normalizedCardName) {
          return { mapping: m, score: -1 }; // Invalid match
        }
        score += 100; // Base score for name match

        // STEP 2: Set matching (very important)
        const dbIsPromo = m.rarity === 'Promo' || m.setName.toLowerCase().includes('promo');
        const normalizedSetName = card.set.name.toLowerCase().trim();
        const dbSetName = m.setName.toLowerCase().trim();
        const dbSetId = m.setId.toLowerCase().trim();
        const cardSetId = card.set.id.toLowerCase().trim();

        // Promo handling
        if (isPromo !== dbIsPromo) {
          return { mapping: m, score: -1 }; // Invalid match - promo status mismatch
        }

        // Exact set ID match is best
        if (dbSetId === cardSetId) {
          score += 50;
        } 
        // Set name exact match
        else if (dbSetName === normalizedSetName) {
          score += 40;
        }
        // Set name contains or is contained
        else if (dbSetName.includes(normalizedSetName) || normalizedSetName.includes(dbSetName)) {
          score += 20;
        }
        // Set name words overlap
        else {
          const setWords = normalizedSetName.split(/\s+/);
          const dbSetWords = dbSetName.split(/\s+/);
          const overlap = setWords.filter(w => dbSetWords.includes(w)).length;
          if (overlap > 0) {
            score += overlap * 5;
          } else {
            return { mapping: m, score: -1 }; // Invalid match - no set overlap
          }
        }

        // STEP 3: Card number matching (critical for distinguishing variants)
        if (card.number && m.cardNumber) {
          const apiNumber = card.number.toLowerCase().replace(/[^a-z0-9]/g, '');
          const dbNumber = m.cardNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          if (apiNumber === dbNumber) {
            score += 30; // Exact card number match
          } else {
            return { mapping: m, score: -1 }; // Invalid match - card number mismatch
          }
        } else if (card.number && !m.cardNumber) {
          // API has number but DB doesn't - heavily penalize
          // This usually means it's a different printing or variant
          score -= 40;
        } else if (!card.number && m.cardNumber) {
          // DB has number but API doesn't - heavily penalize
          score -= 40;
        } else {
          // Neither has a number - small bonus for consistency
          score += 5;
        }

        // STEP 4: Rarity matching (helpful but not critical)
        if (card.rarity && m.rarity) {
          if (card.rarity === m.rarity) {
            score += 10;
          } else {
            score -= 5; // Penalize rarity mismatch but don't disqualify
          }
        }

        return { mapping: m, score };
      })
      .filter(match => match.score > 0) // Remove invalid matches
      .sort((a, b) => b.score - a.score); // Sort by score descending

    if (scoredMatches.length > 0) {
      // Log the top matches for debugging (only in debug mode)
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_MATCHING && scoredMatches.length > 1) {
        console.log(`Found ${scoredMatches.length} potential matches for "${card.name}" in "${card.set.name}" (card #${card.number || 'N/A'})`);
        console.log(`Best match: "${scoredMatches[0].mapping.cardName}" in "${scoredMatches[0].mapping.setName}" (card #${scoredMatches[0].mapping.cardNumber || 'N/A'}) - score: ${scoredMatches[0].score}`);
        if (scoredMatches[1]) {
          console.log(`Second best: "${scoredMatches[1].mapping.cardName}" in "${scoredMatches[1].mapping.setName}" (card #${scoredMatches[1].mapping.cardNumber || 'N/A'}) - score: ${scoredMatches[1].score}`);
        }
      }
      
      // Additional validation: If we have a card number, strongly prefer matches with card numbers
      if (card.number) {
        const matchesWithNumbers = scoredMatches.filter(m => m.mapping.cardNumber !== null);
        if (matchesWithNumbers.length > 0) {
          if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_MATCHING) {
            console.log(`✅ Selected match with card number: "${matchesWithNumbers[0].mapping.cardName}" #${matchesWithNumbers[0].mapping.cardNumber}`);
          }
          return matchesWithNumbers[0].mapping;
        } else {
          // Only log in debug mode - this is common for promo cards
          if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_MATCHING) {
            console.warn(`⚠️ No DB entries found with card numbers for "${card.name}", using best available match`);
          }
        }
      }
      
      return scoredMatches[0].mapping;
    }
    
    return null;
  }

  /**
   * Gets price history for a specific card using its details (LIVE MODE ONLY)
   */
  static async getCardPriceHistory(
    cardName: string,
    setId: string,
    cardNumber?: string
  ): Promise<CardPriceHistoryResponse | null> {
    // Skip if in static mode
    if (this.dataMode === 'static') {
      return null;
    }

    try {
      const params = new URLSearchParams({
        cardName,
        setId
      });
      
      if (cardNumber) {
        params.append('cardNumber', cardNumber);
      }

      const response = await fetch(`${this.baseUrl}/card?${params}`);
      
      if (!response.ok) {
        // Silently return null for 404s (expected when card not in database)
        return null;
      }

      return await response.json();
    } catch (error) {
      // Only log actual errors in dev mode
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_API) {
        console.error('Error fetching card price history:', error);
      }
      return null;
    }
  }

  /**
   * Matches a card and gets its price history (LIVE MODE ONLY)
   */
  static async matchCardAndGetHistory(
    cardName: string,
    setName: string,
    cardNumber?: string,
    setId?: string
  ): Promise<CardMatchResponse | null> {
    // Skip if in static mode
    if (this.dataMode === 'static') {
      return null;
    }

    try {
      const params = new URLSearchParams({
        cardName,
        setName
      });
      
      if (cardNumber) {
        params.append('cardNumber', cardNumber);
      }
      
      if (setId) {
        params.append('setId', setId);
      }

      const response = await fetch(`${this.baseUrl}/match?${params}`);
      
      if (!response.ok) {
        // Silently return null (expected when card not in database)
        return null;
      }

      return await response.json();
    } catch (error) {
      // Only log in debug mode
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_API) {
        console.error('Error matching card:', error);
      }
      return null;
    }
  }

  /**
   * Deduplicate to one price per calendar day. Does NOT gap-fill — that's for chart display only.
   */
  static formatPriceHistory(
    priceHistory: PriceHistoryPoint[],
    preferredVariant?: string
  ): Array<{ date: string; price: number }> {
    const preferred = normalizeVariantKey(preferredVariant);
    const byDate = new Map<string, { price: number; score: number }>();

    const scoreVariant = (subTypeName?: string): number => {
      const rowVariant = normalizeVariantKey(subTypeName);
      if (rowVariant === preferred) return 3;
      if (preferred !== 'normal' && rowVariant.includes(preferred)) return 2;
      if (preferred === 'normal' && (rowVariant === 'normal' || rowVariant === 'unlimited')) return 2;
      return rowVariant === 'normal' ? 1 : 0;
    };

    priceHistory
      .filter((point) => resolveHistoryPointPrice(point) > 0)
      .forEach((point) => {
        const pointDate = point.date.includes('T') ? point.date.split('T')[0] : point.date;
        const normalizedPrice = resolveHistoryPointPrice(point);
        const score = scoreVariant(point.subTypeName);
        const existing = byDate.get(pointDate);
        if (!existing || score > existing.score) {
          byDate.set(pointDate, { price: normalizedPrice, score });
        }
      });

    const deduped = Array.from(byDate.entries())
      .filter(([, { score }]) => score > 0)
      .map(([date, { price }]) => ({ date, price }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // If variant filter was too strict, keep best available row per day.
    if (
      deduped.length === 0 ||
      deduped.length < Math.min(10, priceHistory.filter((p) => resolveHistoryPointPrice(p) > 0).length * 0.25)
    ) {
      byDate.clear();
      priceHistory
        .filter((point) => resolveHistoryPointPrice(point) > 0)
        .forEach((point) => {
          const pointDate = point.date.includes('T') ? point.date.split('T')[0] : point.date;
          const normalizedPrice = resolveHistoryPointPrice(point);
          const score = scoreVariant(point.subTypeName);
          const existing = byDate.get(pointDate);
          if (!existing || score > existing.score) {
            byDate.set(pointDate, { price: normalizedPrice, score });
          }
        });
      return Array.from(byDate.entries())
        .map(([date, { price }]) => ({ date, price }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    return deduped;
  }

  /**
   * Gets price history for a Pokemon card from the Pokemon TCG API format
   */
  static async getPokemonCardPriceHistory(card: {
    id: string;
    name: string;
    set: { id: string; name: string };
    number?: string;
    rarity?: string;
    productId?: string;
    variant?: string;
  }): Promise<Array<{ date: string; price: number }>> {
    const cardNumber = card.number || this.extractCardNumber(card.id);
    return this.getPriceHistory({
      id: card.id,
      name: card.name,
      set: card.set,
      number: cardNumber,
      rarity: card.rarity,
      productId: card.productId,
      variant: card.variant,
    });
  }

  static async getPriceHistory(card: {
    id?: string;
    name: string;
    set: { id: string; name: string };
    number?: string;
    rarity?: string;
    productId?: string;
    variant?: string;
  }): Promise<Array<{ date: string; price: number }>> {
    const variantKey = normalizeVariantKey(card.variant);

    if (PriceHistoryApi.dataMode === 'static') {
      const matchedCard = await this.findCardStatically(card);
      if (!matchedCard || !matchedCard.uniqueIdentifier) {
        return [];
      }
      try {
        const response = await fetch(`/data/prices/${matchedCard.uniqueIdentifier}.json`);
        if (!response.ok) {
          // Silently return empty array - many cards don't have price files
          return [];
        }
        
        // Check if response is actually JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          // Silently fail - price file doesn't exist or is not valid JSON
          return [];
        }
        
        const data = await response.json();
        const normalizedData = (data || []).filter((point: PriceHistoryPoint) => {
          const pointVariant = normalizeVariantKey(point.subTypeName);
          return variantKey === 'normal' ? true : pointVariant === variantKey;
        });
        return this.formatPriceHistory(normalizedData, card.variant);
      } catch {
        // Silently fail - price file doesn't exist or is invalid
        return [];
      }
    }

    try {
      const fetchHistory = async (variantToUse?: string) => {
        const params = new URLSearchParams({
          cardId: card.id,
          cardName: card.name,
          setName: card.set.name,
          setId: card.set.id,
        });
        if (variantToUse) {
          params.append('variant', variantToUse);
        }
        if (card.number) {
          params.append('cardNumber', card.number);
        }
        if (card.rarity) {
          params.append('rarity', card.rarity);
        }
        if (card.productId) {
          params.append('productId', card.productId);
        }
        const response = await fetch(`${this.baseUrl}/history?${params}`);
        if (!response.ok) {
          return [];
        }
        const data = await response.json();
        const raw = data?.priceHistory ?? [];
        const formatted = this.formatPriceHistory(raw, variantToUse);
        // If variant-specific result is sparse, retry using all subtype rows from the same product.
        if (formatted.length < 14 && raw.length > formatted.length) {
          const fallback = this.formatPriceHistory(raw, undefined);
          if (fallback.length > formatted.length) {
            return fallback;
          }
        }
        return formatted;
      };

      return await fetchHistory(variantKey);
    } catch (error) {
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_API) {
        console.log('History endpoint failed', error);
      }
    }

    return [];
  }

  /** Period comparison for a TCGPlayer product (outer vs inner window). */
  static async compareProduct(
    productId: string | number,
    outerDays = 90,
    innerDays = 7
  ): Promise<{
    data: Array<{
      period: string;
      avgPrice: number;
      minPrice: number;
      maxPrice: number;
      dataPoints: number;
    }>;
    analysis: { priceChange: number | null; trend: string };
  } | null> {
    try {
      const url = new URL(`${this.baseUrl}/compare/${productId}`);
      url.searchParams.set('outer', String(outerDays));
      url.searchParams.set('inner', String(innerDays));
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      return (await res.json()) as {
        data: Array<{
          period: string;
          avgPrice: number;
          minPrice: number;
          maxPrice: number;
          dataPoints: number;
        }>;
        analysis: { priceChange: number | null; trend: string };
      };
    } catch {
      return null;
    }
  }

  /**
   * Extracts card number from Pokemon TCG API card ID
   */
  private static extractCardNumber(cardId: string): string {
    const parts = cardId.split('-');
    const lastPart = parts.length > 1 ? parts[parts.length - 1] : '';
    
    // Handle various formats like "6", "006", "TG01", etc.
    // Pad single digits with leading zeros to match common formats
    if (lastPart && /^\d+$/.test(lastPart)) {
      return lastPart.padStart(3, '0'); // Convert "6" to "006"
    }
    
    return lastPart;
  }
} 