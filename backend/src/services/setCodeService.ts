import { pokemonApiClient, PokemonApiSet } from './pokemonApiClient';
import { logger } from '../utils/logger';

interface SetCodeMapping {
  databaseId: string;
  apiSetCode: string;
  setName: string;
  series: string;
  releaseDate: string;
}

/**
 * Service for managing Pokemon TCG set codes and mappings
 * Eliminates the need for manual mapping by using actual API data
 */
export class SetCodeService {
  private setCodeMap: Map<string, PokemonApiSet> = new Map();
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize the service by loading all set codes from Pokemon TCG API
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.loadSetCodes();
    await this.initializationPromise;
  }

  /**
   * Load all set codes from Pokemon TCG API
   */
  private async loadSetCodes(): Promise<void> {
    try {
      logger.info('Loading Pokemon TCG set codes...');
      this.setCodeMap = await pokemonApiClient.getSetCodeMap();
      this.initialized = true;
      logger.info(`Successfully loaded ${this.setCodeMap.size} set codes`);
    } catch (error) {
      logger.error('Failed to load set codes from API', { error: (error as Error).message });
      // Continue with empty map - fallback will be used
      this.setCodeMap = new Map();
      this.initialized = true;
    }
  }

  /**
   * Get the correct Pokemon TCG API set code for a database set ID
   * This replaces the manual mapping with API-driven lookup
   */
  async getApiSetCode(databaseSetId: string): Promise<string | null> {
    await this.initialize();

    if (!databaseSetId) return null;

    const normalizedDbId = databaseSetId.toLowerCase();

    // Direct lookup by exact match
    if (this.setCodeMap.has(normalizedDbId)) {
      const set = this.setCodeMap.get(normalizedDbId)!;
      logger.debug(`Found exact match for ${databaseSetId}: ${set.id}`);
      return set.id;
    }

    // Try fuzzy matching based on patterns
    const apiCode = this.findBestMatch(normalizedDbId);
    if (apiCode) {
      logger.debug(`Found fuzzy match for ${databaseSetId}: ${apiCode}`);
      return apiCode;
    }

    // Fallback to pattern-based extraction
    const fallbackCode = this.extractSetCodeFromPattern(normalizedDbId);
    if (fallbackCode) {
      logger.debug(`Using pattern fallback for ${databaseSetId}: ${fallbackCode}`);
      return fallbackCode;
    }

    logger.warn(`Could not find API set code for database ID: ${databaseSetId}`);
    return null;
  }

  /**
   * Find the best matching API set code using various strategies
   */
  private findBestMatch(normalizedDbId: string): string | null {
    // Strategy 1: Remove common suffixes and try again
    const suffixes = ['baseset', 'promocards', 'promos', 'trainerkit'];
    for (const suffix of suffixes) {
      if (normalizedDbId.endsWith(suffix)) {
        const withoutSuffix = normalizedDbId.replace(new RegExp(`${suffix}$`), '');
        if (this.setCodeMap.has(withoutSuffix)) {
          return this.setCodeMap.get(withoutSuffix)!.id;
        }
      }
    }

    // Strategy 2: Extract series and number patterns
    const seriesPatterns = [
      /(sv|swsh|sm|xy|bw)(\d+)/,  // Main series
      /(base)(\d+)/,             // Base sets
      /(ex|pl|hgss|col)(\d+)/,   // Special series
    ];

    for (const pattern of seriesPatterns) {
      const match = normalizedDbId.match(pattern);
      if (match) {
        const series = match[1];
        const number = parseInt(match[2], 10);

        // Try exact match
        const exactKey = `${series}${number}`;
        if (this.setCodeMap.has(exactKey)) {
          return this.setCodeMap.get(exactKey)!.id;
        }

        // Try with series prefix
        const seriesKey = `${series}${number}`;
        if (this.setCodeMap.has(seriesKey)) {
          return this.setCodeMap.get(seriesKey)!.id;
        }
      }
    }

    // Strategy 3: Check for special set names
    const specialMappings: Record<string, string> = {
      'svscarletvioletbaseset': 'sv1',
      'svpaldeanfates': 'svp',
      'svprismaticevolutions': 'svpe',
      'svscarletviolet151': 'svu',
      'svescarletvioletenergies': 'sve',
      'blackandwhite': 'bw1',
      'boundariescrossed': 'bw7',
      'plasmablast': 'bw8',
      'plasmastorm': 'bw9',
      'celebrations': 'cel25',
      'calloflegends': 'col1',
      'triumphant': 'hgss1',
      'unleashed': 'hgss2',
      'undefeated': 'hgss3',
      'triumphantarceus': 'hgss4',
      'aquapolis': 'ecard1',
      'skyridge': 'ecard2',
      'arceus': 'pl1',
      'suprememajestic': 'pl2',
      'risingrivals': 'pl3',
      'arceusmajesticdawn': 'pl4',
    };

    if (specialMappings[normalizedDbId]) {
      return specialMappings[normalizedDbId];
    }

    return null;
  }

  /**
   * Extract set code using pattern recognition as last resort
   */
  private extractSetCodeFromPattern(normalizedDbId: string): string | null {
    // Extract alphanumeric sequences that look like set codes
    const patterns = [
      /(sv|swsh|sm|xy|bw|ex|pl|hgss|col|cel|ecard)(\d+)/,
      /(base|p|bp|np)(\d*)/,
    ];

    for (const pattern of patterns) {
      const match = normalizedDbId.match(pattern);
      if (match) {
        const series = match[1];
        const number = match[2] || '';

        // Remove leading zeros from numbers
        const cleanNumber = number ? parseInt(number, 10).toString() : '';
        return `${series}${cleanNumber}`;
      }
    }

    return null;
  }

  /**
   * Get all available set codes
   */
  async getAllSetCodes(): Promise<string[]> {
    await this.initialize();
    return Array.from(this.setCodeMap.keys());
  }

  /**
   * Get set data by API set code
   */
  async getSetByCode(apiSetCode: string): Promise<PokemonApiSet | null> {
    await this.initialize();

    for (const [key, set] of this.setCodeMap) {
      if (set.id.toLowerCase() === apiSetCode.toLowerCase()) {
        return set;
      }
    }

    return null;
  }

  /**
   * Check if service is ready
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Clear cache and reload (useful for testing)
   */
  async reload(): Promise<void> {
    this.initialized = false;
    this.initializationPromise = null;
    this.setCodeMap.clear();
    await this.initialize();
  }
}

export const setCodeService = new SetCodeService();
