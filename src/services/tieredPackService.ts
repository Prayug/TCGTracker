import { Pack, PackPull, PokemonCard, PackOpeningHistory, ValueRange } from '../types/pokemon';
import { pokemonApi } from './pokemonApi';

const PACK_HISTORY_KEY = 'tcg_tiered_pack_history';

class TieredPackService {
  // Cache for card pool to avoid refetching same cards
  private cardPoolCache: PokemonCard[] = [];
  private lastFetchTime: number = 0;
  private CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours - longer cache to reduce API calls

  // Define tiered packs with GameStop-style odds
  private tieredPacks: Pack[] = [
    {
      id: 'starter-25',
      name: 'Starter Pack',
      tier: 'starter',
      price: 25,
      averageValue: 25,
      cardsPerPack: 1,
      description: 'Perfect for beginners',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 12, max: 19, probability: 40.6, label: '$12-19' },
        { min: 19, max: 25, probability: 30.6, label: '$19-25' },
        { min: 25, max: 50, probability: 25.4, label: '$25-50' },
        { min: 50, max: 100, probability: 3, label: '$50-100' },
        { min: 100, max: 250, probability: 0.3, label: '$100-250' },
        { min: 250, max: 500, probability: 0.1, label: '$250-500' }
      ]
    },
    {
      id: 'bronze-50',
      name: 'Bronze Pack',
      tier: 'bronze',
      price: 50,
      averageValue: 50,
      cardsPerPack: 1,
      description: 'Step up your collection',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 25, max: 38, probability: 40, label: '$25-38' },
        { min: 38, max: 50, probability: 30, label: '$38-50' },
        { min: 50, max: 100, probability: 25, label: '$50-100' },
        { min: 100, max: 200, probability: 4, label: '$100-200' },
        { min: 200, max: 500, probability: 0.8, label: '$200-500' },
        { min: 500, max: 1000, probability: 0.2, label: '$500-1000' }
      ]
    },
    {
      id: 'silver-100',
      name: 'Silver Pack',
      tier: 'silver',
      price: 100,
      averageValue: 100,
      cardsPerPack: 1,
      description: 'Premium cards await',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 50, max: 75, probability: 38, label: '$50-75' },
        { min: 75, max: 100, probability: 32, label: '$75-100' },
        { min: 100, max: 200, probability: 25, label: '$100-200' },
        { min: 200, max: 400, probability: 4, label: '$200-400' },
        { min: 400, max: 1000, probability: 0.8, label: '$400-1000' },
        { min: 1000, max: 2000, probability: 0.2, label: '$1000-2000' }
      ]
    },
    {
      id: 'gold-500',
      name: 'Gold Pack',
      tier: 'gold',
      price: 500,
      averageValue: 500,
      cardsPerPack: 1,
      description: 'High-value pulls',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 250, max: 375, probability: 35, label: '$250-375' },
        { min: 375, max: 500, probability: 35, label: '$375-500' },
        { min: 500, max: 1000, probability: 25, label: '$500-1000' },
        { min: 1000, max: 2000, probability: 4, label: '$1000-2000' },
        { min: 2000, max: 5000, probability: 0.8, label: '$2000-5000' },
        { min: 5000, max: 10000, probability: 0.2, label: '$5000-10000' }
      ]
    },
    {
      id: 'platinum-1000',
      name: 'Platinum Pack',
      tier: 'platinum',
      price: 1000,
      averageValue: 1000,
      cardsPerPack: 1,
      description: 'Ultimate gambling experience',
      imageUrl: 'https://images.pokemontcg.io/base1/logo.png',
      valueRanges: [
        { min: 500, max: 750, probability: 35, label: '$500-750' },
        { min: 750, max: 1000, probability: 35, label: '$750-1000' },
        { min: 1000, max: 2000, probability: 25, label: '$1000-2000' },
        { min: 2000, max: 5000, probability: 4, label: '$2000-5000' },
        { min: 5000, max: 10000, probability: 0.8, label: '$5000-10000' },
        { min: 10000, max: 20000, probability: 0.2, label: '$10000-20000' }
      ]
    }
  ];

  // Get all available tiered packs
  getAvailablePacks(): Pack[] {
    return this.tieredPacks;
  }

  // Open a tiered pack
  async openPack(pack: Pack): Promise<PackPull> {
    console.log(`🎴 Opening ${pack.name} ($${pack.price})...`);

    try {
      // Fetch a large pool of cards to select from
      const cardPool = await this.fetchCardPool();
      
      if (cardPool.length === 0) {
        throw new Error('Unable to fetch cards from Pokemon TCG API. Please check your internet connection and try again.');
      }

      console.log(`✅ Card pool ready: ${cardPool.length} cards available`);
      
      if (cardPool.length < 10) {
        console.warn(`⚠️ Card pool is small (${cardPool.length} cards). Pack quality may vary.`);
      }

      // Select ONE card based on the rolled value range
      const selectedCard = this.selectCardFromRange(cardPool, pack.valueRanges);
      
      if (!selectedCard) {
        throw new Error('No suitable card found in the pool for this value range.');
      }

      const pulledCards = [selectedCard];

      // Calculate actual total value
      const totalValue = pulledCards.reduce((sum, card) => {
        const price = card.marketPrice || pokemonApi.extractCardPrice(card);
        return sum + price;
      }, 0);

      const profit = totalValue - pack.price;

      const packPull: PackPull = {
        pack,
        cards: pulledCards,
        totalValue,
        profit,
        openedAt: new Date().toISOString()
      };

      // Save to history
      this.addToHistory(packPull);

      console.log(`✅ Pulled ${pulledCards.length} cards! Total value: $${totalValue.toFixed(2)}`);
      console.log(`💰 Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`);

      return packPull;
    } catch (error) {
      console.error('Error opening pack:', error);
      throw error;
    }
  }

  // Select which VALUE RANGE bracket based on probabilities
  private selectValueRange(ranges: ValueRange[]): ValueRange {
    const rand = Math.random() * 100;
    let cumulative = 0;

    for (const range of ranges) {
      cumulative += range.probability;
      if (rand <= cumulative) {
        return range;
      }
    }

    // Fallback to first range
    return ranges[0];
  }

  // Fetch a large pool of cards from various sets
  private async fetchCardPool(): Promise<PokemonCard[]> {
    try {
      // Check if we have a valid cache
      const now = Date.now();
      if (this.cardPoolCache.length > 0 && (now - this.lastFetchTime) < this.CACHE_DURATION) {
        console.log(`♻️ Using cached card pool (${this.cardPoolCache.length} cards)`);
        // Shuffle cache to get variety
        return this.shuffleArray([...this.cardPoolCache]);
      }

      console.log('🔍 Fetching fresh card pool from Pokemon TCG API...');
      
      let allCards: PokemonCard[] = [];
      
      try {
        // Fetch a single large batch to minimize timeout risk
        // The API supports up to 250 cards per request
        allCards = await pokemonApi.searchCards(undefined, undefined, 250, false); // fetchAll: false
        console.log(`📦 Successfully fetched ${allCards.length} cards`);
      } catch (error) {
        console.error('Failed to fetch cards from API:', error);
        
        // If fetch fails, use cache if available
        if (this.cardPoolCache.length > 0) {
          console.log('⚠️ API failed, using cached card pool as fallback');
          return this.shuffleArray([...this.cardPoolCache]);
        }
        
        // If no cache, return empty array (caller should handle this)
        console.error('❌ No cached data available');
        return [];
      }
      
      if (allCards.length === 0) {
        console.error('❌ No cards returned from API');
        // Return cache if available
        if (this.cardPoolCache.length > 0) {
          console.log('⚠️ Using cached card pool as fallback');
          return this.shuffleArray([...this.cardPoolCache]);
        }
        return [];
      }
      
      // Filter out cards with no price
      const cardsWithPrices = allCards.filter(card => {
        const price = card.marketPrice || pokemonApi.extractCardPrice(card);
        return price > 0 && price < 10000; // Filter out invalid prices
      });

      console.log(`💰 ${cardsWithPrices.length} cards have valid prices`);
      
      if (cardsWithPrices.length < 20) {
        console.warn('⚠️ Very few cards with prices. Pack quality will be limited.');
      }
      
      // Update cache
      this.cardPoolCache = cardsWithPrices;
      this.lastFetchTime = now;
      
      // Shuffle for variety
      return this.shuffleArray([...cardsWithPrices]);
    } catch (error) {
      console.error('Error fetching card pool:', error);
      // Return cache if available
      if (this.cardPoolCache.length > 0) {
        console.log('⚠️ Using stale cache due to error');
        return this.shuffleArray([...this.cardPoolCache]);
      }
      return [];
    }
  }

  // Shuffle array for randomness
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Select a random card from the pool based on rolled value range
  private selectCardFromRange(
    cardPool: PokemonCard[],
    ranges: ValueRange[]
  ): PokemonCard | null {
    // First, roll to see which VALUE RANGE we hit
    const rolledRange = this.selectValueRange(ranges);
    
    console.log(`🎲 Rolled: ${rolledRange.label} (${rolledRange.probability}% chance)`);
    console.log(`🎯 Looking for cards between $${rolledRange.min.toFixed(2)} and $${rolledRange.max.toFixed(2)}`);

    // Filter cards to ONLY this specific range
    const candidates = cardPool.filter(card => {
      const price = card.marketPrice || pokemonApi.extractCardPrice(card);
      return price >= rolledRange.min && price <= rolledRange.max;
    });

    console.log(`📋 Found ${candidates.length} cards in this range`);

    if (candidates.length === 0) {
      // If no cards in this exact range, try adjacent ranges
      console.warn('⚠️ No cards in exact range, trying broader search...');
      
      // Try 20% variance from range
      const expandedMin = rolledRange.min * 0.8;
      const expandedMax = rolledRange.max * 1.2;
      
      const expandedCandidates = cardPool.filter(card => {
        const price = card.marketPrice || pokemonApi.extractCardPrice(card);
        return price >= expandedMin && price <= expandedMax;
      });

      if (expandedCandidates.length > 0) {
        const selectedCard = expandedCandidates[Math.floor(Math.random() * expandedCandidates.length)];
        const selectedPrice = selectedCard.marketPrice || pokemonApi.extractCardPrice(selectedCard);
        console.log(`✅ Selected (expanded range): ${selectedCard.name} - $${selectedPrice.toFixed(2)}`);
        return selectedCard;
      }

      // Last resort: find closest card to range midpoint
      const targetMidpoint = (rolledRange.min + rolledRange.max) / 2;
      const sorted = [...cardPool].sort((a, b) => {
        const priceA = a.marketPrice || pokemonApi.extractCardPrice(a);
        const priceB = b.marketPrice || pokemonApi.extractCardPrice(b);
        const diffA = Math.abs(priceA - targetMidpoint);
        const diffB = Math.abs(priceB - targetMidpoint);
        return diffA - diffB;
      });

      const closest = sorted[0];
      if (closest) {
        const closestPrice = closest.marketPrice || pokemonApi.extractCardPrice(closest);
        console.log(`⚠️ Selected closest card: ${closest.name} - $${closestPrice.toFixed(2)}`);
      }
      return closest || null;
    }

    // Pick a random card from the candidates in this range
    const selectedCard = candidates[Math.floor(Math.random() * candidates.length)];
    const selectedPrice = selectedCard.marketPrice || pokemonApi.extractCardPrice(selectedCard);
    console.log(`✅ Selected: ${selectedCard.name} - $${selectedPrice.toFixed(2)}`);
    
    return selectedCard;
  }

  // Get pack opening history
  getHistory(): PackOpeningHistory {
    try {
      const stored = localStorage.getItem(PACK_HISTORY_KEY);
      if (!stored) {
        return {
          pulls: [],
          totalSpent: 0,
          totalValue: 0,
          totalProfit: 0,
          packsOpened: 0
        };
      }

      const pulls: PackPull[] = JSON.parse(stored);
      const totalSpent = pulls.reduce((sum, pull) => sum + pull.pack.price, 0);
      const totalValue = pulls.reduce((sum, pull) => sum + pull.totalValue, 0);
      const totalProfit = totalValue - totalSpent;

      return {
        pulls,
        totalSpent,
        totalValue,
        totalProfit,
        packsOpened: pulls.length
      };
    } catch (error) {
      console.error('Error loading pack history:', error);
      return {
        pulls: [],
        totalSpent: 0,
        totalValue: 0,
        totalProfit: 0,
        packsOpened: 0
      };
    }
  }

  // Add pack pull to history
  private addToHistory(packPull: PackPull): void {
    try {
      const history = this.getHistory();
      history.pulls.unshift(packPull);
      
      // Keep only last 100 pulls
      if (history.pulls.length > 100) {
        history.pulls = history.pulls.slice(0, 100);
      }

      localStorage.setItem(PACK_HISTORY_KEY, JSON.stringify(history.pulls));
    } catch (error) {
      console.error('Error saving pack history:', error);
    }
  }

  // Clear history
  clearHistory(): void {
    localStorage.removeItem(PACK_HISTORY_KEY);
    console.log('🗑️ Pack opening history cleared');
  }

  // Clear card pool cache to force refresh
  clearCache(): void {
    this.cardPoolCache = [];
    this.lastFetchTime = 0;
    console.log('🔄 Card pool cache cleared');
  }
}

export const tieredPackService = new TieredPackService();

