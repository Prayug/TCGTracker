import { PokemonCard, PokemonSet, ApiResponse } from '../types/pokemon';
import { cacheService } from './cacheService';

// Official Pokemon TCG API v2 - Documentation: https://docs.pokemontcg.io/
// Pokemon TCG API supports CORS, so we can call it directly without a proxy
const API_BASE_URL = 'https://api.pokemontcg.io/v2';

// Optional: Add your API key here for higher rate limits (get one at https://dev.pokemontcg.io/)
// Without API key: 20,000 requests per day
// With API key: 50,000+ requests per day with no IP restrictions
const API_KEY = import.meta.env.VITE_POKEMON_TCG_API_KEY || '';

class PokemonApiService {
  private pendingRequests: Map<string, Promise<PokemonCard[]>> = new Map();
  private async fetchApi<T>(
    endpoint: string, 
    params?: Record<string, string>, 
    retries = 2  // Increased to 2 retries (3 total attempts)
  ): Promise<ApiResponse<T>> {
    // Build URL with query params
    const url = new URL(`${API_BASE_URL}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.append(key, value);
      });
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      // Increased timeout: 60 seconds (API can be slow)
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      try {
        // Build headers according to official documentation
        const headers: HeadersInit = {
          'Accept': 'application/json',
        };

        // Add API key if available (X-Api-Key header as per docs)
        if (API_KEY) {
          headers['X-Api-Key'] = API_KEY;
        }

        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers,
          mode: 'cors', // Explicitly enable CORS
        });
        
        // Clear timeout on success
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          // Check if it's a rate limit or server error that we should retry
          if ([429, 500, 502, 503, 504].includes(response.status) && attempt < retries) {
            const delay = 2000 * (attempt + 1); // 2s, 4s, 6s
            console.warn(`Pokemon API ${response.status} error, retrying in ${delay}ms... (attempt ${attempt + 1}/${retries + 1})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        // Clear timeout on error
        clearTimeout(timeoutId);
        
        lastError = error as Error;
        
        // Retry on any timeout or network error
        if (attempt < retries) {
          const delay = 2000 * (attempt + 1); // 2s, 4s, 6s
          console.log(`⏳ Request failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If all retries exhausted, throw the error
        console.error(`❌ All ${retries + 1} attempts failed`);
        throw error;
      }
    }

    console.error('Pokemon API Error after retries:', lastError);
    throw lastError || new Error('Unknown API error');
  }

  async searchCards(
    query?: string, 
    setId?: string, 
    pageSize: number = 250, 
    fetchAll: boolean = true
  ): Promise<PokemonCard[]> {
    // Create cache key
    const cacheKey = `cards_${query || 'all'}_${setId || 'all'}_${fetchAll}_${pageSize}`;
    
    // Check cache first
    const cached = cacheService.get<PokemonCard[]>(cacheKey);
    if (cached) {
      console.log(`✅ Returning ${cached.length} cards from cache`);
      return cached;
    }

    // Check if request is already pending (deduplication)
    if (this.pendingRequests.has(cacheKey)) {
      console.log('⏳ Request already pending, waiting...');
      return this.pendingRequests.get(cacheKey)!;
    }

    const queryParts: string[] = [];
    
    if (query && query.trim()) {
      const escapedQuery = query.trim();
      queryParts.push(`name:*${escapedQuery}*`);
    }
    
    if (setId) {
      queryParts.push(`set.id:${setId}`);
    }

    const queryString = queryParts.length > 0 ? queryParts.join(' ') : undefined;
    
    const requestPromise = (async () => {
      try {
        if (!fetchAll) {
          const params: Record<string, string> = {
            pageSize: pageSize.toString(),
          };
          if (queryString) {
            params.q = queryString;
          }
          
          const response = await this.fetchApi<PokemonCard>('/cards', params);
          const cards = response.data || [];
          console.log(`✅ Fetched ${cards.length} cards (single page)`);
          
          // Cache result
          cacheService.set(cacheKey, cards, 10 * 60 * 1000); // 10 minutes
          return cards;
        }

        // OPTIMIZED: Fetch multiple pages in PARALLEL for speed
        console.log('🚀 Fetching cards in parallel...');
        const maxPages = 6; // Increased: 6 pages × 250 = 1500 cards max
        
        // Create all requests upfront
        const pageRequests = Array.from({ length: maxPages }, (_, i) => {
          const params: Record<string, string> = {
            page: (i + 1).toString(),
            pageSize: '250',
          };
          
          if (queryString) {
            params.q = queryString;
          }

          return this.fetchApi<PokemonCard>('/cards', params)
            .then(response => response.data || [])
            .catch(error => {
              console.warn(`Page ${i + 1} failed:`, error);
              return [];
            });
        });

        // Execute all requests in parallel
        const results = await Promise.all(pageRequests);
        
        // Flatten and filter out empty results
        const allCards = results.flat().filter(card => card && card.id);
        
        console.log(`✅ Fetched ${allCards.length} total cards in parallel`);
        
        // Cache result for 10 minutes
        cacheService.set(cacheKey, allCards, 10 * 60 * 1000);
        
        return allCards;
      } catch (error) {
        console.error('Error searching cards:', error);
        return [];
      } finally {
        // Remove from pending requests
        this.pendingRequests.delete(cacheKey);
      }
    })();

    // Store pending request
    this.pendingRequests.set(cacheKey, requestPromise);

    return requestPromise;
  }

  async getSets(): Promise<PokemonSet[]> {
    const cacheKey = 'sets_all';
    
    // Check cache first
    const cached = cacheService.get<PokemonSet[]>(cacheKey);
    if (cached) {
      console.log(`✅ Returning ${cached.length} sets from cache`);
      return cached;
    }

    try {
      const params = {
        orderBy: '-releaseDate',
        pageSize: '250'
      };
      const response = await this.fetchApi<PokemonSet>('/sets', params);
      const sets = response.data || [];
      
      // Cache for 1 hour (sets don't change often)
      cacheService.set(cacheKey, sets, 60 * 60 * 1000);
      
      return sets;
    } catch (error) {
      console.error('Error fetching sets:', error);
      return [];
    }
  }

  async getCardById(id: string): Promise<PokemonCard | null> {
    const cacheKey = `card_${id}`;
    
    // Check cache first
    const cached = cacheService.get<PokemonCard>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.fetchApi<PokemonCard>(`/cards/${id}`);
      const card = response.data as unknown as PokemonCard;
      
      // Cache for 30 minutes
      cacheService.set(cacheKey, card, 30 * 60 * 1000);
      
      return card;
    } catch (error) {
      console.error(`Error fetching card ${id}:`, error);
      return null;
    }
  }

  extractCardPrice(card: PokemonCard): number {
    // Try TCGPlayer first
    if (card.tcgplayer?.prices) {
      const prices = card.tcgplayer.prices;
      
      // Priority order for price variants
      const variants = ['normal', 'holofoil', '1stEditionHolofoil', '1stEditionNormal', 'unlimited'];
      
      for (const variant of variants) {
        if (prices[variant]?.market) {
          return prices[variant].market!;
        }
      }
      
      // Fallback to any available price
      for (const priceData of Object.values(prices)) {
        if (priceData.market) return priceData.market;
        if (priceData.mid) return priceData.mid;
        if (priceData.high) return priceData.high;
        if (priceData.low) return priceData.low;
      }
    }

    // Try CardMarket as fallback
    if (card.cardmarket?.prices?.averageSellPrice) {
      return card.cardmarket.prices.averageSellPrice;
    }

    return 0;
  }
}

export const pokemonApi = new PokemonApiService();