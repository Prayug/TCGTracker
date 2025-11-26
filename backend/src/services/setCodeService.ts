import { getDb } from '../db/database';
import { pokemonApiClient, PokemonApiSet } from './pokemonApiClient';
import { logger } from '../utils/logger';

interface SetMappingStats {
  databaseMappings: number;
  cachedMappings: number;
  lastRefreshed: number | null;
  cacheTtl: number;
}

const SET_MAP_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

const removeLeadingZeros = (value: string): string => {
  return value.replace(/^0+/, '') || '0';
};

const normalizeSetIdWithZeroRemoval = (setId: string): string => {
  const patterns = [
    /(sv|swsh|sm|xy|bw)(\d+)/,
    /(zsv)(\d+)(pt\d+)/,
    /(base|dp|ex|hgss|pop|bw)(\d+)/,
    /(neo)(\d+)/,
    /(pl)(\d+)/,
    /(col)(\d+)/,
    /(mcd)(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = setId.match(pattern);
    if (match) {
      if (match.length === 3) {
        const series = match[1];
        const number = removeLeadingZeros(match[2]);
        return `${series}${number}`;
      } else if (match.length === 4) {
        return `${match[1]}${match[2]}${match[3]}`;
      }
    }
  }

  return setId;
};

/**
 * Service for managing Pokemon TCG set codes and mappings
 * Eliminates the need for manual mapping by using actual API data
 */
export class SetCodeService {
  private setCodeMap: Map<string, PokemonApiSet> = new Map();
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  private normalizedSetMap: Map<string, string> | null = null;
  private normalizedMapLoadedAt = 0;
  private normalizedLoadPromise: Promise<Map<string, string>> | null = null;
  private normalizedRefreshPromise: Promise<Map<string, string>> | null = null;

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

  private async getNormalizedSetMap(): Promise<Map<string, string>> {
    const now = Date.now();
    if (this.normalizedSetMap && now - this.normalizedMapLoadedAt < SET_MAP_CACHE_TTL) {
      return this.normalizedSetMap;
    }

    if (this.normalizedLoadPromise) {
      return this.normalizedLoadPromise;
    }

    this.normalizedLoadPromise = (async () => {
      if (this.normalizedSetMap && now - this.normalizedMapLoadedAt < SET_MAP_CACHE_TTL) {
        return this.normalizedSetMap;
      }

      const dbMap = await this.loadMappingsFromDb();
      if (dbMap.size > 0) {
        this.normalizedSetMap = dbMap;
        this.normalizedMapLoadedAt = Date.now();
        return dbMap;
      }

      return await this.refreshSetMappingsInternal();
    })();

    const result = await this.normalizedLoadPromise;
    this.normalizedLoadPromise = null;
    return result;
  }

  private async refreshSetMappingsInternal(prefetchedSets?: PokemonApiSet[]): Promise<Map<string, string>> {
    if (this.normalizedRefreshPromise) {
      return this.normalizedRefreshPromise;
    }

    this.normalizedRefreshPromise = (async () => {
      try {
        const sets = prefetchedSets ?? (await pokemonApiClient.getSets(1000));
        if (!sets || sets.length === 0) {
          logger.warn('Pokemon API returned no sets while refreshing mappings');
          if (this.normalizedSetMap?.size) {
            return this.normalizedSetMap;
          }
          return await this.loadMappingsFromDb();
        }

        const mappings = new Map<string, string>();
        sets.forEach((set) => {
          const keys = this.generateNormalizedKeys(set);
          keys.forEach((key) => {
            if (key) {
              mappings.set(key, set.id.toLowerCase());
            }
          });
        });

        await this.saveMappingsToDb(mappings, sets);
        this.normalizedSetMap = mappings;
        this.normalizedMapLoadedAt = Date.now();
        logger.info(`Refreshed ${mappings.size} set mappings from Pokemon API`);
        return mappings;
      } catch (error) {
        logger.error('Failed to refresh set mappings from API', { error: (error as Error).message });
        if (this.normalizedSetMap?.size) {
          return this.normalizedSetMap;
        }
        return await this.loadMappingsFromDb();
      } finally {
        this.normalizedRefreshPromise = null;
      }
    })();

    return this.normalizedRefreshPromise;
  }

  private async loadMappingsFromDb(): Promise<Map<string, string>> {
    const db = getDb();
    return new Promise((resolve) => {
      db.all('SELECT normalizedKey, apiSetId FROM set_mappings', [], (err, rows: any[]) => {
        if (err) {
          logger.error('Error loading set mappings from DB', { error: err.message });
          resolve(new Map());
          return;
        }

        const map = new Map<string, string>();
        rows.forEach((row) => {
          map.set(row.normalizedKey, row.apiSetId);
        });

        if (map.size > 0) {
          logger.info(`Loaded ${map.size} set mappings from database cache`);
        }
        resolve(map);
      });
    });
  }

  private async saveMappingsToDb(mappings: Map<string, string>, sets: PokemonApiSet[]): Promise<void> {
    const db = getDb();
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.run('DELETE FROM set_mappings', [], (err) => {
          if (err) {
            logger.error('Failed to clear set_mappings table', { error: err.message });
            db.run('ROLLBACK');
            reject(err);
            return;
          }

          const now = Date.now();
          const stmt = db.prepare(`
            INSERT INTO set_mappings (normalizedKey, apiSetId, apiSetName, series, ptcgoCode, totalCards, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          let inserted = 0;
          let failed = 0;

          for (const [key, apiSetId] of mappings.entries()) {
            const setData = sets.find((set) => set.id.toLowerCase() === apiSetId.toLowerCase());
            if (!setData) {
              failed++;
              continue;
            }

            stmt.run(
              [
                key,
                apiSetId,
                setData.name,
                setData.series || '',
                (setData as any).ptcgoCode || '',
                (setData as any).printedTotal || (setData as any).total || 0,
                now,
              ],
              (runErr) => {
                if (runErr) {
                  failed++;
                  logger.warn(`Failed to insert set mapping for ${key}`, { error: runErr.message });
                } else {
                  inserted++;
                }
              }
            );
          }

          stmt.finalize((finalizeErr) => {
            if (finalizeErr) {
              logger.error('Failed to finalize set mapping insert', { error: finalizeErr.message });
              db.run('ROLLBACK');
              reject(finalizeErr);
              return;
            }

            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                logger.error('Failed to commit set mapping transaction', { error: commitErr.message });
                db.run('ROLLBACK');
                reject(commitErr);
              } else {
                logger.info(`Saved ${inserted} set mappings to database (${failed} failed)`);
                resolve();
              }
            });
          });
        });
      });
    });
  }

  private generateNormalizedKeys(set: PokemonApiSet): string[] {
    const keys: string[] = [];

    keys.push(set.id.toLowerCase());
    keys.push(normalizeSetIdWithZeroRemoval(set.id.toLowerCase()));
    keys.push(set.name.toLowerCase().replace(/[^a-z0-9]/g, ''));

    if (set.series) {
      const seriesNormalized = set.series.toLowerCase().replace(/[^a-z0-9]/g, '');
      const nameNormalized = set.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      keys.push(seriesNormalized + nameNormalized);
    }

    if ((set as any).ptcgoCode) {
      keys.push((set as any).ptcgoCode.toLowerCase());
    }

    if ((set as any).total && (set as any).total > 0) {
      const totalStr = (set as any).total.toString();
      keys.push(`${set.id.toLowerCase()}${totalStr}`);
      keys.push(`${set.id.toLowerCase()}${removeLeadingZeros(totalStr)}`);
    }

    if (set.series && (set as any).total && (set as any).total > 0) {
      const seriesNormalized = set.series.toLowerCase().replace(/[^a-z0-9]/g, '');
      const totalStr = (set as any).total.toString();
      keys.push(`${seriesNormalized}${totalStr}`);
      keys.push(`${seriesNormalized}${removeLeadingZeros(totalStr)}`);
    }

    keys.push(`${set.id.toLowerCase()}${set.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
    keys.push(set.name.toLowerCase().replace(/\s+/g, ''));

    if (set.id === 'smp') {
      keys.push('smpromos', 'smspromos', 'sm-promos');
    }
    if (set.id === 'swshp') {
      keys.push('swshpromos', 'swordshieldpromos');
    }
    if (set.id === 'xyp') {
      keys.push('xypromos');
    }
    if (set.id === 'bwp') {
      keys.push('bwblackwhitepromos', 'blackandwhitepromos');
    }
    if (set.id === 'base1') {
      keys.push('baseset', 'base-set');
    }

    return [...new Set(keys)].filter((key) => key.length > 0);
  }

  /**
   * Refresh Pokemon set mappings from the API
   */
  async refreshSetMappings(): Promise<Map<string, string>> {
    return await this.refreshSetMappingsInternal();
  }

  /**
   * Get statistics about cached set mappings
   */
  async getSetMappingStats(): Promise<SetMappingStats> {
    const db = getDb();
    const databaseMappings = await new Promise<number>((resolve) => {
      db.get('SELECT COUNT(*) as totalMappings FROM set_mappings', [], (err, row: any) => {
        if (err) {
          logger.warn('Failed to read set mapping stats from DB', { error: err.message });
          resolve(0);
        } else {
          resolve(row?.totalMappings || 0);
        }
      });
    });

    return {
      databaseMappings,
      cachedMappings: this.normalizedSetMap?.size || 0,
      lastRefreshed: this.normalizedMapLoadedAt || null,
      cacheTtl: SET_MAP_CACHE_TTL,
    };
  }

  /**
   * Get the correct Pokemon TCG API set code for a database set ID
   * This replaces the manual mapping with API-driven lookup
   */
  async getApiSetCode(databaseSetId: string): Promise<string | null> {
    await this.initialize();

    if (!databaseSetId) return null;

    const normalizedDbId = databaseSetId.toLowerCase();

    if (this.setCodeMap.has(normalizedDbId)) {
      const set = this.setCodeMap.get(normalizedDbId)!;
      logger.debug(`Found exact match for ${databaseSetId}: ${set.id}`);
      return set.id;
    }

    const normalizedKey = normalizedDbId.replace(/[^a-z0-9]/g, '');
    const normalizedMap = await this.getNormalizedSetMap();
    if (normalizedMap.has(normalizedKey)) {
      const match = normalizedMap.get(normalizedKey)!;
      logger.debug(`Resolved ${databaseSetId} via normalized map: ${match}`);
      return match;
    }

    const apiCode = this.findBestMatch(normalizedDbId);
    if (apiCode) {
      logger.debug(`Found fuzzy match for ${databaseSetId}: ${apiCode}`);
      return apiCode;
    }

    const fallbackCode = this.extractSetCodeFromPattern(normalizedDbId);
    if (fallbackCode) {
      logger.debug(`Using pattern fallback for ${databaseSetId}: ${fallbackCode}`);
      return fallbackCode;
    }

    logger.warn(`Could not find API set code for database ID: ${databaseSetId}`);
    return null;
  }

  async normalizeSetId(input: string): Promise<string | null> {
    const normalizedKey = input?.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!normalizedKey) {
      return null;
    }

    const normalizedMap = await this.getNormalizedSetMap();
    return normalizedMap.get(normalizedKey) || null;
  }

  async buildDeterministicImageUrls(
    setId?: string | null,
    cardNumber?: string | null
  ): Promise<{ small: string; large: string } | null> {
    if (!setId || !cardNumber) {
      return null;
    }

    const trimmedSet = setId.trim();
    const baseNumber = cardNumber.split('/')[0].trim();
    if (!trimmedSet || !baseNumber) {
      return null;
    }

    const sanitizedNumber = removeLeadingZeros(baseNumber.replace(/\s+/g, '').toLowerCase());
    const normalizedSet = await this.normalizeSetId(trimmedSet);
    if (!normalizedSet) {
      return null;
    }

    const baseUrl = `https://images.pokemontcg.io/${normalizedSet}/${sanitizedNumber}`;
    return {
      small: `${baseUrl}.png`,
      large: `${baseUrl}.png`,
    };
  }

  /**
   * Find the best matching API set code using various strategies
   */
  private findBestMatch(normalizedDbId: string): string | null {
    const suffixes = ['baseset', 'promocards', 'promos', 'trainerkit'];
    for (const suffix of suffixes) {
      if (normalizedDbId.endsWith(suffix)) {
        const withoutSuffix = normalizedDbId.replace(new RegExp(`${suffix}$`), '');
        if (this.setCodeMap.has(withoutSuffix)) {
          return this.setCodeMap.get(withoutSuffix)!.id;
        }
      }
    }

    const seriesPatterns = [
      /(sv|swsh|sm|xy|bw)(\d+)/,
      /(base)(\d+)/,
      /(ex|pl|hgss|col)(\d+)/,
    ];

    for (const pattern of seriesPatterns) {
      const match = normalizedDbId.match(pattern);
      if (match) {
        const series = match[1];
        const number = parseInt(match[2], 10);

        const exactKey = `${series}${number}`;
        if (this.setCodeMap.has(exactKey)) {
          return this.setCodeMap.get(exactKey)!.id;
        }
      }
    }

    return null;
  }

  /**
   * Extract set code using pattern recognition as last resort
   */
  private extractSetCodeFromPattern(normalizedDbId: string): string | null {
    const patterns = [
      /(sv|swsh|sm|xy|bw|ex|pl|hgss|col|cel|ecard)(\d+)/,
      /(base|p|bp|np)(\d*)/,
    ];

    for (const pattern of patterns) {
      const match = normalizedDbId.match(pattern);
      if (match) {
        const series = match[1];
        const number = match[2] || '';
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

    for (const [, set] of this.setCodeMap) {
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
    this.normalizedSetMap = null;
    this.normalizedMapLoadedAt = 0;
    await this.initialize();
  }
}

export const setCodeService = new SetCodeService();
