import { getDb } from '../db/database';
import { pokemonApiClient, PokemonApiCard } from './pokemonApiClient';
import { logger } from '../utils/logger';
import { setCodeService } from './setCodeService';

export interface PackCard {
  id: string;
  name: string;
  number?: string;
  rarity?: string;
  set: {
    id: string;
    name: string;
  };
  images?: {
    small?: string;
    large?: string;
  };
  marketPrice?: number;
  source: 'pokemon_api' | 'local_db';
}

export interface PackResult {
  cards: PackCard[];
  totalValue: number;
  profit: number;
  packPrice: number;
}

export interface PackConfiguration {
  name: string;
  price: number;
  guaranteedCards: number;
  bonusCards?: number;
  rarityDistribution: {
    common: number;
    uncommon: number;
    rare: number;
    rareHolo: number;
    rareUltra: number;
    rareSecret: number;
    rareRainbow: number;
    promo: number;
  };
}

/**
 * Enhanced pack service that combines Pokemon TCG API with local database
 * for more reliable and consistent pack opening
 */
export class EnhancedPackService {
  private readonly defaultPackConfig: PackConfiguration = {
    name: 'Standard Pack',
    price: 4.99,
    guaranteedCards: 10,
    rarityDistribution: {
      common: 60,
      uncommon: 28,
      rare: 8,
      rareHolo: 2.5,
      rareUltra: 0.8,
      rareSecret: 0.15,
      rareRainbow: 0.05,
      promo: 0.5
    }
  };

  /**
   * Open a pack using enhanced logic with fallback to local database
   */
  async openPack(setId: string, config: Partial<PackConfiguration> = {}): Promise<PackResult> {
    const packConfig = { ...this.defaultPackConfig, ...config };
    logger.info(`Opening enhanced pack for set ${setId} with config: ${packConfig.name}`);

    try {
      // Try to get cards from Pokemon API first
      let apiCards = await pokemonApiClient.getCardsFromSet(setId, 500);

      // If API fails or returns no cards, fall back to local database
      if (apiCards.length === 0) {
        logger.warn(`No cards from Pokemon API for set ${setId}, using local database`);
        apiCards = await this.getCardsFromLocalDb(setId);
      }

      if (apiCards.length === 0) {
        throw new Error(`No cards available for set ${setId}`);
      }

      // Group cards by rarity
      const cardsByRarity = this.groupCardsByRarity(apiCards);

      // Generate pack contents
      const packCards = await this.generatePackContents(cardsByRarity, packConfig);

      // Calculate pricing
      const totalValue = packCards.reduce((sum, card) => sum + (card.marketPrice || 0), 0);
      const profit = totalValue - packConfig.price;

      const result: PackResult = {
        cards: packCards,
        totalValue,
        profit,
        packPrice: packConfig.price
      };

      logger.info(`Pack opened: ${packCards.length} cards, value $${totalValue.toFixed(2)}, profit $${profit.toFixed(2)}`);
      return result;

    } catch (error) {
      logger.error('Error opening enhanced pack:', error);
      throw error;
    }
  }

