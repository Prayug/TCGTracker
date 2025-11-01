import { Pack, PackPull, PokemonCard, PackOpeningHistory } from '../types/pokemon';
import { pokemonApi } from './pokemonApi';

const PACK_HISTORY_KEY = 'tcg_pack_opening_history';

class PackService {
  // Rarity distribution (realistic Pokemon TCG pack odds)
  private rarityWeights = {
    'Common': 60,           // ~60% common
    'Uncommon': 28,         // ~28% uncommon
    'Rare': 8,              // ~8% rare
    'Rare Holo': 2.5,       // ~2.5% holo rare
    'Rare Ultra': 0.8,      // ~0.8% ultra rare
    'Rare Secret': 0.15,    // ~0.15% secret rare
    'Rare Rainbow': 0.05,   // ~0.05% rainbow rare
    'Promo': 0.5            // ~0.5% promo
  };

  // Simulate opening a pack
  async openPack(pack: Pack): Promise<PackPull> {
    console.log(`🎴 Opening ${pack.name}...`);
    
    try {
      // Fetch all cards from this set
      const allCards = await pokemonApi.searchCards(undefined, pack.setId, 250, false); // fetchAll: false for pack opening
      
      if (allCards.length === 0) {
        throw new Error('No cards found in this set');
      }

      // Separate cards by rarity
      const cardsByRarity = this.groupCardsByRarity(allCards);
      
      // Pull cards based on realistic distribution
      const pulledCards: PokemonCard[] = [];
      
      // Guaranteed structure for a typical pack:
      // - 6 commons
      // - 3 uncommons  
      // - 1 rare/holo/ultra (with weighted odds)
      
      // Pull 6 commons
      for (let i = 0; i < 6; i++) {
        const card = this.getRandomCard(cardsByRarity['Common'] || allCards);
        if (card) pulledCards.push(card);
      }
      
      // Pull 3 uncommons
      for (let i = 0; i < 3; i++) {
        const card = this.getRandomCard(cardsByRarity['Uncommon'] || allCards);
        if (card) pulledCards.push(card);
      }
      
      // Pull 1 rare slot (with chance for better cards)
      const rareCard = this.pullRareSlot(cardsByRarity, allCards);
      if (rareCard) pulledCards.push(rareCard);

      // Calculate total value
      const totalValue = pulledCards.reduce((sum, card) => {
        const price = card.marketPrice || pokemonApi.extractCardPrice(card);
        return sum + price;
      }, 0);

      const profit = totalValue - pack.price;

      const packPull: PackPull = {
        pack,
        cards: pulledCards,
        totalValue,
        profit,
        openedAt: new Date().toISOString()
      };

      // Save to history
      this.addToHistory(packPull);

      console.log(`✅ Pulled ${pulledCards.length} cards! Total value: $${totalValue.toFixed(2)}`);
      console.log(`💰 Profit: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`);

      return packPull;
    } catch (error) {
      console.error('Error opening pack:', error);
      throw error;
    }
  }

  // Pull the rare slot with weighted odds
  private pullRareSlot(
    cardsByRarity: Record<string, PokemonCard[]>,
    allCards: PokemonCard[]
  ): PokemonCard | null {
    const rand = Math.random() * 100;
    let cumulative = 0;

    // Check for ultra rare first (lowest odds)
    const rarityOrder = [
      { name: 'Rare Rainbow', cards: cardsByRarity['Rare Rainbow'] || [] },
      { name: 'Rare Secret', cards: cardsByRarity['Rare Secret'] || [] },
      { name: 'Rare Ultra', cards: cardsByRarity['Rare Ultra'] || [] },
      { name: 'Rare Holo', cards: cardsByRarity['Rare Holo'] || [] },
      { name: 'Rare', cards: cardsByRarity['Rare'] || [] }
    ];

    for (const { name, cards } of rarityOrder) {
      const weight = this.rarityWeights[name as keyof typeof this.rarityWeights] || 0;
      cumulative += weight;
      
      if (rand <= cumulative && cards.length > 0) {
        return this.getRandomCard(cards);
      }
    }

    // Fallback to any rare
    return this.getRandomCard(cardsByRarity['Rare'] || allCards);
  }

