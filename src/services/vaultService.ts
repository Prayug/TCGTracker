import {
  VaultCard,
  VaultStats,
  PokemonCard,
  CardCondition,
  VaultActivityItem,
  VaultActivityAction,
} from '../types/pokemon';
import { syncVaultToServer } from './vaultSyncService';
import { hasUsableCardImage, withResolvedCardImages } from '../utils/tcgPlayerImages';
import {
  effectiveCostBasis,
  holdingMarketValue,
  isAssumedCost,
  resolvePurchasePrice,
} from '../utils/vaultCost';

const VAULT_STORAGE_KEY_POKEMON = 'tcg_vault_cards_pokemon';
const VAULT_STORAGE_KEY_ONEPIECE = 'tcg_vault_cards_onepiece';
const VAULT_STORAGE_KEY_LEGACY = 'tcg_vault_cards';
const ACTIVITY_KEY_POKEMON = 'tcg_vault_activity_pokemon';
const ACTIVITY_KEY_ONEPIECE = 'tcg_vault_activity_onepiece';
const ACTIVITY_CAP = 200;

function getStorageKey(game?: 'pokemon' | 'onepiece'): string {
  if (game === 'onepiece') return VAULT_STORAGE_KEY_ONEPIECE;
  return VAULT_STORAGE_KEY_POKEMON;
}

function getActivityKey(game?: 'pokemon' | 'onepiece'): string {
  if (game === 'onepiece') return ACTIVITY_KEY_ONEPIECE;
  return ACTIVITY_KEY_POKEMON;
}

function hydrateVaultCardImages(cards: VaultCard[]): { cards: VaultCard[]; changed: boolean } {
  let changed = false;
  const next = cards.map((entry) => {
    if (hasUsableCardImage(entry.card?.images)) return entry;
    const card = withResolvedCardImages(entry.card);
    if (card === entry.card) return entry;
    if (!hasUsableCardImage(card.images)) return entry;
    changed = true;
    return { ...entry, card };
  });
  return { cards: next, changed };
}

class VaultService {
  getVaultCards(game?: 'pokemon' | 'onepiece'): VaultCard[] {
    try {
      const key = getStorageKey(game);
      const stored = localStorage.getItem(key);
      const cards = stored ? (JSON.parse(stored) as VaultCard[]) : [];

      if (cards.length === 0 && (!game || game === 'pokemon')) {
        const legacy = localStorage.getItem(VAULT_STORAGE_KEY_LEGACY);
        if (legacy) {
          const legacyCards = JSON.parse(legacy) as VaultCard[];
          const migrated = legacyCards.map((c) => ({ ...c, game: 'pokemon' as const }));
          if (migrated.length > 0) {
            const hydrated = hydrateVaultCardImages(migrated);
            this.saveVaultCards(hydrated.cards, 'pokemon');
            localStorage.removeItem(VAULT_STORAGE_KEY_LEGACY);
            return hydrated.cards;
          }
        }
      }

      const hydrated = hydrateVaultCardImages(cards);
      if (hydrated.changed) {
        this.saveVaultCards(hydrated.cards, game);
      }
      return hydrated.cards;
    } catch (error) {
      console.error('Error loading vault cards:', error);
      return [];
    }
  }

