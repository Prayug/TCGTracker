import { pokemonApiClient, PokemonApiSet } from './pokemonApiClient';
import { logger } from '../utils/logger';

/**
 * Simple, dynamic set code service using Pokemon TCG API
 * No hard-coded mappings - everything is loaded from the official API
 */
export class SetCodeService {
  private dynamicSetMap: Map<string, string> = new Map();
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  private lastRefresh = 0;
  private readonly REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Initialize by loading all sets from Pokemon TCG API
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.dynamicSetMap.size > 0) {
      logger.info('SetCodeService already initialized with ' + this.dynamicSetMap.size + ' mappings');
      return;
    }

    if (this.initializationPromise) {
      logger.info('SetCodeService initialization already in progress, waiting...');
      return this.initializationPromise;
    }

    logger.info('Starting SetCodeService initialization...');
    this.initializationPromise = this.loadSets();
    await this.initializationPromise;
    this.initializationPromise = null; // Reset for future re-initializations
  }

  /**
   * Load all sets from Pokemon TCG API and build dynamic mapping
   */
  private async loadSets(): Promise<void> {
    try {
      logger.info('Loading Pokemon TCG sets from API...');
      const allSets = await pokemonApiClient.getSets(1000);
      
      if (allSets.length === 0) {
        logger.error('❌ Pokemon TCG API returned 0 sets! This will cause image loading issues.');
        throw new Error('Pokemon TCG API returned no sets');
      }

      this.dynamicSetMap.clear();

      for (const set of allSets) {
        if (!set.id || !set.name) {
          logger.warn(`Skipping invalid set: ${JSON.stringify(set)}`);
          continue;
        }

        // Map by normalized set name (multiple variations)
        const normalizedName = set.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        this.dynamicSetMap.set(normalizedName, set.id);
        
        // Also map without common words
        const nameWithoutCommon = normalizedName
          .replace(/^pokemon/, '')
          .replace(/pokemon$/, '')
          .replace(/^tcg/, '')
          .replace(/tcg$/, '')
          .replace(/^set/, '')
          .replace(/set$/, '');
        if (nameWithoutCommon && nameWithoutCommon !== normalizedName) {
          this.dynamicSetMap.set(nameWithoutCommon, set.id);
        }

        // Map by PTCGO code if available
        if (set.ptcgoCode) {
          this.dynamicSetMap.set(set.ptcgoCode.toLowerCase(), set.id);
          // Also normalize PTCGO code
          this.dynamicSetMap.set(set.ptcgoCode.toLowerCase().replace(/[^a-z0-9]/g, ''), set.id);
        }

        // Map by set ID itself (normalized and as-is)
        const normalizedId = set.id.toLowerCase();
        this.dynamicSetMap.set(normalizedId, set.id);
        this.dynamicSetMap.set(normalizedId.replace(/[^a-z0-9]/g, ''), set.id);

        // Map by series + name combination
        if (set.series) {
          const seriesNormalized = set.series.toLowerCase().replace(/[^a-z0-9]/g, '');
          const nameNormalized = set.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          this.dynamicSetMap.set(seriesNormalized + nameNormalized, set.id);
          this.dynamicSetMap.set(nameNormalized + seriesNormalized, set.id);
        }
      }

      this.initialized = true;
      this.lastRefresh = Date.now();
      logger.info(`✅ Loaded ${allSets.length} sets, created ${this.dynamicSetMap.size} mappings from Pokemon TCG API`);
      
      // Log first 10 mappings for debugging
      const sampleMappings = Array.from(this.dynamicSetMap.entries()).slice(0, 10);
      logger.info(`Sample mappings: ${JSON.stringify(sampleMappings)}`);
    } catch (error) {
      logger.error('❌ CRITICAL: Failed to load sets from Pokemon TCG API', { 
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      // Don't mark as initialized on error - allow retry
      this.initialized = false;
      throw error; // Re-throw to allow caller to handle
    }
  }

  /**
   * Refresh set mappings (called periodically)
   */
  async refreshSetMappings(): Promise<Map<string, string>> {
    await this.loadSets();
    return this.dynamicSetMap;
  }

  /**
   * Normalize a set ID to the correct Pokemon TCG API set code
   * Tries multiple strategies to find the correct mapping
   */
  async normalizeSetIdForImageUrl(setId: string, setName?: string): Promise<string | null> {
    // Ensure service is initialized
    await this.initialize();

    if (!setId) {
      logger.warn('normalizeSetIdForImageUrl called with empty setId');
      return null;
    }

    if (this.dynamicSetMap.size === 0) {
      logger.error('❌ dynamicSetMap is empty! Cannot normalize set IDs. Images will not load.');
      return null;
    }

    // Strategy 1: Try normalized setId directly
    const normalizedId = setId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const directMatch = this.dynamicSetMap.get(normalizedId);
    if (directMatch) {
      logger.debug(`✅ Direct match for ${setId} -> ${directMatch}`);
      return directMatch;
    }

    // Strategy 2: Try setName if provided
    if (setName) {
      const normalizedName = setName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const nameMatch = this.dynamicSetMap.get(normalizedName);
      if (nameMatch) {
        logger.debug(`✅ Name match for ${setName} -> ${nameMatch}`);
        return nameMatch;
      }
    }

    // Strategy 3: Try partial matches - check if any key contains the setId or vice versa
    for (const [key, apiSetId] of this.dynamicSetMap.entries()) {
      if (key.length >= 3 && normalizedId.length >= 3) {
        if (key.includes(normalizedId) || normalizedId.includes(key)) {
          logger.debug(`✅ Partial match for ${setId} (${normalizedId} matches ${key}) -> ${apiSetId}`);
          return apiSetId;
        }
      }
    }

    // Strategy 4: Try with common variations (remove common prefixes/suffixes)
    const variations = [
      normalizedId.replace(/^set/, '').replace(/set$/, ''),
      normalizedId.replace(/^pokemon/, '').replace(/pokemon$/, ''),
      normalizedId.replace(/^tcg/, '').replace(/tcg$/, ''),
    ];
    
    for (const variation of variations) {
      if (variation && variation !== normalizedId) {
        const match = this.dynamicSetMap.get(variation);
        if (match) {
          logger.debug(`✅ Variation match for ${setId} -> ${match}`);
          return match;
        }
      }
    }

    logger.warn(`❌ Could not normalize set ID: "${setId}"${setName ? ` (setName: "${setName}")` : ''}. Tried ${this.dynamicSetMap.size} mappings.`);
    return null;
  }

  /**
   * Get API set code (alias for normalizeSetIdForImageUrl for compatibility)
   */
  async getApiSetCode(databaseSetId: string): Promise<string | null> {
    return this.normalizeSetIdForImageUrl(databaseSetId);
  }

  /**
   * Normalize set ID (alias for compatibility)
   */
  async normalizeSetId(input: string): Promise<string | null> {
    return this.normalizeSetIdForImageUrl(input);
  }

  /**
   * Build deterministic image URLs using normalized set ID
   */
  async buildDeterministicImageUrls(
    setId?: string | null,
    cardNumber?: string | null,
    setName?: string | null
  ): Promise<{ small: string; large: string } | null> {
    if (!setId || !cardNumber) {
      if (!setId) logger.debug('buildDeterministicImageUrls: missing setId');
      if (!cardNumber) logger.debug('buildDeterministicImageUrls: missing cardNumber');
      return null;
    }

    const normalizedSet = await this.normalizeSetIdForImageUrl(setId, setName || undefined);
    if (!normalizedSet) {
      logger.warn(`Could not normalize set ID for image URL: "${setId}"${setName ? ` (setName: "${setName}")` : ''}`);
      return null;
    }

    // Normalize card number: extract first part and remove leading zeros from numeric card numbers
    // Format: https://images.pokemontcg.io/{setId}/{cardNumber}.png
    const baseNumber = cardNumber.split('/')[0].trim();
    if (!baseNumber) {
      logger.warn(`Invalid card number format: "${cardNumber}"`);
      return null;
    }

    // Remove leading zeros from purely numeric card numbers
    // Some sets (like ex13) don't use leading zeros, so "026" should become "26"
    // But keep letters/special chars as-is (e.g., "001a" stays "001a")
    let normalizedCardNumber = baseNumber;
    if (/^\d+$/.test(baseNumber)) {
      // Purely numeric - remove leading zeros by converting to int and back
      normalizedCardNumber = parseInt(baseNumber, 10).toString();
    }

    const imageUrl = `https://images.pokemontcg.io/${normalizedSet}/${normalizedCardNumber}.png`;
    logger.debug(`Built deterministic image URL: ${imageUrl} (from setId: ${setId}, cardNumber: ${cardNumber} -> normalized: ${normalizedCardNumber})`);
    
    return {
      small: imageUrl,
      large: imageUrl, // Use same URL for both
    };
  }

  /**
   * Get statistics about the set mappings
   */
  getSetMappingStats() {
    return {
      databaseMappings: 0, // No longer using database
      cachedMappings: this.dynamicSetMap.size,
      lastRefreshed: this.lastRefresh,
      cacheTtl: this.REFRESH_INTERVAL,
    };
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Auto-refresh if cache is stale
   */
  async ensureFresh(): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefresh > this.REFRESH_INTERVAL) {
      logger.info('Set mappings cache expired, refreshing...');
      await this.refreshSetMappings();
    }
  }
}

export const setCodeService = new SetCodeService();

// Auto-refresh every 24 hours
setInterval(() => {
  setCodeService.ensureFresh().catch((error) => {
    logger.error('Failed to auto-refresh set mappings', { error: (error as Error).message });
  });
}, 24 * 60 * 60 * 1000);
