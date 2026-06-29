import { VaultCard, VaultStats, PokemonCard, CardCondition } from '../types/pokemon';
import { syncVaultToServer } from './vaultSyncService';

const VAULT_STORAGE_KEY_POKEMON = 'tcg_vault_cards_pokemon';
const VAULT_STORAGE_KEY_ONEPIECE = 'tcg_vault_cards_onepiece';
// Legacy key for migration
const VAULT_STORAGE_KEY_LEGACY = 'tcg_vault_cards';

function getStorageKey(game?: 'pokemon' | 'onepiece'): string {
  if (game === 'onepiece') return VAULT_STORAGE_KEY_ONEPIECE;
  return VAULT_STORAGE_KEY_POKEMON;
}

class VaultService {
  // Get all vault cards for a specific game
  getVaultCards(game?: 'pokemon' | 'onepiece'): VaultCard[] {
    try {
      const key = getStorageKey(game);
      const stored = localStorage.getItem(key);
      const cards = stored ? JSON.parse(stored) : [];

      // Migrate from legacy key if no cards found for pokemon
      if (cards.length === 0 && (!game || game === 'pokemon')) {
        const legacy = localStorage.getItem(VAULT_STORAGE_KEY_LEGACY);
        if (legacy) {
          const legacyCards = JSON.parse(legacy) as VaultCard[];
          // Tag legacy cards as pokemon
          const migrated = legacyCards.map((c) => ({ ...c, game: 'pokemon' as const }));
          if (migrated.length > 0) {
            this.saveVaultCards(migrated, 'pokemon');
            localStorage.removeItem(VAULT_STORAGE_KEY_LEGACY);
            return migrated;
          }
        }
      }

      return cards;
    } catch (error) {
      console.error('Error loading vault cards:', error);
      return [];
    }
  }

  // Add a card to the vault
  addToVault(
    card: PokemonCard,
    purchasePrice: number,
    quantity: number = 1,
    condition: CardCondition = 'raw',
    notes?: string,
    game: 'pokemon' | 'onepiece' = 'pokemon'
  ): VaultCard {
    const vaultCards = this.getVaultCards(game);

    const vaultCard: VaultCard = {
      id: `vault-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      card,
      purchasePrice,
      purchaseDate: new Date().toISOString(),
      quantity,
      condition,
      notes,
      game,
    };

    vaultCards.push(vaultCard);
    this.saveVaultCards(vaultCards, game);
    void syncVaultToServer(vaultCards);

    console.log(`✅ Added ${quantity}x ${card.name} to vault at $${purchasePrice}`);
    return vaultCard;
  }

  // Update a vault card
  updateVaultCard(id: string, updates: Partial<Omit<VaultCard, 'id' | 'card'>>, game?: 'pokemon' | 'onepiece'): void {
    const vaultCards = this.getVaultCards(game);
    const index = vaultCards.findIndex(vc => vc.id === id);

    if (index !== -1) {
      vaultCards[index] = { ...vaultCards[index], ...updates };
      this.saveVaultCards(vaultCards, game);
      void syncVaultToServer(vaultCards);
      console.log(`✅ Updated vault card ${id}`);
    }
  }

  // Remove a card from the vault
  removeFromVault(id: string, game?: 'pokemon' | 'onepiece'): void {
    const vaultCards = this.getVaultCards(game);
    const filtered = vaultCards.filter(vc => vc.id !== id);
    this.saveVaultCards(filtered, game);
    void syncVaultToServer(filtered);
    console.log(`✅ Removed card from vault: ${id}`);
  }

  // Get vault statistics
  getVaultStats(game?: 'pokemon' | 'onepiece'): VaultStats {
    const vaultCards = this.getVaultCards(game);

    const totalCards = vaultCards.reduce((sum, vc) => sum + vc.quantity, 0);
    const totalValue = vaultCards.reduce((sum, vc) => sum + (vc.purchasePrice * vc.quantity), 0);

    // Calculate current value using market prices
    const currentValue = vaultCards.reduce((sum, vc) => {
      const marketPrice = vc.card.marketPrice || this.extractCardPrice(vc.card);
      return sum + (marketPrice * vc.quantity);
    }, 0);

    const profit = currentValue - totalValue;
    const profitPercentage = totalValue > 0 ? (profit / totalValue) * 100 : 0;

    return {
      totalCards,
      totalValue,
      currentValue,
      profit,
      profitPercentage
    };
  }

  // Check if a card is in the vault
  isInVault(cardId: string, game?: 'pokemon' | 'onepiece'): boolean {
    const vaultCards = this.getVaultCards(game);
    return vaultCards.some(vc => vc.card.id === cardId);
  }

  // Get all vault entries for a specific card
  getVaultEntriesForCard(cardId: string, game?: 'pokemon' | 'onepiece'): VaultCard[] {
    const vaultCards = this.getVaultCards(game);
    return vaultCards.filter(vc => vc.card.id === cardId);
  }

  // Private helper to save vault cards
  private saveVaultCards(vaultCards: VaultCard[], game?: 'pokemon' | 'onepiece'): void {
    try {
      const key = getStorageKey(game);
      localStorage.setItem(key, JSON.stringify(vaultCards));
    } catch (error) {
      console.error('Error saving vault cards:', error);
    }
  }

  // Helper to extract price from card (copied from pokemonApi)
  private extractCardPrice(card: PokemonCard): number {
    // Try TCGPlayer first
    if (card.tcgplayer?.prices) {
      const prices = card.tcgplayer.prices;

      // Priority order for price variants
      const variants = ['normal', 'holofoil', '1stEditionHolofoil', '1stEditionNormal', 'unlimited'];

      for (const variant of variants) {
        if (prices[variant]?.market) {
          return prices[variant].market!;
        }
      }

    }

    return 0;
  }

  // Clear entire vault for a game (useful for testing)
  clearVault(game?: 'pokemon' | 'onepiece'): void {
    const key = getStorageKey(game);
    localStorage.removeItem(key);
    void syncVaultToServer([]);
    console.log('🗑️ Vault cleared');
  }

  // Export vault data as JSON
  exportVault(game?: 'pokemon' | 'onepiece'): string {
    const vaultCards = this.getVaultCards(game);
    return JSON.stringify(vaultCards, null, 2);
  }

  // Import vault data from JSON
  importVault(jsonData: string, game?: 'pokemon' | 'onepiece'): void {
    try {
      const vaultCards = JSON.parse(jsonData) as VaultCard[];
      this.saveVaultCards(vaultCards, game);
      void syncVaultToServer(vaultCards);
      console.log(`✅ Imported ${vaultCards.length} cards to vault`);
    } catch (error) {
      console.error('Error importing vault data:', error);
      throw new Error('Invalid vault data format');
    }
  }
}

export const vaultService = new VaultService();
