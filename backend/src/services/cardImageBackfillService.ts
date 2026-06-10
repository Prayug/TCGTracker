import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { syncSetIdAliases } from './setAliasStore';

export interface ImageBackfillResult {
  aliasesSynced: number;
  bulkUpdated: number;
  individuallyUpdated: number;
  stillMissing: number;
}

const dbRun = (sql: string, params: unknown[] = []): Promise<number> =>
  new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });

const dbGet = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });

const dbAll = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows as T[]) || []);
    });
  });

/** Bulk copy catalog images into card_mappings using persisted set_id_aliases. */
async function bulkBackfillFromCatalog(): Promise<number> {
  return dbRun(`
    UPDATE card_mappings
    SET
      imageSmall = (
        SELECT cc.imageSmall
        FROM catalog_cards cc
        INNER JOIN set_id_aliases sa ON sa.catalogSetId = cc.setId
        WHERE sa.sourceSetId = card_mappings.setId
          AND cc.cardName = card_mappings.cardName
          AND cc.imageSmall IS NOT NULL
        ORDER BY cc.cardNumber
        LIMIT 1
      ),
      imageLarge = (
        SELECT cc.imageLarge
        FROM catalog_cards cc
        INNER JOIN set_id_aliases sa ON sa.catalogSetId = cc.setId
        WHERE sa.sourceSetId = card_mappings.setId
          AND cc.cardName = card_mappings.cardName
          AND cc.imageLarge IS NOT NULL
        ORDER BY cc.cardNumber
        LIMIT 1
      ),
      cardNumber = COALESCE(
        NULLIF(card_mappings.cardNumber, ''),
        (
          SELECT cc.cardNumber
          FROM catalog_cards cc
          INNER JOIN set_id_aliases sa ON sa.catalogSetId = cc.setId
          WHERE sa.sourceSetId = card_mappings.setId
            AND cc.cardName = card_mappings.cardName
            AND cc.cardNumber IS NOT NULL
          ORDER BY cc.cardNumber
          LIMIT 1
        )
      ),
      catalogSetId = (
        SELECT sa.catalogSetId
        FROM set_id_aliases sa
        WHERE sa.sourceSetId = card_mappings.setId
        LIMIT 1
      ),
      imageSource = 'catalog_match',
      imageLastUpdated = datetime('now')
    WHERE (imageSmall IS NULL OR imageLarge IS NULL)
      AND EXISTS (
        SELECT 1
        FROM catalog_cards cc
        INNER JOIN set_id_aliases sa ON sa.catalogSetId = cc.setId
        WHERE sa.sourceSetId = card_mappings.setId
          AND cc.cardName = card_mappings.cardName
          AND (cc.imageSmall IS NOT NULL OR cc.imageLarge IS NOT NULL)
      )
  `);
}

/** Match cards whose mapping setId already equals a catalog setId (no alias needed). */
async function bulkBackfillDirectSetMatch(): Promise<number> {
  return dbRun(`
    UPDATE card_mappings
    SET
      imageSmall = (
        SELECT cc.imageSmall FROM catalog_cards cc
        WHERE cc.setId = card_mappings.setId
          AND cc.cardName = card_mappings.cardName
          AND cc.imageSmall IS NOT NULL
        LIMIT 1
      ),
      imageLarge = (
        SELECT cc.imageLarge FROM catalog_cards cc
        WHERE cc.setId = card_mappings.setId
          AND cc.cardName = card_mappings.cardName
          AND cc.imageLarge IS NOT NULL
        LIMIT 1
      ),
      cardNumber = COALESCE(
        NULLIF(card_mappings.cardNumber, ''),
        (SELECT cc.cardNumber FROM catalog_cards cc
         WHERE cc.setId = card_mappings.setId AND cc.cardName = card_mappings.cardName
         LIMIT 1)
      ),
      catalogSetId = card_mappings.setId,
      imageSource = 'catalog_direct',
      imageLastUpdated = datetime('now')
    WHERE (imageSmall IS NULL OR imageLarge IS NULL)
      AND EXISTS (
        SELECT 1 FROM catalog_cards cc
        WHERE cc.setId = card_mappings.setId
          AND cc.cardName = card_mappings.cardName
          AND (cc.imageSmall IS NOT NULL OR cc.imageLarge IS NOT NULL)
      )
  `);
}

interface MissingImageRow {
  id: number;
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber: string | null;
}

async function countMissingImages(): Promise<number> {
  const row = await dbGet<{ count: number }>(
    `SELECT COUNT(*) as count FROM card_mappings
     WHERE imageSmall IS NULL OR imageLarge IS NULL`
  );
  return row?.count ?? 0;
}

