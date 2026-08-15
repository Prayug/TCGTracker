"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Run a full catalog price snapshot for a calendar date (America/New_York).
 *
 *   npx ts-node src/scripts/runPriceUpdate.ts
 *   npx ts-node src/scripts/runPriceUpdate.ts --date 2026-08-29
 */
const database_1 = require("../db/database");
const migrations_1 = require("../db/migrations");
const dataFetcher_1 = require("../services/dataFetcher");
const logger_1 = require("../utils/logger");
const dateFlag = process.argv.indexOf('--date');
const requested = dateFlag >= 0 ? process.argv[dateFlag + 1] : process.argv[2];
const runDate = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : (0, dataFetcher_1.getRunDate)();
const main = async () => {
    await (0, database_1.initializeDatabase)();
    await (0, migrations_1.runMigrations)((0, database_1.getDb)());
    logger_1.logger.info('Starting price snapshot', { runDate });
    const result = await (0, dataFetcher_1.updatePriceData)({ runDate });
    logger_1.logger.info('Price snapshot finished', result);
    if (result.skipped || result.error) {
        process.exit(1);
    }
    process.exit(0);
};
main().catch((error) => {
    logger_1.logger.error('Price snapshot failed', { error: error.message });
    process.exit(1);
});
