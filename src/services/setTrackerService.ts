import { PokemonCard, PokemonSet, PricePoint } from '../types/pokemon';
import { toReliableSetPricePoints } from '../utils/setValueHistory';
import { cacheService } from './cacheService';
import { vaultService } from './vaultService';
import { env } from '../config/env';
import {
  buildVaultOwnershipIndex,
  isCardOwned,
  normalizeCardNumber,
  relinkVaultCardsToSetCatalog,
} from '../utils/vaultOwnership';

const BACKEND_BASE_URL = env.apiUrl;

export interface SetTrackerCard extends PokemonCard {
  owned?: boolean;
  hasPriceData?: boolean;
  priceSource?: 'market_sync' | 'tcgplayer_catalog' | null;
  priceDate?: string | null;
  /** Reverse-holo market price when counted toward master set. */
  reverseMarketPrice?: number;
}

export interface SetSummary {
  setId: string;
  setName: string;
  releaseDate: string;
  totalCards: number;
  ownedCount: number;
  wishlistCount: number;
  completionPct: number;
  /** Primary checklist finishes only (one price per catalog card). */
  checklistValue?: number;
  /** Sum of reverse-holo finishes counted toward master set. */
  reverseHoloValue?: number;
  reverseHoloCount?: number;
  /** Checklist + reverse holos (Collectr-style total / master set). */
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

function cardMarketPrice(card: SetTrackerCard): number {
  return typeof card.marketPrice === 'number' && card.marketPrice > 0 ? card.marketPrice : 0;
}

function computeSummaryFromCards(
  set: PokemonSet,
  cards: SetTrackerCard[],
  wishlistIds: Set<string>
): SetSummary {
  let checklistValue = 0;
  let reverseHoloValue = 0;
  let reverseHoloCount = 0;
  let ownedValue = 0;
  let missingValue = 0;
  let ownedCount = 0;
  let pricedCardCount = 0;
  let marketSyncCount = 0;
  let catalogPriceCount = 0;

  for (const card of cards) {
    const price = cardMarketPrice(card);
    const reverse = card.reverseMarketPrice && card.reverseMarketPrice > 0 ? card.reverseMarketPrice : 0;
    if (price > 0) {
      pricedCardCount++;
      if (card.priceSource === 'market_sync') marketSyncCount++;
      else if (card.priceSource === 'tcgplayer_catalog') catalogPriceCount++;
    }
    checklistValue += price;
    if (reverse > 0) {
      reverseHoloValue += reverse;
      reverseHoloCount++;
    }
    if (card.owned) {
      ownedCount++;
      ownedValue += price;
    } else {
      missingValue += price;
    }
  }

  const totalCards = cards.length;
  return {
    setId: set.id,
    setName: set.name,
    releaseDate: set.releaseDate,
    totalCards,
    ownedCount,
    wishlistCount: wishlistIds.size,
    completionPct: totalCards > 0 ? (ownedCount / totalCards) * 100 : 0,
    checklistValue,
    reverseHoloValue,
    reverseHoloCount,
    masterSetValue: checklistValue + reverseHoloValue,
    ownedValue,
    missingValue,
    costToComplete: missingValue,
    pricedCardCount,
    priceCoveragePct: totalCards > 0 ? (pricedCardCount / totalCards) * 100 : 0,
    marketSyncCount,
    catalogPriceCount,
  };
}

class SetTrackerService {
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
    const cacheKey = 'set_tracker_sets_v5';
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
    // Catalog is stable; ownership is applied from local vault (no giant ownedIds query).
    const catalogKey = `set_tracker_cards_v2_${setId}`;
    let set: PokemonSet;
    let cards: SetTrackerCard[];

    const cached = cacheService.get<{ set: PokemonSet; cards: SetTrackerCard[] }>(catalogKey);
    if (cached) {
      set = cached.set;
      cards = cached.cards;
    } else {
      const data = await this.fetchJson<{
        set: PokemonSet;
        data: SetTrackerCard[];
      }>(`/api/cards/sets/${encodeURIComponent(setId)}/cards`);
      set = data.set;
      cards = data.data;
      cacheService.set(catalogKey, { set, cards }, 30 * 60 * 1000);
    }

    // Relink Collectr / slug vault rows onto catalog IDs for this set.
    relinkVaultCardsToSetCatalog(cards, set.id, set.name, 'pokemon');

    const owned = buildVaultOwnershipIndex('pokemon');
    return {
      set,
      cards: cards.map((card) => ({
        ...card,
        owned: isCardOwned(card, owned),
      })),
    };
  }

  async getSetSummary(
    setId: string,
    wishlistIds?: Set<string>
  ): Promise<{ set: PokemonSet; summary: SetSummary }> {
    const wish = wishlistIds ?? new Set<string>();
    const { set, cards } = await this.getSetCards(setId, wish);
    return { set, summary: computeSummaryFromCards(set, cards, wish) };
  }

  async getSetValueHistory(
    setId: string,
    range: ValueHistoryRange = '30d'
  ): Promise<SetValueHistoryPoint[]> {
    const cacheKey = `set_value_history_v5_${setId}_${range}`;
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
    const owned = buildVaultOwnershipIndex('pokemon');
    const matchedNumbers = new Set<string>();
    for (const entry of owned.entries) {
      const card = entry.card;
      if (!card) continue;
      const sameSet =
        card.set?.id === setId ||
        (card.set?.name || '').toLowerCase() === setName.toLowerCase() ||
        (card.set?.id || '').replace(/-/g, ' ').toLowerCase() === setName.toLowerCase();
      if (!sameSet) continue;
      const num = normalizeCardNumber(card.number) || card.id;
      if (num) matchedNumbers.add(num);
    }
    return (matchedNumbers.size / totalCards) * 100;
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
