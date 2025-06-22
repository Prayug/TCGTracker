import { PricePoint } from '../types/pokemon';

const BACKEND_API_URL = 'http://localhost:3001/api';

interface BackendPriceData {
  productId: number;
  date: string;
  price: number;
  subTypeName: string;
}

interface BackendSearchResult {
  productId: number;
  productName: string;
  groupName: string;
  latestDate: string;
  avgPrice: number;
}

class InvestmentService {
  async getPriceHistory(productId: string): Promise<PricePoint[]> {
    try {
      const response = await fetch(`${BACKEND_API_URL}/prices/${productId}`);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      
      // Transform backend data to PricePoint format
      const priceHistory: PricePoint[] = data.data.map((item: BackendPriceData) => ({
        date: item.date,
        price: item.price
      }));
      
      // Sort by date to ensure chronological order
      priceHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      return priceHistory;
    } catch (error) {
      console.error('Error fetching price history:', error);
      return [];
    }
  }

  async getPriceHistoryByName(cardName: string): Promise<PricePoint[]> {
    try {
      // First, search for cards with similar names
      const searchResponse = await fetch(`${BACKEND_API_URL}/prices/search/${encodeURIComponent(cardName)}`);
      if (!searchResponse.ok) {
        throw new Error(`Search API request failed: ${searchResponse.status} ${searchResponse.statusText}`);
      }
      const searchData = await searchResponse.json();
      const searchResults: BackendSearchResult[] = searchData.data;
      
      if (searchResults.length === 0) {
        return [];
      }
      
      // Use the first (highest priced) match
      const bestMatch = searchResults[0];
      console.log(`Found price match for "${cardName}": ${bestMatch.productName} (${bestMatch.groupName})`);
      
      // Get the full price history for this product
      return this.getPriceHistory(bestMatch.productId.toString());
    } catch (error) {
      console.error('Error fetching price history by name:', error);
      return [];
    }
  }
}

export const investmentService = new InvestmentService(); 