/** Copy images from catalog_cards when upserting a mapping row during price sync. */
export async function copyCatalogImagesToMapping(
  cardName: string,
  setId: string,
  setName?: string,
  cardNumber?: string | null
): Promise<{ imageSmall?: string; imageLarge?: string; catalogSetId?: string } | null> {
  const direct = await dbGet<{ imageSmall: string; imageLarge: string; setId: string; cardNumber: string }>(
    `SELECT imageSmall, imageLarge, setId, cardNumber
     FROM catalog_cards
     WHERE cardName = ? AND setId = ?
       AND (imageSmall IS NOT NULL OR imageLarge IS NOT NULL)
     LIMIT 1`,
    [cardName, setId]
  );
  if (direct) {
    return {
      imageSmall: direct.imageSmall,
      imageLarge: direct.imageLarge,
      catalogSetId: direct.setId,
    };
  }

  const aliased = await dbGet<{ imageSmall: string; imageLarge: string; catalogSetId: string; cardNumber: string }>(
    `SELECT cc.imageSmall, cc.imageLarge, sa.catalogSetId, cc.cardNumber
     FROM catalog_cards cc
     INNER JOIN set_id_aliases sa ON sa.catalogSetId = cc.setId
     WHERE sa.sourceSetId = ? AND cc.cardName = ?
       AND (cc.imageSmall IS NOT NULL OR cc.imageLarge IS NOT NULL)
     ORDER BY CASE WHEN ? <> '' AND cc.cardNumber = ? THEN 0 ELSE 1 END, cc.cardNumber
     LIMIT 1`,
    [setId, cardName, cardNumber || '', cardNumber || '']
  );
  if (aliased) {
    return {
      imageSmall: aliased.imageSmall,
      imageLarge: aliased.imageLarge,
      catalogSetId: aliased.catalogSetId,
    };
  }

  return null;
}

let isBackfillRunning = false;

/** Persist catalog images into card_mappings — run after catalog sync and price updates. */
export async function backfillCardMappingImages(): Promise<ImageBackfillResult> {
  if (isBackfillRunning) {
    logger.warn('Card image backfill already running, skipping duplicate');
    return { aliasesSynced: 0, bulkUpdated: 0, individuallyUpdated: 0, stillMissing: await countMissingImages() };
  }

  isBackfillRunning = true;
  try {
    logger.info('Starting card image backfill...');
    const aliasesSynced = await syncSetIdAliases();
    const directUpdated = await bulkBackfillDirectSetMatch();
    const aliasUpdated = await bulkBackfillFromCatalog();
    const bulkUpdated = directUpdated + aliasUpdated;

    const stillMissing = await countMissingImages();
    logger.info('Card image backfill complete', {
      aliasesSynced,
      bulkUpdated,
      stillMissing,
    });

    return {
      aliasesSynced,
      bulkUpdated,
      individuallyUpdated: 0,
      stillMissing,
    };
  } finally {
    isBackfillRunning = false;
  }
}

export async function getCardMappingImages(cardId: string): Promise<{
  imageSmall?: string;
  imageLarge?: string;
  cardNumber?: string;
} | null> {
  const row = await dbGet<{
    imageSmall: string | null;
    imageLarge: string | null;
    cardNumber: string | null;
  }>(
    `SELECT imageSmall, imageLarge, cardNumber FROM card_mappings WHERE cardId = ? LIMIT 1`,
    [cardId]
  );

  if (!row || (!row.imageSmall && !row.imageLarge)) return null;

  return {
    imageSmall: row.imageSmall || undefined,
    imageLarge: row.imageLarge || undefined,
    cardNumber: row.cardNumber || undefined,
  };
}

export async function getImageCoverageStats(): Promise<{
  total: number;
  withImages: number;
  withoutImages: number;
  percentage: number;
}> {
  const row = await dbGet<{ total: number; withImages: number; withoutImages: number }>(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN imageSmall IS NOT NULL AND imageLarge IS NOT NULL THEN 1 ELSE 0 END) as withImages,
       SUM(CASE WHEN imageSmall IS NULL OR imageLarge IS NULL THEN 1 ELSE 0 END) as withoutImages
     FROM card_mappings`
  );

  const total = row?.total ?? 0;
  const withImages = row?.withImages ?? 0;
  return {
    total,
    withImages,
    withoutImages: row?.withoutImages ?? 0,
    percentage: total > 0 ? (withImages / total) * 100 : 0,
  };
}
