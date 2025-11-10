import { PokemonCard } from '../types/pokemon';

export interface TrackedCard {
  id: string;
  card: PokemonCard;
  addedAt: string;
  initialPrice: number;
  priceHistory: Array<{
    date: string;
    price: number;
  }>;
}

export interface PriceAlert {
  id: string;
  cardId: string;
  cardName: string;
  targetPrice: number;
  alertType: 'above' | 'below';
  isActive: boolean;
  createdAt: string;
}

class PriceTrackingService {
  private TRACKED_CARDS_KEY = 'tcg_tracked_cards';
  private PRICE_ALERTS_KEY = 'tcg_price_alerts';

  // Get all tracked cards
  getTrackedCards(): TrackedCard[] {
    const stored = localStorage.getItem(this.TRACKED_CARDS_KEY);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  // Add card to tracking
  trackCard(card: PokemonCard): void {
    const tracked = this.getTrackedCards();
    
    // Check if already tracking
    if (tracked.some(t => t.id === card.id)) {
      return;
    }

    const initialPrice = card.marketPrice || card.tcgplayer?.prices?.holofoil?.market || 0;
    
    const trackedCard: TrackedCard = {
      id: card.id,
      card,
      addedAt: new Date().toISOString(),
      initialPrice,
      priceHistory: [{
        date: new Date().toISOString(),
        price: initialPrice
      }]
    };

    tracked.push(trackedCard);
    localStorage.setItem(this.TRACKED_CARDS_KEY, JSON.stringify(tracked));
  }

  // Remove card from tracking
  untrackCard(cardId: string): void {
    const tracked = this.getTrackedCards();
    const filtered = tracked.filter(t => t.id !== cardId);
    localStorage.setItem(this.TRACKED_CARDS_KEY, JSON.stringify(filtered));
  }

  // Check if card is tracked
  isTracked(cardId: string): boolean {
    return this.getTrackedCards().some(t => t.id === cardId);
  }

  // Update price for a tracked card
  updateCardPrice(cardId: string, newPrice: number): void {
    const tracked = this.getTrackedCards();
    const card = tracked.find(t => t.id === cardId);
    
    if (card) {
      card.priceHistory.push({
        date: new Date().toISOString(),
        price: newPrice
      });
      
      // Keep only last 30 days of history
      if (card.priceHistory.length > 30) {
        card.priceHistory = card.priceHistory.slice(-30);
      }
      
      localStorage.setItem(this.TRACKED_CARDS_KEY, JSON.stringify(tracked));
    }
  }

  // Get price alerts
  getAlerts(): PriceAlert[] {
    const stored = localStorage.getItem(this.PRICE_ALERTS_KEY);
    if (!stored) return [];
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }

  // Create price alert
  createAlert(cardId: string, cardName: string, targetPrice: number, alertType: 'above' | 'below'): void {
    const alerts = this.getAlerts();
    
    const alert: PriceAlert = {
      id: Date.now().toString(),
      cardId,
      cardName,
      targetPrice,
      alertType,
      isActive: true,
      createdAt: new Date().toISOString()
    };

    alerts.push(alert);
    localStorage.setItem(this.PRICE_ALERTS_KEY, JSON.stringify(alerts));
  }

  // Delete alert
  deleteAlert(alertId: string): void {
    const alerts = this.getAlerts();
    const filtered = alerts.filter(a => a.id !== alertId);
    localStorage.setItem(this.PRICE_ALERTS_KEY, JSON.stringify(filtered));
  }

  // Check alerts for a card
  checkAlerts(cardId: string, currentPrice: number): PriceAlert[] {
    const alerts = this.getAlerts().filter(a => a.cardId === cardId && a.isActive);
    
    return alerts.filter(alert => {
      if (alert.alertType === 'above') {
        return currentPrice >= alert.targetPrice;
      } else {
        return currentPrice <= alert.targetPrice;
      }
    });
  }

  // Get statistics
  getStats(): {
    totalTracked: number;
    totalGainers: number;
    totalLosers: number;
    biggestGainer: { card: PokemonCard; change: number; changePercent: number } | null;
    biggestLoser: { card: PokemonCard; change: number; changePercent: number } | null;
    avgChange: number;
    totalAlerts: number;
  } {
    const tracked = this.getTrackedCards();
    
    if (tracked.length === 0) {
      return {
        totalTracked: 0,
        totalGainers: 0,
        totalLosers: 0,
        biggestGainer: null,
        biggestLoser: null,
        avgChange: 0,
        totalAlerts: this.getAlerts().filter(a => a.isActive).length
      };
    }

    let totalChange = 0;
    let gainers = 0;
    let losers = 0;
    let biggestGainer: { card: PokemonCard; change: number; changePercent: number } | null = null;
    let biggestLoser: { card: PokemonCard; change: number; changePercent: number } | null = null;

    tracked.forEach(t => {
      const currentPrice = t.priceHistory[t.priceHistory.length - 1].price;
      const change = currentPrice - t.initialPrice;
      const changePercent = t.initialPrice > 0 ? (change / t.initialPrice) * 100 : 0;

      totalChange += changePercent;

      if (change > 0) {
        gainers++;
        if (!biggestGainer || changePercent > biggestGainer.changePercent) {
          biggestGainer = { card: t.card, change, changePercent };
        }
      } else if (change < 0) {
        losers++;
        if (!biggestLoser || changePercent < biggestLoser.changePercent) {
          biggestLoser = { card: t.card, change, changePercent };
        }
      }
    });

    return {
      totalTracked: tracked.length,
      totalGainers: gainers,
      totalLosers: losers,
      biggestGainer,
      biggestLoser,
      avgChange: totalChange / tracked.length,
      totalAlerts: this.getAlerts().filter(a => a.isActive).length
    };
  }

  // Get top gainers and losers
  getTopMovers(): {
    gainers: Array<{ card: PokemonCard; change: number; changePercent: number; currentPrice: number }>;
    losers: Array<{ card: PokemonCard; change: number; changePercent: number; currentPrice: number }>;
  } {
    const tracked = this.getTrackedCards();
    
    const movers = tracked.map(t => {
      const currentPrice = t.priceHistory[t.priceHistory.length - 1].price;
      const change = currentPrice - t.initialPrice;
      const changePercent = t.initialPrice > 0 ? (change / t.initialPrice) * 100 : 0;
      
      return {
        card: t.card,
        change,
        changePercent,
        currentPrice
      };
    });

    const gainers = movers
      .filter(m => m.change > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5);

    const losers = movers
      .filter(m => m.change < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 5);

    return { gainers, losers };
  }
}

export const priceTrackingService = new PriceTrackingService();

