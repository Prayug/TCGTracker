import axios from 'axios';
import { PricePoint, RealData } from '../types/pokemon';
import { buildApiUrl } from '../config/env';

class RealDataService {
  private backendApi = buildApiUrl('/api');

  async fetchRealData(cardName: string, setName: string, cardNumber: string, cardId?: string): Promise<RealData | null> {
    try {
      const backendPriceHistory = await this.fetchBackendPriceHistory(cardName, setName, cardNumber, cardId);

      return {
        psaData: null,
        priceHistory: backendPriceHistory,
      };
    } catch (error) {
      console.error(`Error processing ${cardName}:`, (error as Error).message);
      return null;
    }
  }

  private async fetchBackendPriceHistory(
    cardName: string,
    setName: string,
    cardNumber: string,
    cardId?: string
  ): Promise<PricePoint[]> {
    try {
      const response = await axios.get(`${this.backendApi}/prices/match`, {
        params: { cardName, setName, cardNumber },
      });

      let priceHistory: PricePoint[] = [];

      if (response.data?.priceHistory?.length > 0) {
        priceHistory = response.data.priceHistory
          .map((item: { date: string; marketPrice?: number; price?: number; volume?: number }) => ({
            date: item.date,
            price: item.marketPrice || item.price || 0,
            volume: item.volume || 1,
          }))
          .filter((item: PricePoint) => item.price > 0);
      }

      if (priceHistory.length === 0 && cardId) {
        try {
          const rollingResponse = await axios.get(`${this.backendApi}/prices/rolling/${cardId}`);

          if (rollingResponse.data?.data?.length > 0) {
            priceHistory = rollingResponse.data.data
              .map((item: { date: string; marketPrice?: number; avg30?: number; avg7?: number; avg1?: number }) => ({
                date: item.date,
                price: item.marketPrice || item.avg30 || item.avg7 || item.avg1 || 0,
                volume: 1,
              }))
              .filter((item: PricePoint) => item.price > 0);
          }
        } catch {
          /* rolling averages not available */
        }
      }

      priceHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return priceHistory;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return [];
      }
      console.error('Error fetching backend price history:', error);
      return [];
    }
  }

  async getMarketSnapshots(days: number = 30) {
    try {
      const response = await axios.get(`${this.backendApi}/prices/snapshots/daily?days=${days}`);
      return response.data?.data || [];
    } catch (error) {
      console.error('Error fetching market snapshots:', error);
      return [];
    }
  }

  async createPriceAlert(cardId: string, productId: number, targetPrice: number, alertType: string) {
    try {
      const response = await axios.post(`${this.backendApi}/prices/alerts`, {
        cardId,
        productId,
        targetPrice,
        alertType,
        threshold: 0,
      });
      return response.data;
    } catch (error) {
      console.error('Error creating price alert:', error);
      return null;
    }
  }

  async getLatestPrice(cardName: string, setName: string, cardNumber: string): Promise<number> {
    const nameVariations = [
      cardName,
      cardName.replace(/-/g, ' '),
      cardName.replace(/-/g, ''),
    ];

    for (const nameVariation of nameVariations) {
      try {
        const response = await axios.get(`${this.backendApi}/prices/match`, {
          params: { cardName: nameVariation, setName, cardNumber },
        });

        if (response.data?.priceHistory?.length > 0) {
          const latestPrice = response.data.priceHistory
            .map((item: { date: string; marketPrice?: number; price?: number }) => ({
              date: item.date,
              price: item.marketPrice || item.price || 0,
            }))
            .filter((item: { price: number }) => item.price > 0)
            .sort((a: { date: string }, b: { date: string }) =>
              new Date(b.date).getTime() - new Date(a.date).getTime()
            )[0];

          if (latestPrice) {
            return latestPrice.price;
          }
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          continue;
        }
        if (import.meta.env.DEV) {
          console.error('Error fetching latest price:', error);
        }
      }
    }

    return 0;
  }
}

export const realDataService = new RealDataService();
