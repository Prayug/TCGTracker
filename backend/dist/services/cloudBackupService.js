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
exports.getCloudBackupStatus = exports.backupDatabaseToCloud = exports.restoreDatabaseFromCloud = exports.uploadDatabaseFileToCloud = exports.isCloudConfigured = void 0;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const promises_1 = require("stream/promises");
const zlib_1 = require("zlib");
const undici_1 = require("undici");
const env_1 = require("../config/env");
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const LARGE_TRANSFER_TIMEOUT_MS = 60 * 60 * 1000;
// Supabase free tier rejects single objects above ~50 MB.
const MAX_CHUNK_BYTES = 45 * 1024 * 1024;
const largeTransferAgent = new undici_1.Agent({
    headersTimeout: LARGE_TRANSFER_TIMEOUT_MS,
    bodyTimeout: LARGE_TRANSFER_TIMEOUT_MS,
    connectTimeout: 60000,
});
const normalizeBaseUrl = (url) => url.replace(/\/+$/, '');
const toStorageObjectPath = (objectKey) => objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
const getStorageUploadUrl = (objectKey) => {
    if (!env_1.env.cloud.supabaseUrl || !env_1.env.cloud.serviceRoleKey) {
        throw new Error('Supabase cloud sync is not configured');
    }
    const storagePath = toStorageObjectPath(objectKey);
    return `${normalizeBaseUrl(env_1.env.cloud.supabaseUrl)}/storage/v1/object/${env_1.env.cloud.bucket}/${storagePath}`;
};
const getStorageDownloadUrl = (objectKey) => getStorageUploadUrl(objectKey);
const uploadObject = (objectKey, body, contentType) => __awaiter(void 0, void 0, void 0, function* () {
    const url = getStorageUploadUrl(objectKey);
    const response = yield (0, undici_1.fetch)(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env_1.env.cloud.serviceRoleKey}`,
            apikey: env_1.env.cloud.serviceRoleKey,
            'x-upsert': 'true',
            'Content-Type': contentType,
        },
        body,
        dispatcher: largeTransferAgent,
    });
    if (!response.ok) {
        const errorText = yield response.text().catch(() => response.statusText);
        throw new Error(`Cloud upload failed (${response.status}): ${errorText}`);
    }
});
const uploadFileObject = (objectKey, filePath, contentType) => __awaiter(void 0, void 0, void 0, function* () {
    const stats = fs_1.default.statSync(filePath);
    const body = fs_1.default.createReadStream(filePath);
    const url = getStorageUploadUrl(objectKey);
    logger_1.logger.info('Starting cloud file upload', {
        objectKey,
        sizeMb: (stats.size / 1024 / 1024).toFixed(1),
    });
    const response = yield (0, undici_1.fetch)(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env_1.env.cloud.serviceRoleKey}`,
            apikey: env_1.env.cloud.serviceRoleKey,
            'x-upsert': 'true',
            'Content-Type': contentType,
            'Content-Length': String(stats.size),
        },
        body: body,
        duplex: 'half',
        dispatcher: largeTransferAgent,
    });
    if (!response.ok) {
        const errorText = yield response.text().catch(() => response.statusText);
        throw new Error(`Cloud upload failed (${response.status}): ${errorText}`);
    }
});
const downloadObject = (objectKey) => __awaiter(void 0, void 0, void 0, function* () {
    const url = getStorageDownloadUrl(objectKey);
    const response = yield (0, undici_1.fetch)(url, {
        headers: {
            Authorization: `Bearer ${env_1.env.cloud.serviceRoleKey}`,
            apikey: env_1.env.cloud.serviceRoleKey,
        },
        dispatcher: largeTransferAgent,
    });
    if (!response.ok) {
        const errorText = yield response.text().catch(() => response.statusText);
        throw new Error(`Cloud download failed (${response.status}): ${errorText}`);
    }
    return Buffer.from(yield response.arrayBuffer());
});
const compressDatabaseToGzip = (dbPath, gzipPath) => __awaiter(void 0, void 0, void 0, function* () {
    logger_1.logger.info('Compressing database for cloud upload...', {
        sourceMb: (fs_1.default.statSync(dbPath).size / 1024 / 1024).toFixed(1),
    });
    yield (0, promises_1.pipeline)(fs_1.default.createReadStream(dbPath), (0, zlib_1.createGzip)({ level: 6 }), fs_1.default.createWriteStream(gzipPath));
});
const splitFileIntoChunks = (filePath, chunkSize, outDir) => {
    fs_1.default.mkdirSync(outDir, { recursive: true });
    const stats = fs_1.default.statSync(filePath);
    const fd = fs_1.default.openSync(filePath, 'r');
    const chunkPaths = [];
    try {
        let offset = 0;
        let index = 0;
        while (offset < stats.size) {
            const size = Math.min(chunkSize, stats.size - offset);
            const chunkPath = path_1.default.join(outDir, `${String(index).padStart(4, '0')}.part`);
            const buffer = Buffer.alloc(size);
            fs_1.default.readSync(fd, buffer, 0, size, offset);
            fs_1.default.writeFileSync(chunkPath, buffer);
            chunkPaths.push(chunkPath);
            offset += size;
            index += 1;
        }
    }
    finally {
        fs_1.default.closeSync(fd);
    }
    return chunkPaths;
};
const removePathIfExists = (targetPath) => {
    if (fs_1.default.existsSync(targetPath)) {
        fs_1.default.rmSync(targetPath, { recursive: true, force: true });
    }
};
const uploadChunkedDatabase = (dbPath, runDate, source) => __awaiter(void 0, void 0, void 0, function* () {
    const originalBytes = fs_1.default.statSync(dbPath).size;
    const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'tcgtracker-cloud-'));
    const gzipPath = path_1.default.join(tempRoot, 'database.db.gz');
    const chunkDir = path_1.default.join(tempRoot, 'chunks');
    try {
        yield compressDatabaseToGzip(dbPath, gzipPath);
        const compressedBytes = fs_1.default.statSync(gzipPath).size;
        const chunkPaths = splitFileIntoChunks(gzipPath, MAX_CHUNK_BYTES, chunkDir);
        const latestPrefix = 'latest/chunks';
        const backupPrefix = `backups/tcg-prices-${runDate}/chunks`;
        for (let i = 0; i < chunkPaths.length; i += 1) {
            const chunkName = `${String(i).padStart(4, '0')}.part`;
            yield uploadFileObject(`${latestPrefix}/${chunkName}`, chunkPaths[i], 'application/octet-stream');
            yield uploadFileObject(`${backupPrefix}/${chunkName}`, chunkPaths[i], 'application/octet-stream');
        }
        const manifest = {
            version: 1,
            format: 'gzip-chunks',
            runDate,
            generatedAt: new Date().toISOString(),
            originalBytes,
            compressedBytes,
            chunkCount: chunkPaths.length,
            chunkBytes: MAX_CHUNK_BYTES,
            prefix: `${latestPrefix}/`,
        };
        const manifestJson = JSON.stringify(manifest, null, 2);
        yield uploadObject('latest/manifest.json', manifestJson, 'application/json');
        yield uploadObject(`backups/tcg-prices-${runDate}/manifest.json`, manifestJson, 'application/json');
        const metadata = {
            runDate,
            generatedAt: manifest.generatedAt,
            databasePath: path_1.default.basename(dbPath),
            databaseBytes: originalBytes,
            compressedBytes,
            chunkCount: chunkPaths.length,
            source,
            format: manifest.format,
        };
        const metadataJson = JSON.stringify(metadata, null, 2);
        yield uploadObject(`metadata/backup-${runDate}.json`, metadataJson, 'application/json');
        yield uploadObject('metadata/latest.json', metadataJson, 'application/json');
        return {
            enabled: true,
            uploaded: true,
            message: `Uploaded ${(originalBytes / 1024 / 1024).toFixed(1)} MB DB as ${chunkPaths.length} compressed chunks (${(compressedBytes / 1024 / 1024).toFixed(1)} MB gzip).`,
            backupKey: `backups/tcg-prices-${runDate}/manifest.json`,
            latestKey: 'latest/manifest.json',
        };
    }
    finally {
        removePathIfExists(tempRoot);
    }
});
const restoreFromChunkedManifest = (manifest) => __awaiter(void 0, void 0, void 0, function* () {
    const dbPath = (0, database_1.getDatabasePath)();
    const tempRoot = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'tcgtracker-restore-'));
    const gzipPath = path_1.default.join(tempRoot, 'database.db.gz');
    try {
        const gzipFd = fs_1.default.openSync(gzipPath, 'w');
        try {
            for (let i = 0; i < manifest.chunkCount; i += 1) {
                const chunkName = `${String(i).padStart(4, '0')}.part`;
                const chunkKey = `${manifest.prefix}${chunkName}`;
                logger_1.logger.info('Downloading cloud chunk', { chunkKey, index: i + 1, total: manifest.chunkCount });
                const chunk = yield downloadObject(chunkKey);
                fs_1.default.writeSync(gzipFd, chunk);
            }
        }
        finally {
            fs_1.default.closeSync(gzipFd);
        }
        const walPath = `${dbPath}-wal`;
        const shmPath = `${dbPath}-shm`;
        for (const sidecar of [walPath, shmPath]) {
            if (fs_1.default.existsSync(sidecar)) {
                fs_1.default.unlinkSync(sidecar);
            }
        }
        yield (0, promises_1.pipeline)(fs_1.default.createReadStream(gzipPath), (0, zlib_1.createGunzip)(), fs_1.default.createWriteStream(dbPath));
        const restoredBytes = fs_1.default.statSync(dbPath).size;
        return {
            enabled: true,
            restored: true,
            message: `Restored ${(restoredBytes / 1024 / 1024).toFixed(1)} MB from ${manifest.chunkCount} cloud chunks. Restart the server.`,
            latestKey: 'latest/manifest.json',
            databaseBytes: restoredBytes,
        };
    }
    finally {
        removePathIfExists(tempRoot);
    }
});
const isCloudConfigured = () => env_1.env.cloud.enabled &&
    Boolean(env_1.env.cloud.supabaseUrl) &&
    Boolean(env_1.env.cloud.serviceRoleKey) &&
    Boolean(env_1.env.cloud.bucket);
