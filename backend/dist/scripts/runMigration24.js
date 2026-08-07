"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-shot runner for pending migrations (especially migration 24).
 * Usage: npx ts-node src/scripts/runMigration24.ts
 */
const database_1 = require("../db/database");
const migrations_1 = require("../db/migrations");
const canonicalPriceService_1 = require("../services/canonicalPriceService");
const dataQualityService_1 = require("../services/dataQualityService");
const returnCalibration_1 = require("../services/returnCalibration");
const logger_1 = require("../utils/logger");
async function main() {
    logger_1.logger.info('Initializing database + running migrations...');
    await (0, database_1.initializeDatabase)();
    const db = (0, database_1.getDb)();
    await (0, migrations_1.runMigrations)(db);
    logger_1.logger.info('Materializing canonical prices (full rebuild)...');
    const canonical = await (0, canonicalPriceService_1.materializeCanonicalPrices)({ fullRebuild: true });
    logger_1.logger.info('Canonical prices done', canonical);
    logger_1.logger.info('Rebuilding calibration models from deduped samples...');
    await (0, returnCalibration_1.rebuildAllCalibrationModels)();
    logger_1.logger.info('Running data quality checks...');
    const quality = await (0, dataQualityService_1.runDataQualityChecks)();
    logger_1.logger.info('Data quality summary', {
        passed: quality.passed,
        warned: quality.warned,
        failed: quality.failed,
        checks: quality.checks.map((c) => `${c.checkName}=${c.status}`),
    });
    process.exit(0);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
