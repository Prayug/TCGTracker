import { getDb } from '../db/database';
import { pokemonApiClient, PokemonApiCard } from './pokemonApiClient';
import { logger } from '../utils/logger';

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

      db.all(sql, [setId, `%${setId}%`], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const cards: PokemonApiCard[] = rows.map(row => ({
          id: row.id,
          name: row.name,
          number: row.number,
          rarity: row.rarity,
          set: {
            id: row.setId,
            name: row.setName
          },
          images: row.imageSmall || row.imageLarge ? {
            small: row.imageSmall,
            large: row.imageLarge
          } : this.buildDeterministicImageUrls(row.setId, row.cardNumber),
          tcgplayer: row.marketPrice ? {
            prices: {
              normal: { market: row.marketPrice }
            }
          } : undefined
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

  /**
   * Get the correct Pokemon TCG API set code for image URLs
   * Maps database set IDs to their proper API set codes
   */
  private normalizeSetIdForImageUrl(setId: string): string {
    const normalized = setId.toLowerCase();

    // Comprehensive mapping from database set IDs to Pokemon TCG API set codes
    const setMappings: Record<string, string> = {
      // Scarlet & Violet (SV) sets
      'sv01scarletvioletbaseset': 'sv1',
      'sv02paldeaevolved': 'sv2',
      'sv03obsidianflames': 'sv3',
      'sv04paradoxrift': 'sv4',
      'sv05temporalforces': 'sv5',
      'sv06twilightmasquerade': 'sv6',
      'sv07stellarcrown': 'sv7',
      'sv08surgingsparks': 'sv8',
      'sv09journeytogether': 'sv9',
      'sv10destinedrivals': 'sv10',

      // SV Special sets
      'svblackbolt': 'zsv10pt5',
      'svwhiteflare': 'rsv10pt5',
      'svpaldeanfates': 'sv4pt5',
      'svprismaticevolutions': 'sv8pt5',
      'svscarletviolet151': 'sv3pt5',
      'svscarletvioletbaseset': 'sv1', // Alternative name
      'svescarletvioletenergies': 'sve',

      // Sword & Shield (SWSH) sets
      'swsh01swordshieldbaseset': 'swsh1',
      'swsh02rebelclash': 'swsh2',
      'swsh03darknessablaze': 'swsh3',
      'swsh04vividvoltage': 'swsh4',
      'swsh05battlestyles': 'swsh5',
      'swsh06chillingreign': 'swsh6',
      'swsh07evolvingskies': 'swsh7',
      'swsh08fusionstrike': 'swsh8',
      'swsh09brilliantstars': 'swsh9',
      'swsh09brilliantstarstrainergallery': 'swsh9tg',
      'swsh10astralradiance': 'swsh10',
      'swsh10astralradiancetrainergallery': 'swsh10tg',
      'swsh11lostorigin': 'swsh11',
      'swsh11lostorigintrainergallery': 'swsh11tg',
      'swsh12silvertempest': 'swsh12',

      // Sun & Moon (SM) sets
      'smbaseset': 'sm1',
      'smguardiansrising': 'sm2',
      'smburningshadows': 'sm3',
      'smcrimsoninvasion': 'sm4',
      'smultrasonicunleashed': 'sm5',
      'smforbiddenlight': 'sm6',
      'smcelestialstorm': 'sm7',
      'smlostthunder': 'sm8',
      'smteamup': 'sm9',
      'smcosmiceclipse': 'sm10',
      'smunifiedminds': 'sm11',
      'smtrainerkitalolansandslashalolanninetales': 'smkit1',
      'smtrainerkitlycanrocalolanmuk': 'smkit2',

      // XY sets
      'xykalosstarterset': 'xy0',
      'xybreakthrough': 'xy8',
      'xybreakpoint': 'xy9',
      'xyfatescollide': 'xy10',
      'xysteamsiege': 'xy11',
      'xyevolutions': 'xy12',

      // Black & White (BW) sets
      'blackandwhite': 'bw1',
      'bwemergingpowers': 'bw2',
      'bwnoblevictories': 'bw3',
      'bwnextdestinies': 'bw4',
      'bwdarkexplorers': 'bw5',
      'bwdragonsvault': 'bw6',
      'bwboundariescrossed': 'bw7',
      'bwplasmablast': 'bw8',
      'bwplasmastorm': 'bw9',
      'bwtrainerkitbisharpwigglytuff': 'bwkt1',
      'bwtrainerkitexcadrillzoroark': 'bwkt2',

      // Base sets and older
      'baseset': 'base1',
      'basesetshadowless': 'basep',
      'baseset2': 'base2',
      'basejungle': 'base3',
      'basefossil': 'base4',
      'base1stedition': 'base1-1stedition',

      // Promo sets with proper era differentiation
      'svscarletvioletpromocards': 'svp',
      'svpromos': 'svp',
      'smpromos': 'smp',
      'swshpromos': 'swshp',
      'xypromos': 'xyp',
      'bwpromos': 'bwp',
      'basepromos': 'bp',
      'blackandwhitepromos': 'bwp',
      'nintendopromos': 'np',
      'alternateartpromos': 'svap',
      'bestofpromos': 'svbp',
      'pikachuworldcollectionpromos': 'pwc',
      'countdowncalendarpromos': 'cdp',
      'burgerkingpromos': 'bkp',
      'professorprogrampromos': 'ppp',
      'memegaevolutionpromo': 'smp', // SM era
      'me01megaevolution': 'xy01', // XY era
      'me02phantasmalflames': 'sv01', // SV era

      // McDonald's Promos - differentiated by year
      'mcdonaldspromos2024': 'mcd24',
      'mcdonaldspromos2023': 'mcd23',
      'mcdonaldspromos2022': 'mcd22',
      'mcdonaldspromos2021': 'mcd21',
      'mcdonaldspromos2020': 'mcd20',
      'mcdonaldspromos2019': 'mcd19',
      'mcdonaldspromos2018': 'mcd18',
      'mcdonaldspromos2017': 'mcd17',
      'mcdonaldspromos2016': 'mcd16',
      'mcdonaldspromos2015': 'mcd15',
      'mcdonaldspromos2014': 'mcd14',
      'mcdonaldspromos2013': 'mcd13',
      'mcdonaldspromos2012': 'mcd12',
      'mcdonaldspromos2011': 'mcd11',
      'mcdonaldspromos2010': 'mcd10',
      'mcdonaldspromos2009': 'mcd09',
      'mcdonaldspromos2008': 'mcd08',
      'mcdonaldspromos2007': 'mcd07',
      'mcdonaldspromos2006': 'mcd06',
      'mcdonaldspromos2005': 'mcd05',
      'mcdonaldspromos2004': 'mcd04',
      'mcdonaldspromos2003': 'mcd03',
      'mcdonaldspromos2002': 'mcd02',
      'mcdonaldspromos2001': 'mcd01',
      'mcdonaldspromos2000': 'mcd00',

      // Special collections and other sets
      'aquapolis': 'ecard1',
      'skyridge': 'ecard2',
      'exrubyandsapphire': 'ex1',
      'exsandstorm': 'ex2',
      'exdragon': 'ex3',
      'exteamrocketreturns': 'ex4',
      'exdeoxys': 'ex5',
      'excityoflegends': 'ex6',
      'expowerkeepers': 'ex7',
      'arceus': 'pl1',
      'suprememajestic': 'pl2',
      'risingrivals': 'pl3',
      'arceusmajesticdawn': 'pl4',
      'calloflegends': 'col1',
      'triumphant': 'hgss1',
      'unleashed': 'hgss2',
      'undefeated': 'hgss3',
      'triumphantarceus': 'hgss4',
      'celebrations': 'cel25',
      'celebrationsclassiccollection': 'cel25c',
      'battleacademy': 'bap1',
      'battleacademy2022': 'bap2',
      'battleacademy2024': 'bap3',
      'trainerkitnoctowl': 'tk1a',
      'trainerkitpikachu': 'tk2a',
      'ashvsteamrocketdeckkitjpexclusive': 'tk-rocket',
      'blisterexclusives': 'blisex',
      'leaguechampionshipcards': 'lc',
      'worldchampionshipdecks': 'wc',
      'trickortradebooosterbundle2024': 'tto24',
      'pokemongocards': 'pgo',
    };

    if (setMappings[normalized]) {
      return setMappings[normalized];
    }

    // Extract pattern for sets that follow standard numbering
    // Examples: sv06, swsh11, sm3, xy9, bw10
    const patterns = [
      /(sv|swsh|sm|xy|bw)(\d+)/,  // Standard format
      /(zsv)(\d+)(pt\d+)/,        // Special format like zsv10pt5
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        if (match.length === 3) {
          // Standard format: sv06, swsh11, etc. - remove leading zeros
          const series = match[1];
          const number = parseInt(match[2], 10).toString(); // Remove leading zeros
          return `${series}${number}`;
        } else if (match.length === 4) {
          // Special format: zsv10pt5
          return `${match[1]}${match[2]}${match[3]}`;
        }
      }
    }

    // Fallback: try to extract any alphanumeric sequence that looks like a set code
    const fallbackMatch = normalized.match(/([a-z]+\d+)(?:[a-z]+\d+)*/);
    if (fallbackMatch) {
      return fallbackMatch[1];
    }

    // Last resort: return the original but cleaned
    return normalized.replace(/[^a-z0-9]/g, '');
  }

  /**
   * Build deterministic image URLs for fallback when images are missing
   */
  private buildDeterministicImageUrls(setId?: string, cardNumber?: string): { small: string; large: string } | undefined {
    if (!setId || !cardNumber) {
      return undefined;
    }

    const trimmedSet = setId.trim();
    const baseNumber = cardNumber.split('/')[0].trim();

    if (!trimmedSet || !baseNumber) {
      return undefined;
    }

    const sanitizedNumber = baseNumber.replace(/\s+/g, '').toLowerCase();
    const normalizedSet = this.normalizeSetIdForImageUrl(trimmedSet);
    const baseUrl = `https://images.pokemontcg.io/${normalizedSet}/${sanitizedNumber}`;

    return {
      small: `${baseUrl}.png`,
      large: `${baseUrl}.png`, // Use .png for both (no _hires.png as it shows card backs)
    };
  }
}

export const enhancedPackService = new EnhancedPackService();
