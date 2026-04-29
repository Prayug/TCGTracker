"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCloudBackupStatus = exports.backupDatabaseToCloud = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const normalizeBaseUrl = (url) => url.replace(/\/+$/, '');
const toStorageObjectPath = (objectKey) => objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
const isCloudConfigured = () => env_1.env.cloud.enabled &&
    Boolean(env_1.env.cloud.supabaseUrl) &&
    Boolean(env_1.env.cloud.serviceRoleKey) &&
    Boolean(env_1.env.cloud.bucket);
const uploadObject = (objectKey, body, contentType) => __awaiter(void 0, void 0, void 0, function* () {
    if (!env_1.env.cloud.supabaseUrl || !env_1.env.cloud.serviceRoleKey) {
        throw new Error('Supabase cloud sync is not configured');
    }
    const storagePath = toStorageObjectPath(objectKey);
    const url = `${normalizeBaseUrl(env_1.env.cloud.supabaseUrl)}/storage/v1/object/${env_1.env.cloud.bucket}/${storagePath}`;
    const response = yield fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env_1.env.cloud.serviceRoleKey}`,
            apikey: env_1.env.cloud.serviceRoleKey,
            'x-upsert': 'true',
            'Content-Type': contentType,
        },
        body,
    });
    if (!response.ok) {
        const errorText = yield response.text().catch(() => response.statusText);
        throw new Error(`Cloud upload failed (${response.status}): ${errorText}`);
    }
});
const getBackupMetadata = (runDate) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    const summary = yield new Promise((resolve, reject) => {
        db.get(`SELECT
        (SELECT COUNT(*) FROM price_history) AS totalPriceRows,
        (SELECT COUNT(*) FROM card_mappings) AS totalMappings,
        (SELECT COUNT(*) FROM catalog_cards) AS totalCatalogCards,
        (SELECT MAX(date) FROM price_history) AS latestPriceDate`, [], (err, row) => {
            if (err)
                reject(err);
            else
                resolve(row || {});
        });
    });
    const dbPath = (0, database_1.getDatabasePath)();
    const fileStats = fs_1.default.statSync(dbPath);
    return {
        runDate,
        generatedAt: new Date().toISOString(),
        databasePath: path_1.default.basename(dbPath),
        databaseBytes: fileStats.size,
        summary,
    };
});
const backupDatabaseToCloud = (runDate) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isCloudConfigured()) {
        return {
            enabled: false,
            uploaded: false,
            message: 'Cloud sync disabled or Supabase credentials missing.',
        };
    }
    try {
        const dbPath = (0, database_1.getDatabasePath)();
        const dbBuffer = fs_1.default.readFileSync(dbPath);
        const backupKey = `backups/tcg-prices-${runDate}.db`;
        const latestKey = 'latest/tcg-prices-latest.db';
        const metadataKey = `metadata/backup-${runDate}.json`;
        const latestMetadataKey = 'metadata/latest.json';
        yield uploadObject(backupKey, dbBuffer, 'application/x-sqlite3');
        yield uploadObject(latestKey, dbBuffer, 'application/x-sqlite3');
        const metadata = yield getBackupMetadata(runDate);
        const metadataJson = JSON.stringify(metadata, null, 2);
        yield uploadObject(metadataKey, metadataJson, 'application/json');
        yield uploadObject(latestMetadataKey, metadataJson, 'application/json');
        logger_1.logger.info('Cloud database backup uploaded successfully', {
            backupKey,
            latestKey,
            metadataKey,
        });
        return {
            enabled: true,
            uploaded: true,
            message: 'Cloud database backup uploaded.',
            backupKey,
            latestKey,
        };
    }
    catch (error) {
        logger_1.logger.error('Cloud database backup failed', { error: error.message });
        return {
            enabled: true,
            uploaded: false,
            message: `Cloud backup failed: ${error.message}`,
        };
    }
});
exports.backupDatabaseToCloud = backupDatabaseToCloud;
const getCloudBackupStatus = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!isCloudConfigured()) {
        return {
            enabled: false,
            provider: 'supabase-storage',
            bucket: env_1.env.cloud.bucket,
            configured: false,
            message: 'Set CLOUD_SYNC_ENABLED=true and SUPABASE credentials to enable cloud backups.',
        };
    }
    const db = (0, database_1.getDb)();
    const lastRun = yield new Promise((resolve, reject) => {
        db.get(`SELECT runDate, status, startedAt, completedAt, message
       FROM sync_runs
       WHERE runType = 'price_update'
       ORDER BY id DESC
       LIMIT 1`, [], (err, row) => {
            if (err)
                reject(err);
            else
                resolve(row || null);
        });
    });
    return {
        enabled: true,
        configured: true,
        provider: 'supabase-storage',
        bucket: env_1.env.cloud.bucket,
        lastPriceUpdate: lastRun,
    };
});
exports.getCloudBackupStatus = getCloudBackupStatus;
