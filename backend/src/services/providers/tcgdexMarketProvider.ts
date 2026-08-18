import { MarketPriceProvider, MarketPriceSnapshot } from './contracts';
import { logger } from '../../utils/logger';
import { normalizeVariantKey } from '../../utils/normalizeVariantKey';
import { resolveListingPrice } from '../../utils/resolveListingPrice';

interface TcgdexPriceEntry {
  productId?: number;
  marketPrice?: number | null;
  midPrice?: number | null;
  lowPrice?: number | null;
  highPrice?: number | null;
  volume?: number;
}

interface TcgdexCardResponse {
  id: string;
  name: string;
  localId?: string;
  set?: {
    id: string;
    name: string;
  };
  pricing?: {
    tcgplayer?: Record<string, TcgdexPriceEntry & { unit?: string; updated?: string }>;
    cardmarket?: {
      unit?: string;
      avg?: number | null;
      low?: number | null;
      trend?: number | null;
      'avg-holo'?: number | null;
      'low-holo'?: number | null;
      'trend-holo'?: number | null;
      idProduct?: number;
    };
  };
}

/** Rough EUR→USD for Cardmarket snapshots when no TCGPlayer print exists. */
const EUR_TO_USD = 1.08;

export class TcgdexMarketProvider implements MarketPriceProvider {
  readonly timeoutMs = 8000;
  private fetchFailureCount = 0;
  private nextFailureLogAt = 5;
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private readonly circuitThreshold = 8;
  private readonly baseUrl: string;
  private readonly sourceTag: 'tcgdex' | 'tcgdex_ja' | 'cardmarket';

  constructor(locale: 'en' | 'ja' = 'en') {
    this.baseUrl = `https://api.tcgdex.net/v2/${locale}`;
    this.sourceTag = locale === 'ja' ? 'tcgdex_ja' : 'tcgdex';
  }

  get failureCount(): number {
    return this.fetchFailureCount;
  }

  get isCircuitOpen(): boolean {
    return this.circuitOpen;
  }

  resetCircuit(): void {
    this.circuitOpen = false;
    this.consecutiveFailures = 0;
    this.fetchFailureCount = 0;
    this.nextFailureLogAt = 5;
  }

  get localeSource(): string {
    return this.sourceTag;
  }

  private async fetchCard(cardId: string): Promise<TcgdexCardResponse | null> {
    const url = `${this.baseUrl}/cards/${encodeURIComponent(cardId)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`TCGdex card fetch failed (${response.status})`);
    }

    return (await response.json()) as TcgdexCardResponse;
  }

  async getSnapshotForCard(
    cardId: string,
    _cardName?: string,
    _setId?: string,
    _setName?: string
  ): Promise<MarketPriceSnapshot | null> {
    if (this.circuitOpen) {
      return null;
    }

    try {
      const card = await this.fetchCard(cardId);
      this.fetchFailureCount = 0;
      this.consecutiveFailures = 0;
      this.nextFailureLogAt = 25;
      if (!card?.set) {
        return null;
      }

      const points: MarketPriceSnapshot['points'] = [];

      if (card.pricing?.tcgplayer) {
        for (const [rawVariantName, value] of Object.entries(card.pricing.tcgplayer)) {
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            continue;
          }

          const marketPrice = resolveListingPrice({
            market: value.marketPrice,
            mid: value.midPrice,
            low: value.lowPrice,
            high: value.highPrice,
          });
          if (marketPrice <= 0) continue;

          points.push({
            variantKey: normalizeVariantKey(rawVariantName),
            rawVariantName,
            productId: value.productId ?? 0,
            marketPrice,
            lowPrice: value.lowPrice ?? undefined,
            highPrice: value.highPrice ?? undefined,
            volume: value.volume,
          });
        }
      }

      // Cardmarket fallback (common for Japanese prints) — convert EUR→USD.
      if (points.length === 0 && card.pricing?.cardmarket) {
        const cm = card.pricing.cardmarket;
        const marketEur = resolveListingPrice({
          market: cm.trend ?? cm.avg,
          mid: cm.avg,
          low: cm.low,
        });
        if (marketEur > 0) {
          const marketPrice = Math.round(marketEur * EUR_TO_USD * 100) / 100;
          points.push({
            variantKey: 'normal',
            rawVariantName: 'cardmarket',
            productId: cm.idProduct ?? 0,
            marketPrice,
            lowPrice: cm.low != null ? Math.round(cm.low * EUR_TO_USD * 100) / 100 : undefined,
            highPrice: undefined,
          });
        }
        const holoEur = resolveListingPrice({
          market: cm['trend-holo'] ?? cm['avg-holo'],
          mid: cm['avg-holo'],
          low: cm['low-holo'],
        });
        if (holoEur > 0) {
          const marketPrice = Math.round(holoEur * EUR_TO_USD * 100) / 100;
          points.push({
            variantKey: 'holofoil',
            rawVariantName: 'cardmarket-holo',
            productId: cm.idProduct ?? 0,
            marketPrice,
            lowPrice:
              cm['low-holo'] != null
                ? Math.round(cm['low-holo'] * EUR_TO_USD * 100) / 100
                : undefined,
          });
        }
      }

      if (points.length === 0) {
        return null;
      }

      return {
        cardId: card.id,
        cardName: card.name,
        setId: card.set.id,
        setName: card.set.name,
        cardNumber: card.localId,
        points,
      };
    } catch (error) {
      this.fetchFailureCount += 1;
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= this.circuitThreshold) {
        this.circuitOpen = true;
        logger.error('TCGdex circuit open — skipping remaining live fetches', {
          failures: this.fetchFailureCount,
          sampleCardId: cardId,
          locale: this.baseUrl,
          error: (error as Error).message,
        });
      } else if (this.fetchFailureCount >= this.nextFailureLogAt) {
        logger.error('TCGdex market fetch failing repeatedly', {
          failures: this.fetchFailureCount,
          sampleCardId: cardId,
          locale: this.baseUrl,
          error: (error as Error).message,
        });
        this.nextFailureLogAt += 25;
      }
      return null;
    }
  }
}

export const tcgdexMarketProvider = new TcgdexMarketProvider('en');
export const tcgdexJaMarketProvider = new TcgdexMarketProvider('ja');
