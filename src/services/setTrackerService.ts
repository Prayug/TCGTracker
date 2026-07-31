import { PokemonCard, PokemonSet, PricePoint } from '../types/pokemon';
import { toReliableSetPricePoints } from '../utils/setValueHistory';
import { cacheService } from './cacheService';
import { vaultService } from './vaultService';
import { env } from '../config/env';

const BACKEND_BASE_URL = env.apiUrl;

export interface SetTrackerCard extends PokemonCard {
  owned?: boolean;
  hasPriceData?: boolean;
  priceSource?: 'market_sync' | 'tcgplayer_catalog' | null;
  priceDate?: string | null;
}

export interface SetSummary {
  setId: string;
  setName: string;
  releaseDate: string;
  totalCards: number;
  ownedCount: number;
  wishlistCount: number;
  completionPct: number;
  masterSetValue: number;
  ownedValue: number;
  missingValue: number;
  costToComplete: number;
  pricedCardCount: number;
  priceCoveragePct: number;
  marketSyncCount: number;
  catalogPriceCount: number;
}

export interface SetValueHistoryPoint {
  date: string;
  setValue: number;
  cardsPriced: number;
}

export type ValueHistoryRange = '1d' | '7d' | '30d' | '90d' | 'all';

export const VALUE_HISTORY_RANGES: { key: ValueHistoryRange; label: string }[] = [
  { key: '1d', label: '1D' },
  { key: '7d', label: '1W' },
  { key: '30d', label: '1M' },
  { key: '90d', label: '3M' },
  { key: 'all', label: 'All' },
];

class SetTrackerService {
  getOwnedCardIds(): Set<string> {
    const ids = new Set<string>();
    for (const entry of vaultService.getVaultCards()) {
      if (entry.card?.id) ids.add(entry.card.id);
    }
    return ids;
  }

  private ownedIdsParam(): string {
    return [...this.getOwnedCardIds()].join(',');
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`API ${response.status}: ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  async getSets(): Promise<PokemonSet[]> {
    const cacheKey = 'set_tracker_sets_v3';
    const cached = cacheService.get<PokemonSet[]>(cacheKey);
    if (cached) return cached;

    const response = await this.fetchJson<{ data: PokemonSet[] }>('/api/cards/sets');
    const sets = response.data ?? [];
    cacheService.set(cacheKey, sets, 30 * 60 * 1000);
    return sets;
  }

  async getSetCards(setId: string, wishlistIds?: Set<string>): Promise<{
    set: PokemonSet;
    cards: SetTrackerCard[];
  }> {
    const ownedIds = this.getOwnedCardIds();
    const wishlistParam = wishlistIds?.size
      ? `&wishlistIds=${[...wishlistIds].join(',')}`
      : '';
    const data = await this.fetchJson<{
      set: PokemonSet;
      data: SetTrackerCard[];
    }>(
      `/api/cards/sets/${encodeURIComponent(setId)}/cards?ownedIds=${[...ownedIds].join(',')}${wishlistParam}`
    );

    return { set: data.set, cards: data.data };
  }

  async getSetSummary(
    setId: string,
    wishlistIds?: Set<string>
  ): Promise<{ set: PokemonSet; summary: SetSummary }> {
    const ownedParam = this.ownedIdsParam();
    const wishlistParam = wishlistIds?.size
      ? `&wishlistIds=${[...wishlistIds].join(',')}`
      : '';
    return this.fetchJson(`/api/cards/sets/${encodeURIComponent(setId)}/summary?ownedIds=${ownedParam}${wishlistParam}`);
  }

  async getSetValueHistory(
    setId: string,
    range: ValueHistoryRange = '30d'
  ): Promise<SetValueHistoryPoint[]> {
    const cacheKey = `set_value_history_v4_${setId}_${range}`;
    const cached = cacheService.get<SetValueHistoryPoint[]>(cacheKey);
    if (cached) return cached;

    const response = await this.fetchJson<{ data: SetValueHistoryPoint[] }>(
      `/api/cards/sets/${encodeURIComponent(setId)}/value-history?range=${range}`
    );
    const points = response.data ?? [];
    cacheService.set(cacheKey, points, 10 * 60 * 1000);
    return points;
  }

  toPricePoints(history: SetValueHistoryPoint[], totalCatalogCards?: number): PricePoint[] {
    return toReliableSetPricePoints(history, totalCatalogCards);
  }

  /** Completion % for index badges (vault-only, no API per set) */
  getCompletionForSet(setId: string, setName: string, totalCards: number): number {
    if (totalCards <= 0) return 0;
    const owned = vaultService.getVaultCards().filter(
      (v) => v.card.set?.id === setId || v.card.set?.name === setName
    );
    const uniqueOwned = new Set(owned.map((v) => v.card.id)).size;
    return (uniqueOwned / totalCards) * 100;
  }

  exportChecklistCsv(
    setName: string,
    cards: SetTrackerCard[],
    wishlistIds: Set<string>
  ): void {
    const header = 'Number,Name,Rarity,Owned,Wishlist,Market Price';
    const rows = cards.map((c) => {
      const owned = c.owned ? 'yes' : 'no';
      const wish = wishlistIds.has(c.id) ? 'yes' : 'no';
      const price = c.marketPrice ?? 0;
      const escapedName = `"${(c.name || '').replace(/"/g, '""')}"`;
      return `${c.number},${escapedName},${c.rarity || ''},${owned},${wish},${price.toFixed(2)}`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${setName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-checklist.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export const setTrackerService = new SetTrackerService();
