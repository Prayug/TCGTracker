import { PokemonCard } from '../types/pokemon';
import { OnePieceCard } from '../types/onepiece';
import { getCardPrice } from '../utils/cardPrice';
import { syncLocalListsToServer, type WatchlistSyncItem } from './watchlistSyncService';

export type TrackableCard = PokemonCard | OnePieceCard;

export interface TrackedCard {
  id: string;
  card: TrackableCard;
  addedAt: string;
  initialPrice: number;
  priceHistory: Array<{
    date: string;
    price: number;
  }>;
  game?: 'pokemon' | 'onepiece';
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

type Game = 'pokemon' | 'onepiece';

const TRACKED_POKEMON = 'tcg_tracked_cards_pokemon';
const TRACKED_ONEPIECE = 'tcg_tracked_cards_onepiece';
const TRACKED_LEGACY = 'tcg_tracked_cards';
const ALERTS_POKEMON = 'tcg_price_alerts_pokemon';
const ALERTS_ONEPIECE = 'tcg_price_alerts_onepiece';
const ALERTS_LEGACY = 'tcg_price_alerts';

function trackedKey(game?: Game): string {
  return game === 'onepiece' ? TRACKED_ONEPIECE : TRACKED_POKEMON;
}

function alertsKey(game?: Game): string {
  return game === 'onepiece' ? ALERTS_ONEPIECE : ALERTS_POKEMON;
}

class PriceTrackingService {
  getTrackedCards(game?: Game): TrackedCard[] {
    try {
      const key = trackedKey(game);
      const stored = localStorage.getItem(key);
      if (stored) return JSON.parse(stored) as TrackedCard[];

      if (!game || game === 'pokemon') {
        const legacy = localStorage.getItem(TRACKED_LEGACY);
        if (legacy) {
          const cards = JSON.parse(legacy) as TrackedCard[];
          localStorage.setItem(TRACKED_POKEMON, legacy);
          localStorage.removeItem(TRACKED_LEGACY);
          return cards;
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  private saveTracked(cards: TrackedCard[], game?: Game) {
    localStorage.setItem(trackedKey(game), JSON.stringify(cards));
    void this.syncTrackedToServer();
  }

  /** Push pokemon + onepiece tracked cards to the server watchlist. */
  async syncTrackedToServer(): Promise<void> {
    const items: WatchlistSyncItem[] = [
      ...this.getTrackedCards('pokemon'),
      ...this.getTrackedCards('onepiece'),
    ].map((t) => ({
      id: t.id,
      cardId: t.id,
      cardName: t.card?.name || t.id,
      game: t.game || 'pokemon',
      listType: 'tracked' as const,
      initialPrice: t.initialPrice,
      addedAt: t.addedAt,
      card: t.card,
    }));
    if (items.length === 0) {
      const { syncListTypeWipe } = await import('./watchlistSyncService');
      await syncListTypeWipe('tracked');
      return;
    }
    await syncLocalListsToServer(items);
  }

  /**
   * Replace local tracked lists from remote (no push). Used by login sync when
   * remote wins.
   */
  replaceTrackedFromRemote(items: WatchlistSyncItem[]): void {
    const mapped: TrackedCard[] = items.map((item) => {
      const game: Game = item.game === 'onepiece' ? 'onepiece' : 'pokemon';
      const card = (item.card as TrackableCard | undefined) ?? ({
        id: item.cardId,
        name: item.cardName,
      } as TrackableCard);
      const initialPrice = item.initialPrice ?? getCardPrice(card);
      const addedAt = item.addedAt ?? new Date().toISOString();
      return {
        id: item.cardId || item.id,
        card,
        addedAt,
        initialPrice,
        priceHistory: [{ date: addedAt, price: initialPrice }],
        game,
      };
    });
    const pokemon = mapped.filter((t) => t.game !== 'onepiece');
    const onepiece = mapped.filter((t) => t.game === 'onepiece');
    localStorage.setItem(TRACKED_POKEMON, JSON.stringify(pokemon));
    localStorage.setItem(TRACKED_ONEPIECE, JSON.stringify(onepiece));
    window.dispatchEvent(new CustomEvent('tcg:tracked-updated'));
  }

  trackCard(card: TrackableCard, game: Game = 'pokemon'): void {
    const tracked = this.getTrackedCards(game);
    if (tracked.some((t) => t.id === card.id)) return;

    const initialPrice = getCardPrice(card);
    tracked.push({
      id: card.id,
      card,
      addedAt: new Date().toISOString(),
      initialPrice,
      priceHistory: [{ date: new Date().toISOString(), price: initialPrice }],
      game,
    });
    this.saveTracked(tracked, game);
  }

  untrackCard(cardId: string, game?: Game): void {
    this.saveTracked(
      this.getTrackedCards(game).filter((t) => t.id !== cardId),
      game
    );
  }

  isTracked(cardId: string, game?: Game): boolean {
    return this.getTrackedCards(game).some((t) => t.id === cardId);
  }

  updateCardPrice(cardId: string, newPrice: number, game?: Game): void {
    const tracked = this.getTrackedCards(game);
    const card = tracked.find((t) => t.id === cardId);
    if (!card) return;
    card.priceHistory.push({ date: new Date().toISOString(), price: newPrice });
    if (card.priceHistory.length > 30) {
      card.priceHistory = card.priceHistory.slice(-30);
    }
    this.saveTracked(tracked, game);
  }

  getAlerts(game?: Game): PriceAlert[] {
    try {
      const key = alertsKey(game);
      const stored = localStorage.getItem(key);
      if (stored) return JSON.parse(stored) as PriceAlert[];

      if (!game || game === 'pokemon') {
        const legacy = localStorage.getItem(ALERTS_LEGACY);
        if (legacy) {
          localStorage.setItem(ALERTS_POKEMON, legacy);
          localStorage.removeItem(ALERTS_LEGACY);
          return JSON.parse(legacy) as PriceAlert[];
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  private saveAlerts(alerts: PriceAlert[], game?: Game) {
    localStorage.setItem(alertsKey(game), JSON.stringify(alerts));
  }

  createAlert(
    cardId: string,
    cardName: string,
    targetPrice: number,
    alertType: 'above' | 'below',
    game?: Game
  ): void {
    const alerts = this.getAlerts(game);
    alerts.push({
      id: Date.now().toString(),
      cardId,
      cardName,
      targetPrice,
      alertType,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    this.saveAlerts(alerts, game);
  }

  deleteAlert(alertId: string, game?: Game): void {
    this.saveAlerts(
      this.getAlerts(game).filter((a) => a.id !== alertId),
      game
    );
  }

  setAlertActive(alertId: string, isActive: boolean, game?: Game): void {
    const alerts = this.getAlerts(game);
    const match = alerts.find((a) => a.id === alertId);
    if (match) {
      match.isActive = isActive;
      this.saveAlerts(alerts, game);
    }
  }

  checkAlerts(cardId: string, currentPrice: number, game?: Game): PriceAlert[] {
    return this.getAlerts(game)
      .filter((a) => a.cardId === cardId && a.isActive)
      .filter((alert) =>
        alert.alertType === 'above'
          ? currentPrice >= alert.targetPrice
          : currentPrice <= alert.targetPrice
      );
  }

  getStats(game?: Game) {
    const tracked = this.getTrackedCards(game);
    if (tracked.length === 0) {
      return {
        totalTracked: 0,
        totalGainers: 0,
        totalLosers: 0,
        biggestGainer: null as {
          card: TrackableCard;
          change: number;
          changePercent: number;
        } | null,
        biggestLoser: null as {
          card: TrackableCard;
          change: number;
          changePercent: number;
        } | null,
        avgChange: 0,
        totalAlerts: this.getAlerts(game).filter((a) => a.isActive).length,
      };
    }

    let totalChange = 0;
    let gainers = 0;
    let losers = 0;
    let biggestGainer: {
      card: TrackableCard;
      change: number;
      changePercent: number;
    } | null = null;
    let biggestLoser: {
      card: TrackableCard;
      change: number;
      changePercent: number;
    } | null = null;

    tracked.forEach((t) => {
      const currentPrice = t.priceHistory[t.priceHistory.length - 1]?.price ?? t.initialPrice;
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
      totalAlerts: this.getAlerts(game).filter((a) => a.isActive).length,
    };
  }

  getTopMovers(game?: Game) {
    const tracked = this.getTrackedCards(game);
    const movers = tracked.map((t) => {
      const currentPrice = t.priceHistory[t.priceHistory.length - 1]?.price ?? t.initialPrice;
      const change = currentPrice - t.initialPrice;
      const changePercent = t.initialPrice > 0 ? (change / t.initialPrice) * 100 : 0;
      return { card: t.card, change, changePercent, currentPrice };
    });

    return {
      gainers: movers
        .filter((m) => m.change > 0)
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 5),
      losers: movers
        .filter((m) => m.change < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 5),
    };
  }
}

export const priceTrackingService = new PriceTrackingService();
