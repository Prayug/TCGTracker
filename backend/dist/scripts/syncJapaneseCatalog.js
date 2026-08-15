"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-shot bootstrap: sync Japanese sets into catalog_cards.
 * Usage:
 *   npx ts-node src/scripts/syncJapaneseCatalog.ts [setLimit]
 *   npx ts-node src/scripts/syncJapaneseCatalog.ts all
 */
const database_1 = require("../db/database");
const migrations_1 = require("../db/migrations");
const catalogSync_1 = require("../services/catalogSync");
const logger_1 = require("../utils/logger");
const main = async () => {
    const arg = (process.argv[2] || '13').toLowerCase();
    const full = arg === 'all' || arg === 'full';
    const setLimit = full ? 250 : Math.min(Math.max(parseInt(arg, 10) || 13, 1), 250);
    await (0, database_1.initializeDatabase)();
    await (0, migrations_1.runMigrations)((0, database_1.getDb)());
    logger_1.logger.info('Starting Japanese catalog bootstrap', { setLimit, priorityOnly: !full });
    const result = await (0, catalogSync_1.syncJapaneseCatalogData)(setLimit, { priorityOnly: !full });
    logger_1.logger.info('Japanese catalog bootstrap complete', result);
    await new Promise((resolve, reject) => {
        (0, database_1.getDb)().get(`SELECT COUNT(*) AS n FROM catalog_cards WHERE language = 'ja'`, (err, row) => {
            if (err)
                reject(err);
            else {
                logger_1.logger.info('JA catalog row count', { count: row === null || row === void 0 ? void 0 : row.n });
                resolve();
            }
        });
    });
    process.exit(0);
};
main().catch((error) => {
    logger_1.logger.error('Japanese catalog bootstrap failed', { error: error.message });
    process.exit(1);
});
