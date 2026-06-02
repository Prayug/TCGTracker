import { PricePoint } from '../types/pokemon';
import { CardIdentifier } from '../types/identifiers';

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

export class PriceHistoryApi {
  private static baseUrl = 'http://localhost:3001/api/prices';
  public static dataMode: 'live' | 'static' = 'live'; // Use live mode by default (backend server)
  private static staticMappings: CardIdentifier[] | null = null;
  private static latestPrices: { [uniqueIdentifier: string]: PricePoint } | null = null;
  private static normalizeVariantKey(value?: string): string {
    if (!value) return 'normal';
    const compact = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!compact) return 'normal';
    return compact;
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
   * Converts raw price history to the format expected by the frontend
   */
  static formatPriceHistory(priceHistory: PriceHistoryPoint[]): Array<{ date: string; price: number }> {
    const byDate = new Map<string, number>();

    priceHistory
      .filter((point) => (point.marketPrice || point.price) > 0)
      .forEach((point) => {
        const pointDate = point.date.includes('T') ? point.date.split('T')[0] : point.date;
        const normalizedPrice = point.marketPrice || point.price;
        byDate.set(pointDate, normalizedPrice);
      });

    return Array.from(byDate.entries())
      .map(([date, price]) => ({ date, price }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
    const variantKey = this.normalizeVariantKey(card.variant);

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
          const pointVariant = this.normalizeVariantKey(point.subTypeName);
          return variantKey === 'normal' ? true : pointVariant === variantKey;
        });
        return this.formatPriceHistory(normalizedData);
      } catch (error) {
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
        return data?.priceHistory ? this.formatPriceHistory(data.priceHistory) : [];
      };

      return await fetchHistory(variantKey);
    } catch (error) {
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_API) {
        console.log('History endpoint failed', error);
      }
    }

    return [];
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