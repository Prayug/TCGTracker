import { PokemonCard } from '../types/pokemon';
import { OnePieceCard } from '../types/onepiece';
import { getCardPrice } from '../utils/cardPrice';

export type WishlistPriority = 'high' | 'medium' | 'low';

export interface WishlistItem {
  id: string;
  card: PokemonCard | OnePieceCard;
  addedAt: string;
  targetPrice?: number;
  priority: WishlistPriority;
  notes?: string;
  game: 'pokemon' | 'onepiece';
}

const STORAGE_KEY_POKEMON = 'tcg_card_wishlist_pokemon';
const STORAGE_KEY_ONEPIECE = 'tcg_card_wishlist_onepiece';

function storageKey(game?: 'pokemon' | 'onepiece'): string {
  return game === 'onepiece' ? STORAGE_KEY_ONEPIECE : STORAGE_KEY_POKEMON;
}

function notifyUpdated() {
  window.dispatchEvent(new CustomEvent('tcg:wishlist-updated'));
}

class CardWishlistService {
  getItems(game?: 'pokemon' | 'onepiece'): WishlistItem[] {
    try {
      const stored = localStorage.getItem(storageKey(game));
      return stored ? (JSON.parse(stored) as WishlistItem[]) : [];
    } catch {
      return [];
    }
  }

  private save(items: WishlistItem[], game?: 'pokemon' | 'onepiece') {
    localStorage.setItem(storageKey(game), JSON.stringify(items));
    notifyUpdated();
  }

  isWishlisted(cardId: string, game?: 'pokemon' | 'onepiece'): boolean {
    return this.getItems(game).some((item) => item.card.id === cardId);
  }

  getItem(cardId: string, game?: 'pokemon' | 'onepiece'): WishlistItem | undefined {
    return this.getItems(game).find((item) => item.card.id === cardId);
  }

  add(
    card: PokemonCard | OnePieceCard,
    options: {
      targetPrice?: number;
      priority?: WishlistPriority;
      notes?: string;
      game?: 'pokemon' | 'onepiece';
    } = {}
  ): WishlistItem {
    const game = options.game ?? 'pokemon';
    const items = this.getItems(game);
    const existing = items.find((item) => item.card.id === card.id);
    if (existing) {
      return existing;
    }

    const item: WishlistItem = {
      id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      card,
      addedAt: new Date().toISOString(),
      targetPrice: options.targetPrice,
      priority: options.priority ?? 'medium',
      notes: options.notes,
      game,
    };
    items.push(item);
    this.save(items, game);
    return item;
  }

  update(
    id: string,
    updates: Partial<Pick<WishlistItem, 'targetPrice' | 'priority' | 'notes'>>,
    game?: 'pokemon' | 'onepiece'
  ): void {
    const items = this.getItems(game);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return;
    items[index] = { ...items[index], ...updates };
    this.save(items, game);
  }

  remove(cardId: string, game?: 'pokemon' | 'onepiece'): void {
    const items = this.getItems(game).filter((item) => item.card.id !== cardId);
    this.save(items, game);
  }

  toggle(
    card: PokemonCard | OnePieceCard,
    game: 'pokemon' | 'onepiece' = 'pokemon'
  ): boolean {
    if (this.isWishlisted(card.id, game)) {
      this.remove(card.id, game);
      return false;
    }
    this.add(card, { game });
    return true;
  }

  /** Items whose market price is at or below the buy target. */
  getAtTarget(game?: 'pokemon' | 'onepiece'): WishlistItem[] {
    return this.getItems(game).filter((item) => {
      if (item.targetPrice == null || item.targetPrice <= 0) return false;
      const price = getCardPrice(item.card);
      return price > 0 && price <= item.targetPrice;
    });
  }

  exportCsv(game?: 'pokemon' | 'onepiece'): string {
    const rows = [
      ['Name', 'Set', 'Number', 'Market', 'Target', 'Priority', 'Notes'].join(','),
      ...this.getItems(game).map((item) => {
        const market = getCardPrice(item.card);
        return [
          `"${item.card.name.replace(/"/g, '""')}"`,
          `"${(item.card.set?.name ?? '').replace(/"/g, '""')}"`,
          item.card.number ?? '',
          market.toFixed(2),
          item.targetPrice != null ? item.targetPrice.toFixed(2) : '',
          item.priority,
          `"${(item.notes ?? '').replace(/"/g, '""')}"`,
        ].join(',');
      }),
    ];
    return rows.join('\n');
  }
}

export const cardWishlistService = new CardWishlistService();
