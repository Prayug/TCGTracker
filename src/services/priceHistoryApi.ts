import { PokemonCard, PokemonSet, ApiResponse } from '../types/pokemon';
import { CardIdentifier } from '../types/identifiers';

interface PriceHistoryPoint {
  date: string;
  price: number;
  marketPrice?: number;
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
  public static dataMode: 'live' | 'static' = 'static'; // <-- Change to 'live' to use the backend
  private static staticMappings: CardIdentifier[] | null = null;
  private static latestPrices: { [uniqueIdentifier: string]: PricePoint } | null = null;

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

    // Priority 1: Find by TCGPlayer Product ID
    if (card.productId) {
      const found = mappings.find(m => m.tcgplayerProductId === card.productId);
      if (found) return found;
    }

    // Priority 2: Find by details (name, set, number, rarity)
    const isPromo = card.rarity === 'Promo' || card.set.name.toLowerCase().includes('promo');
    const normalizedCardName = card.name.toLowerCase();

    const potentialMatches = mappings.filter(m => {
      // Name must match
      if (m.cardName.toLowerCase() !== normalizedCardName) {
        return false;
      }

      // Set matching logic
      const dbIsPromo = m.rarity === 'Promo' || m.setName.toLowerCase().includes('promo');
      if (isPromo) {
        if (!dbIsPromo) return false; // If we expect a promo, it must be a promo in the DB
      } else {
        // For non-promos, the set match should be stricter
        const normalizedSetName = card.set.name.toLowerCase();
        const setMatch = m.setId === card.set.id || m.setName.toLowerCase().includes(normalizedSetName);
        if (!setMatch) return false;
      }

      // Number matching logic
      if (card.number && m.cardNumber) {
        const apiNumber = card.number.toLowerCase().replace(/[^a-z0-9]/g, '');
        const dbNumber = m.cardNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (apiNumber !== dbNumber) {
          return false;
        }
      } else if (card.number || m.cardNumber) {
        // If one has a number and the other doesn't, it's not a match.
        return false;
      }

      // Rarity must also match if provided
      return !card.rarity || m.rarity === card.rarity;
    });
    
    if (potentialMatches.length > 0) {
      // If multiple matches, prefer the one with the shortest, most exact card number
      potentialMatches.sort((a, b) => (a.cardNumber || '').length - (b.cardNumber || '').length);
      return potentialMatches[0];
    }
    
    return null;
  }

  /**
   * Gets price history for a specific card using its details
   */
  static async getCardPriceHistory(
    cardName: string,
    setId: string,
    cardNumber?: string
  ): Promise<CardPriceHistoryResponse | null> {
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
        if (response.status === 404) {
          return null; // No price history found
        }
        throw new Error(`Failed to fetch price history: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching card price history:', error);
      return null;
    }
  }

  /**
   * Matches a card and gets its price history (fallback method)
   */
  static async matchCardAndGetHistory(
    cardName: string,
    setName: string,
    cardNumber?: string,
    setId?: string
  ): Promise<CardMatchResponse | null> {
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
        throw new Error(`Failed to match card: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error matching card:', error);
      return null;
    }
  }

  /**
   * Converts raw price history to the format expected by the frontend
   */
  static formatPriceHistory(priceHistory: PriceHistoryPoint[]): Array<{ date: string; price: number }> {
    return priceHistory
      .filter(point => point.price > 0)
      .map(point => ({
        date: point.date,
        price: point.marketPrice || point.price
      }))
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
  }): Promise<Array<{ date: string; price: number }>> {
    const cardNumber = card.number || this.extractCardNumber(card.id);
    
    // Use the new, more reliable endpoint first
    const history = await this.getPriceHistory({
      name: card.name,
      set: card.set,
      number: cardNumber,
      rarity: card.rarity,
      productId: card.productId
    });

    if (history.length > 0) {
      return history;
    }
    
    // Fallback to old methods if new one fails
    // 1. Try direct card endpoint with Pokemon TCG API set ID
    let result = await this.getCardPriceHistory(card.name, card.set.id, cardNumber);
    if (result && result.priceHistory.length > 0) {
      return this.formatPriceHistory(result.priceHistory);
    }
    
    // 2. Try direct card endpoint with set name (for sets like "151")
    result = await this.getCardPriceHistory(card.name, card.set.name, cardNumber);
    if (result && result.priceHistory.length > 0) {
      return this.formatPriceHistory(result.priceHistory);
    }
    
    // 3. Fallback to matching endpoint with set name (most reliable for TCGCSV data)
    const matchResult = await this.matchCardAndGetHistory(
      card.name,
      card.set.name,
      cardNumber,
      card.set.id
    );
    if (matchResult && matchResult.priceHistory.length > 0) {
      return this.formatPriceHistory(matchResult.priceHistory);
    }
    
    // 4. Try matching with just the card name and shortened set name
    const setNameWords = card.set.name.split(' ');
    const shortSetName = setNameWords[setNameWords.length - 1]; // Get last word (like "151")
    const shortMatchResult = await this.matchCardAndGetHistory(
      card.name,
      shortSetName,
      cardNumber
    );
    if (shortMatchResult && shortMatchResult.priceHistory.length > 0) {
      return this.formatPriceHistory(shortMatchResult.priceHistory);
    }
    
    // Return empty array if no data found
    return [];
  }

  static async getPriceHistory(card: {
    name: string;
    set: { id: string; name: string };
    number?: string;
    rarity?: string;
    productId?: string;
  }): Promise<Array<{ date: string; price: number }>> {
    if (PriceHistoryApi.dataMode === 'static') {
      const matchedCard = await this.findCardStatically(card);
      if (!matchedCard || !matchedCard.uniqueIdentifier) {
        return [];
      }
      try {
        const response = await fetch(`/data/prices/${matchedCard.uniqueIdentifier}.json`);
        if (!response.ok) return [];
        const data = await response.json();
        return this.formatPriceHistory(data || []);
      } catch (error) {
        console.error('Error fetching static price history:', error);
        return [];
      }
    }

    // Live mode
    const params = new URLSearchParams({
      cardName: card.name,
      setName: card.set.name,
      setId: card.set.id,
    });
    if (card.number) {
      params.append('cardNumber', card.number);
    }
    if (card.rarity) {
      params.append('rarity', card.rarity);
    }
    if (card.productId) {
      params.append('productId', card.productId);
    }

    try {
      const response = await fetch(`${this.baseUrl}/history?${params}`);
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return this.formatPriceHistory(data.priceHistory || []);
    } catch (error) {
      console.error('Error fetching price history from new endpoint:', error);
      return [];
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