"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.copyCatalogImagesToMapping = copyCatalogImagesToMapping;
exports.backfillCardMappingImages = backfillCardMappingImages;
exports.getCardMappingImages = getCardMappingImages;
exports.getImageCoverageStats = getImageCoverageStats;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const setAliasStore_1 = require("./setAliasStore");
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().run(sql, params, function (err) {
        if (err)
            reject(err);
        else
            resolve(this.changes);
    });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().get(sql, params, (err, row) => {
        if (err)
            reject(err);
        else
            resolve(row);
    });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().all(sql, params, (err, rows) => {
        if (err)
            reject(err);
        else
            resolve(rows || []);
    });
});
/** Bulk copy catalog images into card_mappings using persisted set_id_aliases. */
async function bulkBackfillFromCatalog() {
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
async function bulkBackfillDirectSetMatch() {
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
async function countMissingImages() {
    var _a;
    const row = await dbGet(`SELECT COUNT(*) as count FROM card_mappings
     WHERE imageSmall IS NULL OR imageLarge IS NULL`);
    return (_a = row === null || row === void 0 ? void 0 : row.count) !== null && _a !== void 0 ? _a : 0;
}
/** Copy images from catalog_cards when upserting a mapping row during price sync. */
async function copyCatalogImagesToMapping(cardName, setId, setName, cardNumber) {
    const direct = await dbGet(`SELECT imageSmall, imageLarge, setId, cardNumber
     FROM catalog_cards
     WHERE cardName = ? AND setId = ?
       AND (imageSmall IS NOT NULL OR imageLarge IS NOT NULL)
     LIMIT 1`, [cardName, setId]);
    if (direct) {
        return {
            imageSmall: direct.imageSmall,
            imageLarge: direct.imageLarge,
            catalogSetId: direct.setId,
        };
    }
    const aliased = await dbGet(`SELECT cc.imageSmall, cc.imageLarge, sa.catalogSetId, cc.cardNumber
     FROM catalog_cards cc
     INNER JOIN set_id_aliases sa ON sa.catalogSetId = cc.setId
     WHERE sa.sourceSetId = ? AND cc.cardName = ?
       AND (cc.imageSmall IS NOT NULL OR cc.imageLarge IS NOT NULL)
     ORDER BY CASE WHEN ? <> '' AND cc.cardNumber = ? THEN 0 ELSE 1 END, cc.cardNumber
     LIMIT 1`, [setId, cardName, cardNumber || '', cardNumber || '']);
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
async function backfillCardMappingImages() {
    if (isBackfillRunning) {
        logger_1.logger.warn('Card image backfill already running, skipping duplicate');
        return { aliasesSynced: 0, bulkUpdated: 0, individuallyUpdated: 0, stillMissing: await countMissingImages() };
    }
    isBackfillRunning = true;
    try {
        logger_1.logger.info('Starting card image backfill...');
        const aliasesSynced = await (0, setAliasStore_1.syncSetIdAliases)();
        const directUpdated = await bulkBackfillDirectSetMatch();
        const aliasUpdated = await bulkBackfillFromCatalog();
        const bulkUpdated = directUpdated + aliasUpdated;
        const stillMissing = await countMissingImages();
        logger_1.logger.info('Card image backfill complete', {
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
    }
    finally {
        isBackfillRunning = false;
    }
}
async function getCardMappingImages(cardId) {
    const row = await dbGet(`SELECT imageSmall, imageLarge, cardNumber FROM card_mappings WHERE cardId = ? LIMIT 1`, [cardId]);
    if (!row || (!row.imageSmall && !row.imageLarge))
        return null;
    return {
        imageSmall: row.imageSmall || undefined,
        imageLarge: row.imageLarge || undefined,
        cardNumber: row.cardNumber || undefined,
    };
}
async function getImageCoverageStats() {
    var _a, _b, _c;
    const row = await dbGet(`SELECT
       COUNT(*) as total,
       SUM(CASE WHEN imageSmall IS NOT NULL AND imageLarge IS NOT NULL THEN 1 ELSE 0 END) as withImages,
       SUM(CASE WHEN imageSmall IS NULL OR imageLarge IS NULL THEN 1 ELSE 0 END) as withoutImages
     FROM card_mappings`);
    const total = (_a = row === null || row === void 0 ? void 0 : row.total) !== null && _a !== void 0 ? _a : 0;
    const withImages = (_b = row === null || row === void 0 ? void 0 : row.withImages) !== null && _b !== void 0 ? _b : 0;
    return {
        total,
        withImages,
        withoutImages: (_c = row === null || row === void 0 ? void 0 : row.withoutImages) !== null && _c !== void 0 ? _c : 0,
        percentage: total > 0 ? (withImages / total) * 100 : 0,
    };
}