exports.isCloudConfigured = isCloudConfigured;
const uploadDatabaseFileToCloud = (dbPath, runDate) => __awaiter(void 0, void 0, void 0, function* () {
    if (!(0, exports.isCloudConfigured)()) {
        return {
            enabled: false,
            uploaded: false,
            message: 'Cloud sync disabled or Supabase credentials missing.',
        };
    }
    const resolvedPath = path_1.default.resolve(dbPath);
    if (!fs_1.default.existsSync(resolvedPath)) {
        return {
            enabled: true,
            uploaded: false,
            message: `Database file not found: ${resolvedPath}`,
        };
    }
    return uploadChunkedDatabase(resolvedPath, runDate, 'manual_upload');
});
exports.uploadDatabaseFileToCloud = uploadDatabaseFileToCloud;
const restoreDatabaseFromCloud = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (objectKey = 'latest/manifest.json') {
    if (!(0, exports.isCloudConfigured)()) {
        return {
            enabled: false,
            restored: false,
            message: 'Cloud sync disabled or Supabase credentials missing.',
        };
    }
    if (objectKey.endsWith('manifest.json')) {
        try {
            const manifestBuffer = yield downloadObject('latest/manifest.json');
            const manifest = JSON.parse(manifestBuffer.toString('utf8'));
            if (manifest.format === 'gzip-chunks') {
                return restoreFromChunkedManifest(manifest);
            }
        }
        catch (error) {
            logger_1.logger.warn('Chunked manifest restore unavailable, trying legacy single-file backup', {
                error: error.message,
            });
        }
    }
    const dbPath = (0, database_1.getDatabasePath)();
    const legacyKey = objectKey.endsWith('.db') ? objectKey : 'latest/tcg-prices-latest.db';
    const dbBuffer = yield downloadObject(legacyKey);
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    for (const sidecar of [walPath, shmPath]) {
        if (fs_1.default.existsSync(sidecar)) {
            fs_1.default.unlinkSync(sidecar);
        }
    }
    fs_1.default.writeFileSync(dbPath, dbBuffer);
    return {
        enabled: true,
        restored: true,
        message: `Restored ${(dbBuffer.length / 1024 / 1024).toFixed(1)} MB from ${legacyKey}. Restart the server.`,
        latestKey: legacyKey,
        databaseBytes: dbBuffer.length,
    };
});
exports.restoreDatabaseFromCloud = restoreDatabaseFromCloud;
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
    if (!(0, exports.isCloudConfigured)()) {
        return {
            enabled: false,
            uploaded: false,
            message: 'Cloud sync disabled or Supabase credentials missing.',
        };
    }
    try {
        const dbPath = (0, database_1.getDatabasePath)();
        const result = yield uploadChunkedDatabase(dbPath, runDate, 'scheduled_backup');
        logger_1.logger.info('Cloud database backup uploaded successfully', {
            backupKey: result.backupKey,
            latestKey: result.latestKey,
            message: result.message,
        });
        return result;
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
    if (!(0, exports.isCloudConfigured)()) {
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
        format: 'gzip-chunks',
        maxChunkMb: MAX_CHUNK_BYTES / 1024 / 1024,
        lastPriceUpdate: lastRun,
    };
});
exports.getCloudBackupStatus = getCloudBackupStatus;
