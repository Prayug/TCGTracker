import { MarketPriceProvider, MarketPriceSnapshot } from './contracts';
import { logger } from '../../utils/logger';

const TCGDEX_BASE_URL = 'https://api.tcgdex.net/v2/en';

interface TcgdexPriceEntry {
  productId?: number;
  marketPrice?: number;
  lowPrice?: number;
  highPrice?: number;
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
  };
}

const normalizeVariantKey = (raw: string): string => {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleaned) return 'normal';
  if (cleaned.includes('firstedition')) return '1stedition';
  if (cleaned.includes('reverse')) return 'reverseholofoil';
  if (cleaned.includes('holo')) return 'holofoil';
  if (cleaned.includes('normal')) return 'normal';
  return cleaned;
};

export class TcgdexMarketProvider implements MarketPriceProvider {
  readonly timeoutMs = 8000;
  private fetchFailureCount = 0;
  private nextFailureLogAt = 5;

  get failureCount(): number {
    return this.fetchFailureCount;
  }

  private async fetchCard(cardId: string): Promise<TcgdexCardResponse | null> {
    const url = `${TCGDEX_BASE_URL}/cards/${encodeURIComponent(cardId)}`;
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

  async getSnapshotForCard(cardId: string): Promise<MarketPriceSnapshot | null> {
    try {
      const card = await this.fetchCard(cardId);
      this.fetchFailureCount = 0;
      this.nextFailureLogAt = 25;
      if (!card?.pricing?.tcgplayer || !card.set) {
        return null;
      }

      const points = Object.entries(card.pricing.tcgplayer)
        .map(([rawVariantName, value]) => {
          const marketPrice = value.marketPrice ?? 0;
          if (marketPrice <= 0) {
            return null;
          }

          return {
            variantKey: normalizeVariantKey(rawVariantName),
            rawVariantName,
            productId: value.productId ?? 0,
            marketPrice,
            lowPrice: value.lowPrice,
            highPrice: value.highPrice,
            volume: value.volume,
          };
        })
        .filter((point): point is NonNullable<typeof point> => Boolean(point));

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
      if (this.fetchFailureCount >= this.nextFailureLogAt) {
        logger.error('TCGdex market fetch failing repeatedly', {
          failures: this.fetchFailureCount,
          sampleCardId: cardId,
          error: (error as Error).message,
        });
        this.nextFailureLogAt += 25;
      }
      return null;
    }
  }
}

export const tcgdexMarketProvider = new TcgdexMarketProvider();