  // Group cards by rarity
  private groupCardsByRarity(cards: PokemonCard[]): Record<string, PokemonCard[]> {
    const grouped: Record<string, PokemonCard[]> = {};
    
    cards.forEach(card => {
      const rarity = card.rarity || 'Common';
      if (!grouped[rarity]) {
        grouped[rarity] = [];
      }
      grouped[rarity].push(card);
    });

    return grouped;
  }

  // Get random card from array
  private getRandomCard(cards: PokemonCard[]): PokemonCard | null {
    if (cards.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * cards.length);
    return cards[randomIndex];
  }

  // Get pack opening history
  getHistory(): PackOpeningHistory {
    try {
      const stored = localStorage.getItem(PACK_HISTORY_KEY);
      if (!stored) {
        return {
          pulls: [],
          totalSpent: 0,
          totalValue: 0,
          totalProfit: 0,
          packsOpened: 0
        };
      }

      const pulls: PackPull[] = JSON.parse(stored);
      const totalSpent = pulls.reduce((sum, pull) => sum + pull.pack.price, 0);
      const totalValue = pulls.reduce((sum, pull) => sum + pull.totalValue, 0);
      const totalProfit = totalValue - totalSpent;

      return {
        pulls,
        totalSpent,
        totalValue,
        totalProfit,
        packsOpened: pulls.length
      };
    } catch (error) {
      console.error('Error loading pack history:', error);
      return {
        pulls: [],
        totalSpent: 0,
        totalValue: 0,
        totalProfit: 0,
        packsOpened: 0
      };
    }
  }

  // Add pack pull to history
  private addToHistory(packPull: PackPull): void {
    try {
      const history = this.getHistory();
      history.pulls.unshift(packPull); // Add to beginning
      
      // Keep only last 50 pulls
      if (history.pulls.length > 50) {
        history.pulls = history.pulls.slice(0, 50);
      }

      localStorage.setItem(PACK_HISTORY_KEY, JSON.stringify(history.pulls));
    } catch (error) {
      console.error('Error saving pack history:', error);
    }
  }

  // Clear history
  clearHistory(): void {
    localStorage.removeItem(PACK_HISTORY_KEY);
    console.log('🗑️ Pack opening history cleared');
  }

  // Generate packs from Pokemon TCG sets
  async getAvailablePacks(): Promise<Pack[]> {
    try {
      const sets = await pokemonApi.getSets();
      
      // Convert sets to packs (most recent first)
      const packs: Pack[] = sets.slice(0, 20).map(set => ({
        id: set.id,
        name: set.name,
        setId: set.id,
        price: this.estimatePackPrice(set.releaseDate),
        cardsPerPack: 10,
        imageUrl: set.images.logo,
        releaseDate: set.releaseDate,
        description: `${set.total} cards available`
      }));

      return packs;
    } catch (error) {
      console.error('Error fetching packs:', error);
      return [];
    }
  }

  // Estimate pack price based on set age (newer = more expensive)
  private estimatePackPrice(releaseDate: string): number {
    const date = new Date(releaseDate);
    const now = new Date();
    const yearsOld = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);

    // Base prices
    if (yearsOld < 0.5) return 4.99;  // New sets: $4.99
    if (yearsOld < 1) return 5.99;    // Recent: $5.99
    if (yearsOld < 3) return 7.99;    // Older: $7.99
    if (yearsOld < 5) return 12.99;   // Vintage: $12.99
    return 19.99;                     // Classic: $19.99
  }

  // Get stats for a specific set
  async getSetStats(setId: string): Promise<{ total: number; avgPrice: number }> {
    try {
      const cards = await pokemonApi.searchCards(undefined, setId, 250, false); // fetchAll: false for pack opening
      const totalCards = cards.length;
      const avgPrice = cards.reduce((sum, card) => {
        const price = card.marketPrice || pokemonApi.extractCardPrice(card);
        return sum + price;
      }, 0) / totalCards;

      return { total: totalCards, avgPrice };
    } catch (error) {
      return { total: 0, avgPrice: 0 };
    }
  }
}

export const packService = new PackService();