  /**
   * Get cards from local database as fallback
   */
  private async getCardsFromLocalDb(setId: string): Promise<PokemonApiCard[]> {
    const db = getDb();

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          cm.cardId as id,
          cm.cardName as name,
          cm.cardNumber as number,
          cm.rarity,
          cm.setId,
          cm.setName,
          ph.marketPrice,
          cm.imageSmall,
          cm.imageLarge
        FROM card_mappings cm
        LEFT JOIN (
          SELECT uniqueIdentifier, marketPrice, date
          FROM price_history
          WHERE (uniqueIdentifier, date) IN (
            SELECT uniqueIdentifier, MAX(date)
            FROM price_history
            GROUP BY uniqueIdentifier
          )
        ) ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
        WHERE cm.setId = ? OR cm.setName LIKE ?
        ORDER BY cm.cardNumber ASC
      `;

      db.all(sql, [setId, `%${setId}%`], async (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const cards: PokemonApiCard[] = await Promise.all(rows.map(async (row) => {
          const storedImages = row.imageSmall || row.imageLarge ? {
            small: row.imageSmall,
            large: row.imageLarge
          } : null;
          const deterministicImages = storedImages
            ? null
            : await setCodeService.buildDeterministicImageUrls(row.setId, row.cardNumber);

          return {
            id: row.id,
            name: row.name,
            number: row.number,
            rarity: row.rarity,
            set: {
              id: row.setId,
              name: row.setName
            },
            images: storedImages || deterministicImages || undefined,
            tcgplayer: row.marketPrice ? {
              prices: {
                normal: { market: row.marketPrice }
              }
            } : undefined
          };
        }));

        resolve(cards);
      });
    });
  }

  /**
   * Group cards by their rarity
   */
  private groupCardsByRarity(cards: PokemonApiCard[]): Record<string, PokemonApiCard[]> {
    const grouped: Record<string, PokemonApiCard[]> = {};

    cards.forEach(card => {
      const rarity = this.normalizeRarity(card.rarity || 'Common');
      if (!grouped[rarity]) {
        grouped[rarity] = [];
      }
      grouped[rarity].push(card);
    });

    return grouped;
  }

  /**
   * Normalize rarity names to standard format
   */
  private normalizeRarity(rarity: string): string {
    const rarityMap: Record<string, string> = {
      'Common': 'Common',
      'Uncommon': 'Uncommon',
      'Rare': 'Rare',
      'Rare Holo': 'Rare Holo',
      'Rare Ultra': 'Rare Ultra',
      'Rare Secret': 'Rare Secret',
      'Rare Rainbow': 'Rare Rainbow',
      'Promo': 'Promo',
      'Amazing Rare': 'Rare Ultra',
      '1st Edition': 'Rare Holo',
      // Add more mappings as needed
    };

    return rarityMap[rarity] || rarity;
  }

  /**
   * Generate pack contents based on rarity distribution
   */
  private async generatePackContents(
    cardsByRarity: Record<string, PokemonApiCard[]>,
    config: PackConfiguration
  ): Promise<PackCard[]> {
    const packCards: PackCard[] = [];

    // Generate guaranteed cards based on distribution
    const rarityKeys = Object.keys(config.rarityDistribution);
    const totalWeight = Object.values(config.rarityDistribution).reduce((sum, weight) => sum + weight, 0);

    for (let i = 0; i < config.guaranteedCards; i++) {
      const selectedRarity = this.selectRarityByWeight(config.rarityDistribution, totalWeight);
      const cardsForRarity = cardsByRarity[selectedRarity] || cardsByRarity['Common'] || [];

      if (cardsForRarity.length > 0) {
        const randomCard = cardsForRarity[Math.floor(Math.random() * cardsForRarity.length)];
        packCards.push(this.convertToPackCard(randomCard));
      }
    }

    // Add bonus cards if configured
    if (config.bonusCards) {
      for (let i = 0; i < config.bonusCards; i++) {
        // Bonus cards are typically commons/uncommons
        const bonusRarities = ['Common', 'Uncommon'];
        const selectedRarity = bonusRarities[Math.floor(Math.random() * bonusRarities.length)];
        const cardsForRarity = cardsByRarity[selectedRarity] || [];

        if (cardsForRarity.length > 0) {
          const randomCard = cardsForRarity[Math.floor(Math.random() * cardsForRarity.length)];
          packCards.push(this.convertToPackCard(randomCard));
        }
      }
    }

    return packCards;
  }

  /**
   * Select rarity based on weighted distribution
   */
  private selectRarityByWeight(distribution: Record<string, number>, totalWeight: number): string {
    const rand = Math.random() * totalWeight;
    let cumulative = 0;

    for (const [rarity, weight] of Object.entries(distribution)) {
      cumulative += weight;
      if (rand <= cumulative) {
        return rarity;
      }
    }

    return 'Common'; // Fallback
  }

  /**
   * Convert PokemonApiCard to PackCard format
   */
  private convertToPackCard(card: PokemonApiCard): PackCard {
    return {
      id: card.id,
      name: card.name,
      number: card.number,
      rarity: card.rarity,
      set: {
        id: card.set.id,
        name: card.set.name
      },
      images: card.images,
      marketPrice: this.extractCardPrice(card),
      source: 'pokemon_api'
    };
  }

  /**
   * Extract price from card data
   */
  private extractCardPrice(card: PokemonApiCard): number {
    if (card.tcgplayer?.prices) {
      const prices = card.tcgplayer.prices;

      // Priority order for price variants
      const variants = ['normal', 'holofoil', 'reverseHolofoil', '1stEdition', 'unlimited'];

      for (const variant of variants) {
        if (prices[variant]?.market) {
          return prices[variant].market!;
        }
        if (prices[variant]?.mid) {
          return prices[variant].mid!;
        }
      }

      // Fallback to any available price
      for (const priceData of Object.values(prices)) {
        if (typeof priceData === 'object' && priceData !== null) {
          if ('market' in priceData && priceData.market) return priceData.market;
          if ('mid' in priceData && priceData.mid) return priceData.mid;
        }
      }
    }

    return 0;
  }

  /**
   * Get available sets for pack opening
   */
  async getAvailableSets(): Promise<Array<{ id: string; name: string; totalCards: number }>> {
    try {
      // Try Pokemon API first
      const apiSets = await pokemonApiClient.getSets(50);

      if (apiSets.length > 0) {
        return apiSets
          .filter(set => set.id && set.name)
          .map(set => ({
            id: set.id,
            name: set.name,
            totalCards: 0 // API doesn't provide this directly
          }));
      }
    } catch (error) {
      logger.warn('Pokemon API sets failed, using local database', { error: (error as Error).message });
    }

    // Fallback to local database
    const db = getDb();

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT setId as id, setName as name, COUNT(*) as totalCards
        FROM card_mappings
        WHERE setId IS NOT NULL AND setName IS NOT NULL
        GROUP BY setId, setName
        ORDER BY setName ASC
        LIMIT 50
      `;

      db.all(sql, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(rows.map(row => ({
          id: row.id,
          name: row.name,
          totalCards: row.totalCards
        })));
      });
    });
  }

}

export const enhancedPackService = new EnhancedPackService();
