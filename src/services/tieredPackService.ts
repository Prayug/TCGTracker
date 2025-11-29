import { Pack, PackPull, PokemonCard, PackOpeningHistory, ValueRange } from '../types/pokemon';
import { pokemonApi } from './pokemonApi';
import { createPlaceholderImage, hasGoodStoredImages, fetchCardImagesFromBackend } from '../utils/imageHelpers';

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
        { min: 500, max: 750, probability: 35, label: '$500-750' },
        { min: 750, max: 1000, probability: 35, label: '$750-1000' },
        { min: 1000, max: 2000, probability: 25, label: '$1000-2000' },
        { min: 2000, max: 5000, probability: 4, label: '$2000-5000' },
        { min: 5000, max: 10000, probability: 0.8, label: '$5000-10000' },
        { min: 10000, max: 20000, probability: 0.2, label: '$10000-20000' }
      ]
    }
  ];

  private setCodeCache = new Map<string, string>();

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

      // If selected from local DB pool, enrich with actual images from Pokemon API (no fallback)
      // Narrow type to local DB enriched shape when present
      const maybeLocal = selectedCard as PokemonCard & { isLocalDbCard?: boolean; imageSource?: string };
      if (maybeLocal.isLocalDbCard) {
        const cardName = selectedCard.name;
        const setId = selectedCard.set?.id;
        const cardNumber = selectedCard.number;
        
        if (!cardName || !setId) {
          throw new Error('Missing card name or set ID for image lookup');
        }
        
        // Check if we already have good stored images
        if (!hasGoodStoredImages(maybeLocal.imageSource, selectedCard.images?.large)) {
          // Try to fetch images from backend
          console.log(`🔍 Searching Pokemon API via backend for: "${cardName}" in set "${setId}"`);
          const imageResult = await fetchCardImagesFromBackend(cardName, setId, cardNumber);
          
          if (imageResult?.images) {
            selectedCard.images = imageResult.images;
            if (imageResult.id) selectedCard.id = imageResult.id;
            if (imageResult.rarity) selectedCard.rarity = imageResult.rarity;
            console.log(`✅ Real images loaded for ${cardName}`);
          } else {
            // Try deterministic URLs as fallback
            const setIdNormalized = await this.resolveSetIdForImageUrl(setId);
            let cardNumberNormalized = cardNumber ? cardNumber.split('/')[0].trim() : '';
            
            if (cardNumberNormalized) {
              cardNumberNormalized = cardNumberNormalized.replace(/^0+/, '') || '0';
              cardNumberNormalized = cardNumberNormalized.toLowerCase();
            }

            if (setIdNormalized && cardNumberNormalized) {
              const deterministicUrl = `https://images.pokemontcg.io/${setIdNormalized}/${cardNumberNormalized}.png`;
              selectedCard.images = {
                small: deterministicUrl,
                large: deterministicUrl
              };
            } else {
              // Last resort: use placeholder
              selectedCard.images = createPlaceholderImage(cardName, selectedCard.set.name);
              console.log(`🖼️ Using placeholder image for ${cardName}`);
            }
          }
        } else {
          console.log(`✅ Using pre-stored image for ${cardName} (source: ${maybeLocal.imageSource})`);
        }
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
    console.log('🔍 Fetching fresh card pool from local DB (backend)...');
    
    // Always fetch fresh from DB - no caching
    // Fetch very large pool (2000 cards) to ensure coverage across all price ranges
    const backendBase = window.location.origin.replace(':5173', ':3001');
    const resp = await fetch(`${backendBase}/api/cards/pool?limit=2000`);
    
    if (!resp.ok) {
      throw new Error(`Failed to fetch card pool: ${resp.status} ${resp.statusText}`);
    }
    
    const json = await resp.json();
    const allCards = json.data || [];
    
    if (allCards.length === 0) {
      throw new Error('No cards returned from database');
    }
    
    console.log(`📦 Successfully fetched ${allCards.length} cards from local DB`);
    
    // Filter out cards with no price
    const cardsWithPrices = allCards.filter((card: PokemonCard) => {
      const price = card.marketPrice || pokemonApi.extractCardPrice(card);
      return price > 0 && price < 10000; // Filter out invalid prices
    });

    console.log(`💰 ${cardsWithPrices.length} cards have valid prices`);
    
    if (cardsWithPrices.length === 0) {
      throw new Error('No cards with valid prices found');
    }

    // Shuffle for variety
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
    ranges: ValueRange[]
  ): PokemonCard | null {
    // First, roll to see which VALUE RANGE we hit
    const rolledRange = this.selectValueRange(ranges);
    
    console.log(`🎲 Rolled: ${rolledRange.label} (${rolledRange.probability}% chance)`);
    console.log(`🎯 Looking for cards between $${rolledRange.min.toFixed(2)} and $${rolledRange.max.toFixed(2)}`);

    // Filter cards to ONLY this specific range
    let candidates = cardPool.filter(card => {
      const price = card.marketPrice || pokemonApi.extractCardPrice(card);
      return price >= rolledRange.min && price <= rolledRange.max;
    });

    // Remove duplicates based on unique identifier to ensure fair distribution
    const seenIdentifiers = new Set<string>();
    candidates = candidates.filter(card => {
      const identifier =
        (card as PokemonCard & { uniqueIdentifier?: string }).uniqueIdentifier ||
        `${card.set?.id || ''}|${card.number || ''}|${card.name || ''}`.toLowerCase().replace(/[^a-z0-9|]/g, '');
      if (seenIdentifiers.has(identifier)) {
        return false;
      }
      seenIdentifiers.add(identifier);
      return true;
    });

    console.log(`📋 Found ${candidates.length} cards in this range`);

    // Fallback logic if no cards in exact range
    if (candidates.length === 0) {
      console.warn(`⚠️ No cards in exact range $${rolledRange.min}-${rolledRange.max}. Trying fallback...`);
      
      // Strategy 1: Try broader range (expand by 20%)
      const expandedMin = rolledRange.min * 0.8;
      const expandedMax = rolledRange.max * 1.2;
      candidates = cardPool.filter(card => {
        const price = card.marketPrice || pokemonApi.extractCardPrice(card);
        return price >= expandedMin && price <= expandedMax;
      });

      // Remove duplicates from expanded range candidates
      const seenIdentifiersExpanded = new Set<string>();
      candidates = candidates.filter(card => {
        const identifier =
          (card as PokemonCard & { uniqueIdentifier?: string }).uniqueIdentifier ||
          `${card.set?.id || ''}|${card.number || ''}|${card.name || ''}`.toLowerCase().replace(/[^a-z0-9|]/g, '');
        if (seenIdentifiersExpanded.has(identifier)) {
          return false;
        }
        seenIdentifiersExpanded.add(identifier);
        return true;
      });
      
      if (candidates.length > 0) {
        console.log(`✅ Found ${candidates.length} cards in expanded range $${expandedMin.toFixed(2)}-${expandedMax.toFixed(2)}`);
      } else {
        // Strategy 2: Find closest card below the range
        const lowerCards = cardPool.filter(card => {
          const price = card.marketPrice || pokemonApi.extractCardPrice(card);
          return price < rolledRange.min && price > 0;
        });
        
        if (lowerCards.length > 0) {
          // Get the most expensive card below the range
          lowerCards.sort((a, b) => {
            const priceA = a.marketPrice || pokemonApi.extractCardPrice(a);
            const priceB = b.marketPrice || pokemonApi.extractCardPrice(b);
            return priceB - priceA;
          });
          candidates = [lowerCards[0]];
          console.log(`✅ Using closest card below range: $${(candidates[0].marketPrice || pokemonApi.extractCardPrice(candidates[0])).toFixed(2)}`);
        } else {
          // Strategy 3: Find closest card above the range
          const higherCards = cardPool.filter(card => {
            const price = card.marketPrice || pokemonApi.extractCardPrice(card);
            return price > rolledRange.max;
          });
          
          if (higherCards.length > 0) {
            // Get the cheapest card above the range
            higherCards.sort((a, b) => {
              const priceA = a.marketPrice || pokemonApi.extractCardPrice(a);
              const priceB = b.marketPrice || pokemonApi.extractCardPrice(b);
              return priceA - priceB;
            });
            candidates = [higherCards[0]];
            console.log(`✅ Using closest card above range: $${(candidates[0].marketPrice || pokemonApi.extractCardPrice(candidates[0])).toFixed(2)}`);
          } else {
            // Strategy 4: Last resort - pick random card from pool
            console.warn(`⚠️ No suitable cards found, using random card from pool`);
            candidates = [cardPool[Math.floor(Math.random() * cardPool.length)]];
          }
        }
      }
    }

    if (candidates.length === 0) {
      console.error('❌ No cards available in pool at all');
      return null;
    }

    // Shuffle candidates array to ensure pure randomness
    const shuffledCandidates = this.shuffleArray(candidates);

    // Pick a truly random card from the shuffled candidates
    // Use crypto.getRandomValues for better randomness if available, otherwise Math.random
    const randomIndex = typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0] % shuffledCandidates.length
      : Math.floor(Math.random() * shuffledCandidates.length);
    
    const selectedCard = shuffledCandidates[randomIndex];
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

  // Clear card pool cache (no-op since we don't cache anymore)
  clearCache(): void {
    console.log('🔄 Cache clear requested (no cache in use)');
  }

  private async resolveSetIdForImageUrl(setId: string): Promise<string | null> {
    if (!setId) {
      return null;
    }

    const cacheKey = setId.toLowerCase();
    if (this.setCodeCache.has(cacheKey)) {
      return this.setCodeCache.get(cacheKey)!;
    }

    const backendBase = window.location.origin.replace(':5173', ':3001');
    try {
      const response = await fetch(
        `${backendBase}/api/packs/resolve-set-code/${encodeURIComponent(setId)}`,
        { method: 'GET' }
      );
      if (response.ok) {
        const payload = await response.json();
        if (payload.apiSetCode) {
          this.setCodeCache.set(cacheKey, payload.apiSetCode);
          return payload.apiSetCode;
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to resolve set code for ${setId}:`, error);
    }

    let fallback = this.extractSetCodeFromPattern(cacheKey);
    
    // Special handling for sets that don't match standard patterns
    if (!fallback && cacheKey.startsWith('sv')) {
      // Try to extract SV series number if present
      const svMatch = cacheKey.match(/sv(\d+)/);
      if (svMatch) {
        fallback = `sv${parseInt(svMatch[1], 10)}`;
      } else if (cacheKey.includes('blackbolt')) {
        // Special case for Black Bolt set
        fallback = 'zsv10pt5';
      } else if (cacheKey.includes('whiteflare')) {
        // Special case for White Flare set
        fallback = 'rsv10pt5';
      }
    }
    
    if (fallback) {
      this.setCodeCache.set(cacheKey, fallback);
    }
    return fallback;
  }

  private extractSetCodeFromPattern(value: string): string | null {
    const patterns = [
      /(sv|swsh|sm|xy|bw|ex|pl|hgss|col|cel|ecard|me)(\d+)/,
      /(base|dp|hgss|neo|mcd)(\d+)/,
    ];

    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match) {
        const series = match[1];
        const number = parseInt(match[2], 10).toString();
        return `${series}${number}`;
      }
    }

    return null;
  }
}

export const tieredPackService = new TieredPackService();

