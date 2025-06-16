import { PokemonCard, PokemonSet, ApiResponse } from '../types/pokemon';
import { investmentService } from './investmentService';

const API_BASE_URL = 'https://api.pokemontcg.io/v2';

class PokemonApiService {
  private async fetchApi<T>(endpoint: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    const url = new URL(`${API_BASE_URL}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.append(key, value);
      });
    }

    try {
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Pokemon API Error:', error);
      throw error;
    }
  }

  async searchCards(query?: string, setId?: string, pageSize: number = 250): Promise<PokemonCard[]> {
    const params: Record<string, string> = {
      pageSize: pageSize.toString()
    };

    const queryParts: string[] = [];
    
    if (query && query.trim()) {
      queryParts.push(`name:"*${query.trim()}*"`);
    }
    
    if (setId) {
      queryParts.push(`set.id:${setId}`);
    }

    if (queryParts.length > 0) {
      params.q = queryParts.join(' ');
    }

    try {
      const response = await this.fetchApi<PokemonCard>('/cards', params);
      const cards = response.data || [];
      
      // Enhance cards with investment data
      const enhancedCards = await Promise.all(
        cards.map(async (card) => {
          try {
            const currentPrice = this.extractCardPrice(card);
            if (currentPrice > 0) {
              const investmentData = await investmentService.getCardInvestmentData(
                card.name,
                card.set.name,
                currentPrice
              );
              return { ...card, investmentData };
            }
          } catch (error) {
            console.error(`Error getting investment data for ${card.name}:`, error);
          }
          return card;
        })
      );
      
      return enhancedCards;
    } catch (error) {
      console.error('Error searching cards:', error);
      return [];
    }
  }

  async getSets(): Promise<PokemonSet[]> {
    try {
      const response = await this.fetchApi<PokemonSet>('/sets');
      return response.data || [];
    } catch (error) {
      console.error('Error fetching sets:', error);
      return [];
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