  addToVault(
    card: PokemonCard,
    purchasePrice: number,
    quantity: number = 1,
    condition: CardCondition = 'raw',
    notes?: string,
    game: 'pokemon' | 'onepiece' = 'pokemon'
  ): VaultCard {
    const vaultCards = this.getVaultCards(game);
    const cardWithImages = withResolvedCardImages(card);
    const resolvedPrice = resolvePurchasePrice(cardWithImages, purchasePrice);

    const vaultCard: VaultCard = {
      id: `vault-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      card: cardWithImages,
      purchasePrice: resolvedPrice,
      purchaseDate: new Date().toISOString(),
      quantity,
      condition,
      notes,
      game,
    };

    vaultCards.push(vaultCard);
    this.saveVaultCards(vaultCards, game);
    void syncVaultToServer(vaultCards);
    this.appendActivity(
      {
        action: 'add',
        cardName: cardWithImages.name,
        detail: `${quantity}× @ $${resolvedPrice.toFixed(2)}`,
      },
      game
    );

    return vaultCard;
  }

  updateVaultCard(
    id: string,
    updates: Partial<Omit<VaultCard, 'id' | 'card'>>,
    game?: 'pokemon' | 'onepiece'
  ): void {
    const vaultCards = this.getVaultCards(game);
    const index = vaultCards.findIndex((vc) => vc.id === id);

    if (index !== -1) {
      const prev = vaultCards[index];
      const next = { ...prev, ...updates };
      if (updates.purchasePrice !== undefined) {
        next.purchasePrice = resolvePurchasePrice(prev.card, updates.purchasePrice);
      }
      vaultCards[index] = next;
      this.saveVaultCards(vaultCards, game);
      void syncVaultToServer(vaultCards);
      this.appendActivity(
        {
          action: 'update',
          cardName: prev.card.name,
          detail: 'Edited holding',
        },
        game
      );
    }
  }

  removeFromVault(id: string, game?: 'pokemon' | 'onepiece'): void {
    const vaultCards = this.getVaultCards(game);
    const removed = vaultCards.find((vc) => vc.id === id);
    const filtered = vaultCards.filter((vc) => vc.id !== id);
    this.saveVaultCards(filtered, game);
    void syncVaultToServer(filtered);
    if (removed) {
      this.appendActivity(
        {
          action: 'remove',
          cardName: removed.card.name,
        },
        game
      );
    }
  }

  getVaultStats(game?: 'pokemon' | 'onepiece'): VaultStats {
    const vaultCards = this.getVaultCards(game);

    const totalCards = vaultCards.reduce((sum, vc) => sum + vc.quantity, 0);
    const entryCount = vaultCards.length;
    const uniqueCards = new Set(vaultCards.map((vc) => vc.card.id)).size;
    const assumedCostCount = vaultCards.filter(isAssumedCost).length;

    const totalValue = vaultCards.reduce((sum, vc) => sum + effectiveCostBasis(vc), 0);
    const currentValue = vaultCards.reduce((sum, vc) => sum + holdingMarketValue(vc), 0);

    const profit = currentValue - totalValue;
    const profitPercentage = totalValue > 0 ? (profit / totalValue) * 100 : 0;

    return {
      totalCards,
      totalValue,
      currentValue,
      profit,
      profitPercentage,
      entryCount,
      uniqueCards,
      assumedCostCount,
    };
  }

  isInVault(cardId: string, game?: 'pokemon' | 'onepiece'): boolean {
    const vaultCards = this.getVaultCards(game);
    return vaultCards.some((vc) => vc.card.id === cardId);
  }

  getVaultEntriesForCard(cardId: string, game?: 'pokemon' | 'onepiece'): VaultCard[] {
    const vaultCards = this.getVaultCards(game);
    return vaultCards.filter((vc) => vc.card.id === cardId);
  }

  private saveVaultCards(vaultCards: VaultCard[], game?: 'pokemon' | 'onepiece'): void {
    try {
      const key = getStorageKey(game);
      localStorage.setItem(key, JSON.stringify(vaultCards));
    } catch (error) {
      console.error('Error saving vault cards:', error);
    }
  }

  clearVault(game?: 'pokemon' | 'onepiece'): void {
    const key = getStorageKey(game);
    localStorage.removeItem(key);
    void syncVaultToServer([]);
    this.appendActivity({ action: 'clear', detail: 'Vault cleared' }, game);
  }

  exportVault(game?: 'pokemon' | 'onepiece'): string {
    const vaultCards = this.getVaultCards(game);
    return JSON.stringify(vaultCards, null, 2);
  }

  importVault(jsonData: string, game?: 'pokemon' | 'onepiece'): void {
    try {
      const vaultCards = JSON.parse(jsonData) as VaultCard[];
      const { cards } = hydrateVaultCardImages(vaultCards);
      const normalized = cards.map((entry) => ({
        ...entry,
        purchasePrice: resolvePurchasePrice(entry.card, entry.purchasePrice),
      }));
      this.saveVaultCards(normalized, game);
      void syncVaultToServer(normalized);
      this.appendActivity(
        {
          action: 'import',
          detail: `Imported ${normalized.length} holdings`,
        },
        game
      );
    } catch (error) {
      console.error('Error importing vault data:', error);
      throw new Error('Invalid vault data format');
    }
  }

  getActivity(game?: 'pokemon' | 'onepiece'): VaultActivityItem[] {
    try {
      const raw = localStorage.getItem(getActivityKey(game));
      return raw ? (JSON.parse(raw) as VaultActivityItem[]) : [];
    } catch {
      return [];
    }
  }

  appendActivity(
    partial: { action: VaultActivityAction; cardName?: string; detail?: string },
    game?: 'pokemon' | 'onepiece'
  ): void {
    try {
      const list = this.getActivity(game);
      const item: VaultActivityItem = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action: partial.action,
        cardName: partial.cardName,
        detail: partial.detail,
        at: new Date().toISOString(),
      };
      const next = [item, ...list].slice(0, ACTIVITY_CAP);
      localStorage.setItem(getActivityKey(game), JSON.stringify(next));
    } catch (error) {
      console.error('Error saving vault activity:', error);
    }
  }
}

export const vaultService = new VaultService();
