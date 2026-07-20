import { Pack, PackPull, PokemonCard, PackOpeningHistory, ValueRange } from '../types/pokemon';
import { pokemonApi, proxyImageUrl } from './pokemonApi';
import { env } from '../config/env';

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
      imageUrl: '/images/pokemontcg/base1/logo.png',
      valueRanges: [
        { min: 12, max: 19, probability: 40.6, label: '$12-19' },
        { min: 19, max: 25, probability: 30.6, label: '$19-25' },
        { min: 25, max: 50, probability: 25.4, label: '$25-50' },
        { min: 50, max: 100, probability: 3, label: '$50-100' },
        { min: 100, max: 250, probability: 0.3, label: '$100-250' },
        { min: 250, max: 500, probability: 0.1, label: '$250-500' }
      ],
      boostedValueRanges: [
        { min: 0.5, max: 5, probability: 42, label: '$0.50-5' },
        { min: 5, max: 25, probability: 18, label: '$5-25' },
        { min: 25, max: 75, probability: 15, label: '$25-75' },
        { min: 75, max: 150, probability: 10, label: '$75-150' },
        { min: 150, max: 350, probability: 8, label: '$150-350' },
        { min: 350, max: 500, probability: 5, label: '$350-500' },
        { min: 500, max: 1250, probability: 2, label: '$500-1250 (5x+)' }
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
      imageUrl: '/images/pokemontcg/base1/logo.png',
      valueRanges: [
        { min: 25, max: 38, probability: 40, label: '$25-38' },
        { min: 38, max: 50, probability: 30, label: '$38-50' },
        { min: 50, max: 100, probability: 25, label: '$50-100' },
        { min: 100, max: 200, probability: 4, label: '$100-200' },
        { min: 200, max: 500, probability: 0.8, label: '$200-500' },
        { min: 500, max: 1000, probability: 0.2, label: '$500-1000' }
      ],
      boostedValueRanges: [
        { min: 1, max: 10, probability: 40, label: '$1-10' },
        { min: 10, max: 50, probability: 18, label: '$10-50' },
        { min: 50, max: 125, probability: 15, label: '$50-125' },
        { min: 125, max: 250, probability: 10, label: '$125-250' },
        { min: 250, max: 500, probability: 8, label: '$250-500' },
        { min: 500, max: 1000, probability: 5, label: '$500-1000' },
        { min: 1000, max: 2500, probability: 3, label: '$1000-2500 (5x+)' }
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
      imageUrl: '/images/pokemontcg/base1/logo.png',
      valueRanges: [
        { min: 50, max: 75, probability: 38, label: '$50-75' },
        { min: 75, max: 100, probability: 32, label: '$75-100' },
        { min: 100, max: 200, probability: 25, label: '$100-200' },
        { min: 200, max: 400, probability: 4, label: '$200-400' },
        { min: 400, max: 1000, probability: 0.8, label: '$400-1000' },
        { min: 1000, max: 2000, probability: 0.2, label: '$1000-2000' }
      ],
      boostedValueRanges: [
        { min: 3, max: 20, probability: 38, label: '$3-20' },
        { min: 20, max: 75, probability: 18, label: '$20-75' },
        { min: 75, max: 200, probability: 15, label: '$75-200' },
        { min: 200, max: 400, probability: 10, label: '$200-400' },
        { min: 400, max: 800, probability: 8, label: '$400-800' },
        { min: 800, max: 1500, probability: 6, label: '$800-1500' },
        { min: 1500, max: 5000, probability: 5, label: '$1500-5000 (5x+)' }
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
      imageUrl: '/images/pokemontcg/base1/logo.png',
      valueRanges: [
        { min: 250, max: 375, probability: 35, label: '$250-375' },
        { min: 375, max: 500, probability: 35, label: '$375-500' },
        { min: 500, max: 1000, probability: 25, label: '$500-1000' },
        { min: 1000, max: 2000, probability: 4, label: '$1000-2000' },
        { min: 2000, max: 5000, probability: 0.8, label: '$2000-5000' },
        { min: 5000, max: 10000, probability: 0.2, label: '$5000-10000' }
      ],
      boostedValueRanges: [
        { min: 10, max: 100, probability: 35, label: '$10-100' },
        { min: 100, max: 375, probability: 18, label: '$100-375' },
        { min: 375, max: 750, probability: 15, label: '$375-750' },
        { min: 750, max: 1500, probability: 10, label: '$750-1500' },
        { min: 1500, max: 3500, probability: 9, label: '$1500-3500' },
        { min: 3500, max: 7500, probability: 8, label: '$3500-7500' },
        { min: 7500, max: 25000, probability: 5, label: '$7500-25000 (5x+)' }
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
      imageUrl: '/images/pokemontcg/base1/logo.png',
      valueRanges: [
        { min: 400, max: 600, probability: 35, label: '$400-600' },
        { min: 600, max: 800, probability: 35, label: '$600-800' },
        { min: 800, max: 1000, probability: 20, label: '$800-1000' },
        { min: 1000, max: 1500, probability: 8, label: '$1000-1500' },
        { min: 1500, max: 2500, probability: 1.5, label: '$1500-2500' },
        { min: 2500, max: 5000, probability: 0.5, label: '$2500-5000' }
      ],
      boostedValueRanges: [
        { min: 25, max: 200, probability: 30, label: '$25-200' },
        { min: 200, max: 600, probability: 18, label: '$200-600' },
        { min: 600, max: 1200, probability: 14, label: '$600-1200' },
        { min: 1200, max: 2500, probability: 12, label: '$1200-2500' },
        { min: 2500, max: 5000, probability: 10, label: '$2500-5000' },
        { min: 5000, max: 10000, probability: 8, label: '$5000-10000' },
        { min: 10000, max: 50000, probability: 8, label: '$10000-50000 (5x+)' }
      ]
    }
  ];


  // Get all available tiered packs
  getAvailablePacks(): Pack[] {
    return this.tieredPacks;
  }

  // Open a tiered pack
  async openPack(pack: Pack, boosted = false): Promise<PackPull> {
    try {
      const cardPool = await this.fetchCardPool();
      console.log("cardPool: ", cardPool);
      if (cardPool.length === 0) {
        throw new Error('Unable to fetch cards. Please check your connection.');
      }

      const ranges = boosted && pack.boostedValueRanges ? pack.boostedValueRanges : pack.valueRanges;
      const selectedCard = this.selectCardFromRange(cardPool, ranges);
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
    const resp = await fetch(`${env.apiUrl}/api/cards/pool?limit=10000`);
    
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
      return price > 0 && price < 100000;
    });
    
    if (cardsWithPrices.length === 0) {
      throw new Error('No cards with valid prices found');
    }

    // Debug: Log max price in pool
    const prices = cardsWithPrices.map((card: PokemonCard) => card.marketPrice || pokemonApi.extractCardPrice(card));
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    console.log(`📊 Card pool stats: ${cardsWithPrices.length} cards, price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`);

    // Rewrite image URLs to use the Vite proxy
    const rewritten = cardsWithPrices.map((card: PokemonCard) => ({
      ...card,
      images: card.images ? {
        ...card.images,
        small: proxyImageUrl(card.images.small),
        large: proxyImageUrl(card.images.large),
      } : card.images,
    }));

    return this.shuffleArray([...rewritten]);
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
    const rolledRange = this.selectValueRange(ranges);
    
    // Try exact range first, then progressively widen
    let candidates: PokemonCard[] = [];
    let expand = 0;
    const maxExpand = 5;

    while (candidates.length === 0 && expand <= maxExpand) {
      const min = rolledRange.min - expand * rolledRange.min * 0.3;
      const max = rolledRange.max + expand * rolledRange.max * 0.5;

      candidates = cardPool.filter(card => {
        const price = card.marketPrice || pokemonApi.extractCardPrice(card);
        return price >= min && price <= max;
      });

      // Remove duplicates
      const seenIds = new Set<string>();
      candidates = candidates.filter(card => {
        const cardId = card.id ||
          (card as PokemonCard & { uniqueIdentifier?: string }).uniqueIdentifier ||
          `${card.set?.id || 'unknown'}-${card.number || 'unknown'}-${card.name || 'unknown'}`;

        if (seenIds.has(cardId)) return false;
        seenIds.add(cardId);
        return true;
      });

      expand++;
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by proximity to the midpoint of the rolled range and prefer closer matches
    const midpoint = (rolledRange.min + rolledRange.max) / 2;
    candidates.sort((a, b) => {
      const priceA = a.marketPrice || pokemonApi.extractCardPrice(a);
      const priceB = b.marketPrice || pokemonApi.extractCardPrice(b);
      return Math.abs(priceA - midpoint) - Math.abs(priceB - midpoint);
    });

    // Weighted random: 70% chance to pick from top 3 closest, 30% random from all
    const topN = Math.min(3, candidates.length);
    const useTop = Math.random() < 0.7;
    const pool = useTop ? candidates.slice(0, topN) : candidates;

    const randomIndex = typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0] % pool.length
      : Math.floor(Math.random() * pool.length);
    
    return pool[randomIndex];
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

