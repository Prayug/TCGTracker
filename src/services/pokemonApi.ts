import { PokemonCard, PokemonSet, ApiResponse } from '../types/pokemon';

// Official Pokemon TCG API v2 - Documentation: https://docs.pokemontcg.io/
// Pokemon TCG API supports CORS, so we can call it directly without a proxy
const API_BASE_URL = 'https://api.pokemontcg.io/v2';

// Optional: Add your API key here for higher rate limits (get one at https://dev.pokemontcg.io/)
// Without API key: 20,000 requests per day
// With API key: 50,000+ requests per day with no IP restrictions
const API_KEY = import.meta.env.VITE_POKEMON_TCG_API_KEY || '';

class PokemonApiService {
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
    fetchAll: boolean = true,
    language?: string
  ): Promise<PokemonCard[]> {
    // Official API Documentation: https://docs.pokemontcg.io/api-reference/cards/search-cards
    // Query syntax follows Lucene-like format
    
    const queryParts: string[] = [];
    
    // Name search with wildcard (Lucene syntax: name:"*query*")
    if (query && query.trim()) {
      // Escape special Lucene characters if needed
      const escapedQuery = query.trim();
      queryParts.push(`name:*${escapedQuery}*`);
    }
    
    // Filter by set ID
    if (setId) {
      queryParts.push(`set.id:${setId}`);
    }

    const queryString = queryParts.length > 0 ? queryParts.join(' ') : undefined;
    
    // Note: Pokemon TCG API includes cards in all languages by default
    // Language filtering would need to be done post-fetch based on set information
    // or by filtering specific sets known to be in certain languages
    if (language && language !== 'en') {
      console.log(`🌍 Searching for ${language} cards...`);
    }

    try {
      if (!fetchAll) {
        // Single page fetch (for pack opening, etc.)
        const params: Record<string, string> = {
          pageSize: pageSize.toString(),
        };
        if (queryString) {
          params.q = queryString;
        }
        
        const response = await this.fetchApi<PokemonCard>('/cards', params);
        const cards = response.data || [];
        console.log(`✅ Fetched ${cards.length} cards (single page)`);
        return cards;
      }

      // Fetch multiple pages of results (up to a reasonable limit)
      console.log('🔍 Fetching cards from Pokemon TCG API...');
      const allCards: PokemonCard[] = [];
      let currentPage = 1;
      let hasMorePages = true;
      const maxPages = 3; // Reasonable limit: 3 pages × 250 = 750 cards max
      
      while (hasMorePages && currentPage <= maxPages) {
        try {
          const params: Record<string, string> = {
            page: currentPage.toString(),
            pageSize: '250', // Max allowed by API
          };
          
          if (queryString) {
            params.q = queryString;
          }

          const response = await this.fetchApi<PokemonCard>('/cards', params);
          const cards = response.data || [];
          
          if (cards.length > 0) {
            allCards.push(...cards);
            console.log(`📄 Page ${currentPage}: ${cards.length} cards (Total: ${allCards.length})`);
          }

          // Check if there are more pages
          // API returns fewer cards than pageSize when on last page
          hasMorePages = cards.length === 250 && currentPage < maxPages;
          
          if (!hasMorePages) {
            console.log(`✅ Fetched all available cards (${allCards.length} total)`);
          }
          
          currentPage++;

          // Small delay between pages to avoid rate limiting
          if (hasMorePages && currentPage <= maxPages) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          // If a page fails, stop fetching more pages but return what we have
          console.warn(`Failed to fetch page ${currentPage}, stopping pagination:`, error);
          break;
        }
      }
      
      if (allCards.length === 0) {
        console.log('No cards found for query');
      } else {
        console.log(`✅ Successfully fetched ${allCards.length} total cards`);
      }
      
      return allCards;
    } catch (error) {
      console.error('Error searching cards:', error);
      const errorMessage = (error as Error).message;
      
      // Provide helpful error message
      if (errorMessage.includes('504') || errorMessage.includes('Gateway Timeout')) {
        console.error('💡 Pokemon TCG API is experiencing high load. Try again in a moment.');
      } else if (errorMessage.includes('AbortError')) {
        console.error('💡 Request timed out. The API might be down.');
      }
      
      return [];
    }
  }

  async getSets(): Promise<PokemonSet[]> {
    // Official API Documentation: https://docs.pokemontcg.io/api-reference/sets/get-sets
    try {
      const params = {
        orderBy: '-releaseDate', // Order by release date, newest first
        pageSize: '250' // Get all sets (there are ~200 sets total)
      };
      const response = await this.fetchApi<PokemonSet>('/sets', params);
      return response.data || [];
    } catch (error) {
      console.error('Error fetching sets:', error);
      return [];
    }
  }

  async getCardById(id: string): Promise<PokemonCard | null> {
    // Official API Documentation: https://docs.pokemontcg.io/api-reference/cards/get-card
    try {
      const response = await this.fetchApi<PokemonCard>(`/cards/${id}`);
      return response.data as unknown as PokemonCard;
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