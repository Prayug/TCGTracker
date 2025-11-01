import { VaultCard, VaultStats, PokemonCard, CardCondition } from '../types/pokemon';

const VAULT_STORAGE_KEY = 'tcg_vault_cards';

class VaultService {
  // Get all vault cards
  getVaultCards(): VaultCard[] {
    try {
      const stored = localStorage.getItem(VAULT_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
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
    notes?: string
  ): VaultCard {
    const vaultCards = this.getVaultCards();
    
    const vaultCard: VaultCard = {
      id: `vault-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      card,
      purchasePrice,
      purchaseDate: new Date().toISOString(),
      quantity,
      condition,
      notes
    };

    vaultCards.push(vaultCard);
    this.saveVaultCards(vaultCards);
    
    console.log(`✅ Added ${quantity}x ${card.name} to vault at $${purchasePrice}`);
    return vaultCard;
  }

  // Update a vault card
  updateVaultCard(id: string, updates: Partial<Omit<VaultCard, 'id' | 'card'>>): void {
    const vaultCards = this.getVaultCards();
    const index = vaultCards.findIndex(vc => vc.id === id);
    
    if (index !== -1) {
      vaultCards[index] = { ...vaultCards[index], ...updates };
      this.saveVaultCards(vaultCards);
      console.log(`✅ Updated vault card ${id}`);
    }
  }

  // Remove a card from the vault
  removeFromVault(id: string): void {
    const vaultCards = this.getVaultCards();
    const filtered = vaultCards.filter(vc => vc.id !== id);
    this.saveVaultCards(filtered);
    console.log(`✅ Removed card from vault: ${id}`);
  }

  // Get vault statistics
  getVaultStats(): VaultStats {
    const vaultCards = this.getVaultCards();
    
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
  isInVault(cardId: string): boolean {
    const vaultCards = this.getVaultCards();
    return vaultCards.some(vc => vc.card.id === cardId);
  }

  // Get all vault entries for a specific card
  getVaultEntriesForCard(cardId: string): VaultCard[] {
    const vaultCards = this.getVaultCards();
    return vaultCards.filter(vc => vc.card.id === cardId);
  }

  // Private helper to save vault cards
  private saveVaultCards(vaultCards: VaultCard[]): void {
    try {
      localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vaultCards));
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
      
      // Fallback to any available price
      for (const priceData of Object.values(prices)) {
        if (priceData.market) return priceData.market;
        if (priceData.mid) return priceData.mid;
        if (priceData.high) return priceData.high;
        if (priceData.low) return priceData.low;
      }
    }

    // Try CardMarket as fallback
    if (card.cardmarket?.prices?.averageSellPrice) {
      return card.cardmarket.prices.averageSellPrice;
    }

    return 0;
  }

  // Clear entire vault (useful for testing)
  clearVault(): void {
    localStorage.removeItem(VAULT_STORAGE_KEY);
    console.log('🗑️ Vault cleared');
  }

  // Export vault data as JSON
  exportVault(): string {
    const vaultCards = this.getVaultCards();
    return JSON.stringify(vaultCards, null, 2);
  }

  // Import vault data from JSON
  importVault(jsonData: string): void {
    try {
      const vaultCards = JSON.parse(jsonData) as VaultCard[];
      this.saveVaultCards(vaultCards);
      console.log(`✅ Imported ${vaultCards.length} cards to vault`);
    } catch (error) {
      console.error('Error importing vault data:', error);
      throw new Error('Invalid vault data format');
    }
  }
}

export const vaultService = new VaultService();

