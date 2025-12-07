import { Pack, PackPull, PokemonCard, PackOpeningHistory, ValueRange } from '../types/pokemon';
import { pokemonApi } from './pokemonApi';

const PACK_HISTORY_KEY = 'tcg_tiered_pack_history';

class TieredPackService {
  // No caching - always fetch fresh from DB

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
        { min: 400, max: 600, probability: 35, label: '$400-600' },
        { min: 600, max: 800, probability: 35, label: '$600-800' },
        { min: 800, max: 1000, probability: 20, label: '$800-1000' },
        { min: 1000, max: 1500, probability: 8, label: '$1000-1500' },
        { min: 1500, max: 2500, probability: 1.5, label: '$1500-2500' },
        { min: 2500, max: 5000, probability: 0.5, label: '$2500-5000' }
      ]
    }
  ];


  // Get all available tiered packs
  getAvailablePacks(): Pack[] {
    return this.tieredPacks;
  }

  // Open a tiered pack
  async openPack(pack: Pack): Promise<PackPull> {
    try {
      const cardPool = await this.fetchCardPool();
      console.log("cardPool: ", cardPool);
      if (cardPool.length === 0) {
        throw new Error('Unable to fetch cards. Please check your connection.');
      }

      const selectedCard = this.selectCardFromRange(cardPool, pack.valueRanges, pack.price);
      console.log("selectedCard: ", selectedCard);
      if (!selectedCard) {
        throw new Error('No suitable card found in the pool for this value range.');
      }

      // Backend handles images (stored -> deterministic)
      // If no images available, card.images will be undefined

      const totalValue = selectedCard.marketPrice || pokemonApi.extractCardPrice(selectedCard);
      const profit = totalValue - pack.price;

      const packPull: PackPull = {
        pack,
        cards: [selectedCard],
        totalValue,
        profit,
        openedAt: new Date().toISOString()
      };

      this.addToHistory(packPull);
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
    const backendBase = window.location.origin.replace(':5173', ':3001');
    // Increased limit from 2000 to 10000 for better pool diversity
    const resp = await fetch(`${backendBase}/api/cards/pool?limit=10000`);
    
    if (!resp.ok) {
      throw new Error(`Failed to fetch card pool: ${resp.status}`);
    }
    
    const json = await resp.json();
    const allCards = json.data || [];
    
    if (allCards.length === 0) {
      throw new Error('No cards returned from database');
    }
    
    // Filter out cards with no price
    const cardsWithPrices = allCards.filter((card: PokemonCard) => {
      const price = card.marketPrice || pokemonApi.extractCardPrice(card);
      return price > 0 && price < 10000;
    });
    
    if (cardsWithPrices.length === 0) {
      throw new Error('No cards with valid prices found');
    }

    // Debug: Log max price in pool
    const prices = cardsWithPrices.map((card: PokemonCard) => card.marketPrice || pokemonApi.extractCardPrice(card));
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    console.log(`📊 Card pool stats: ${cardsWithPrices.length} cards, price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`);

    return this.shuffleArray([...cardsWithPrices]);
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
    ranges: ValueRange[],
    packPrice?: number
  ): PokemonCard | null {
    const rolledRange = this.selectValueRange(ranges);
    
    // Calculate absolute minimum value based on pack price
    // For expensive packs, enforce a minimum that's at least 30% of pack price
    const absoluteMinimum = packPrice ? Math.max(rolledRange.min, packPrice * 0.3) : rolledRange.min;

    // Filter cards to this specific range
    let candidates = cardPool.filter(card => {
      const price = card.marketPrice || pokemonApi.extractCardPrice(card);
      return price >= rolledRange.min && price <= rolledRange.max;
    });

    // Remove duplicates using card.id (not collapsed identifier)
    // This prevents cards from different sets with same name/number from collapsing
    const seenIds = new Set<string>();
    candidates = candidates.filter(card => {
      // Use card.id if available, otherwise fallback to uniqueIdentifier, then construct one
      const cardId = card.id || 
        (card as PokemonCard & { uniqueIdentifier?: string }).uniqueIdentifier ||
        `${card.set?.id || 'unknown'}-${card.number || 'unknown'}-${card.name || 'unknown'}`;
      
      if (seenIds.has(cardId)) return false;
      seenIds.add(cardId);
      return true;
    });

    // Fallback 1: expand range by 20% if no matches (but respect absolute minimum)
    if (candidates.length === 0) {
      const expandedMin = Math.max(rolledRange.min * 0.8, absoluteMinimum);
      const expandedMax = rolledRange.max * 1.2;
      candidates = cardPool.filter(card => {
        const price = card.marketPrice || pokemonApi.extractCardPrice(card);
        return price >= expandedMin && price <= expandedMax;
      });
      
      const seenExpanded = new Set<string>();
      candidates = candidates.filter(card => {
        const cardId = card.id || 
          (card as PokemonCard & { uniqueIdentifier?: string }).uniqueIdentifier ||
          `${card.set?.id || 'unknown'}-${card.number || 'unknown'}-${card.name || 'unknown'}`;
        if (seenExpanded.has(cardId)) return false;
        seenExpanded.add(cardId);
        return true;
      });
    }

    // Fallback 2: If still no matches, select from top N most expensive cards
    // This handles cases where the requested range is above the database's max price
    if (candidates.length === 0) {
      // Sort cards by price descending and take top cards that are >= rolledRange.min * 0.5
      const sortedByPrice = [...cardPool].sort((a, b) => {
        const priceA = a.marketPrice || pokemonApi.extractCardPrice(a);
        const priceB = b.marketPrice || pokemonApi.extractCardPrice(b);
        return priceB - priceA;
      });

      // Take top cards that are at least the absolute minimum (or top 100, whichever is smaller)
      // For expensive packs, this ensures we don't go below the pack's minimum threshold
      const minPriceThreshold = Math.max(rolledRange.min * 0.5, absoluteMinimum);
      candidates = sortedByPrice
        .filter(card => {
          const price = card.marketPrice || pokemonApi.extractCardPrice(card);
          return price >= minPriceThreshold;
        })
        .slice(0, 100); // Top 100 most expensive cards

      // Remove duplicates
      const seenTop = new Set<string>();
      candidates = candidates.filter(card => {
        const cardId = card.id || 
          (card as PokemonCard & { uniqueIdentifier?: string }).uniqueIdentifier ||
          `${card.set?.id || 'unknown'}-${card.number || 'unknown'}-${card.name || 'unknown'}`;
        if (seenTop.has(cardId)) return false;
        seenTop.add(cardId);
        return true;
      });

      if (candidates.length > 0) {
        console.log(`⚠️ No cards in range $${rolledRange.min}-$${rolledRange.max}, selected from top ${candidates.length} expensive cards (min: $${minPriceThreshold.toFixed(2)})`);
      }
    }

    // Last resort: pick from cards that meet the absolute minimum (never go below pack threshold)
    if (candidates.length === 0) {
      candidates = cardPool.filter(card => {
        const price = card.marketPrice || pokemonApi.extractCardPrice(card);
        return price >= absoluteMinimum;
      });
      
      if (candidates.length === 0) {
        // If even this fails, we have a problem - log it and use top expensive cards
        console.error(`❌ No cards found above minimum $${absoluteMinimum.toFixed(2)} for pack. Using top expensive cards.`);
        const sortedByPrice = [...cardPool].sort((a, b) => {
          const priceA = a.marketPrice || pokemonApi.extractCardPrice(a);
          const priceB = b.marketPrice || pokemonApi.extractCardPrice(b);
          return priceB - priceA;
        });
        candidates = sortedByPrice.slice(0, 50); // Top 50 as last resort
      } else {
        console.warn(`⚠️ No candidates found after all fallbacks, using cards above minimum $${absoluteMinimum.toFixed(2)} (${candidates.length} cards)`);
      }
    }

    const shuffled = this.shuffleArray(candidates);
    const randomIndex = typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0] % shuffled.length
      : Math.floor(Math.random() * shuffled.length);
    
    return shuffled[randomIndex];
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
  }

  // Clear card pool cache (no-op since we don't cache anymore)
  clearCache(): void {
    // No-op
  }
}

export const tieredPackService = new TieredPackService();

