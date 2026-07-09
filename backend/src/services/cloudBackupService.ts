import fs from 'fs';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createGzip, createGunzip } from 'zlib';
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
import { env } from '../config/env';
import { getDb, getDatabasePath } from '../db/database';
import { logger } from '../utils/logger';

interface CloudBackupResult {
  enabled: boolean;
  uploaded: boolean;
  message: string;
  backupKey?: string;
  latestKey?: string;
}

interface ChunkedBackupManifest {
  version: 1;
  format: 'gzip-chunks';
  runDate: string;
  generatedAt: string;
  originalBytes: number;
  compressedBytes: number;
  chunkCount: number;
  chunkBytes: number;
  prefix: string;
}

const LARGE_TRANSFER_TIMEOUT_MS = 60 * 60 * 1000;
// Supabase free tier rejects single objects above ~50 MB.
const MAX_CHUNK_BYTES = 45 * 1024 * 1024;

const largeTransferAgent: Dispatcher = new Agent({
  headersTimeout: LARGE_TRANSFER_TIMEOUT_MS,
  bodyTimeout: LARGE_TRANSFER_TIMEOUT_MS,
  connectTimeout: 60_000,
});

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, '');

const toStorageObjectPath = (objectKey: string): string =>
  objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const getStorageUploadUrl = (objectKey: string) => {
  if (!env.cloud.supabaseUrl || !env.cloud.serviceRoleKey) {
    throw new Error('Supabase cloud sync is not configured');
  }
  const storagePath = toStorageObjectPath(objectKey);
  return `${normalizeBaseUrl(env.cloud.supabaseUrl)}/storage/v1/object/${env.cloud.bucket}/${storagePath}`;
};

const getStorageDownloadUrl = (objectKey: string) => getStorageUploadUrl(objectKey);

const uploadObject = async (
  objectKey: string,
  body: Buffer | string,
  contentType: string
) => {
  const url = getStorageUploadUrl(objectKey);
  const response = await undiciFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.cloud.serviceRoleKey}`,
      apikey: env.cloud.serviceRoleKey!,
      'x-upsert': 'true',
      'Content-Type': contentType,
    },
    body,
    dispatcher: largeTransferAgent,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Cloud upload failed (${response.status}): ${errorText}`);
  }
};

const uploadFileObject = async (
  objectKey: string,
  filePath: string,
  contentType: string
) => {
  const stats = fs.statSync(filePath);
  const body = fs.createReadStream(filePath);
  const url = getStorageUploadUrl(objectKey);

  logger.info('Starting cloud file upload', {
    objectKey,
    sizeMb: (stats.size / 1024 / 1024).toFixed(1),
  });

  const response = await undiciFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.cloud.serviceRoleKey}`,
      apikey: env.cloud.serviceRoleKey!,
      'x-upsert': 'true',
      'Content-Type': contentType,
      'Content-Length': String(stats.size),
    },
    body: body as unknown as BodyInit,
    duplex: 'half',
    dispatcher: largeTransferAgent,
  } as Parameters<typeof undiciFetch>[1]);

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Cloud upload failed (${response.status}): ${errorText}`);
  }
};

const downloadObject = async (objectKey: string): Promise<Buffer> => {
  const url = getStorageDownloadUrl(objectKey);
  const response = await undiciFetch(url, {
    headers: {
      Authorization: `Bearer ${env.cloud.serviceRoleKey}`,
      apikey: env.cloud.serviceRoleKey!,
    },
    dispatcher: largeTransferAgent,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Cloud download failed (${response.status}): ${errorText}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const compressDatabaseToGzip = async (dbPath: string, gzipPath: string) => {
  logger.info('Compressing database for cloud upload...', {
    sourceMb: (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1),
  });
  await pipeline(fs.createReadStream(dbPath), createGzip({ level: 6 }), fs.createWriteStream(gzipPath));
};

const splitFileIntoChunks = (filePath: string, chunkSize: number, outDir: string): string[] => {
  fs.mkdirSync(outDir, { recursive: true });
  const stats = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  const chunkPaths: string[] = [];

  try {
    let offset = 0;
    let index = 0;
    while (offset < stats.size) {
      const size = Math.min(chunkSize, stats.size - offset);
      const chunkPath = path.join(outDir, `${String(index).padStart(4, '0')}.part`);
      const buffer = Buffer.alloc(size);
      fs.readSync(fd, buffer, 0, size, offset);
      fs.writeFileSync(chunkPath, buffer);
      chunkPaths.push(chunkPath);
      offset += size;
      index += 1;
    }
  } finally {
    fs.closeSync(fd);
  }

  return chunkPaths;
};

const removePathIfExists = (targetPath: string) => {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
};

const uploadChunkedDatabase = async (
  dbPath: string,
  runDate: string,
  source: 'manual_upload' | 'scheduled_backup'
): Promise<CloudBackupResult> => {
  const originalBytes = fs.statSync(dbPath).size;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tcgtracker-cloud-'));
  const gzipPath = path.join(tempRoot, 'database.db.gz');
  const chunkDir = path.join(tempRoot, 'chunks');

  try {
    await compressDatabaseToGzip(dbPath, gzipPath);
    const compressedBytes = fs.statSync(gzipPath).size;
    const chunkPaths = splitFileIntoChunks(gzipPath, MAX_CHUNK_BYTES, chunkDir);

    const latestPrefix = 'latest/chunks';
    const backupPrefix = `backups/tcg-prices-${runDate}/chunks`;

    for (let i = 0; i < chunkPaths.length; i += 1) {
      const chunkName = `${String(i).padStart(4, '0')}.part`;
      await uploadFileObject(`${latestPrefix}/${chunkName}`, chunkPaths[i], 'application/octet-stream');
      await uploadFileObject(`${backupPrefix}/${chunkName}`, chunkPaths[i], 'application/octet-stream');
    }

    const manifest: ChunkedBackupManifest = {
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
    await uploadObject('latest/manifest.json', manifestJson, 'application/json');
    await uploadObject(`backups/tcg-prices-${runDate}/manifest.json`, manifestJson, 'application/json');

    const metadata = {
      runDate,
      generatedAt: manifest.generatedAt,
      databasePath: path.basename(dbPath),
      databaseBytes: originalBytes,
      compressedBytes,
      chunkCount: chunkPaths.length,
      source,
      format: manifest.format,
    };
    const metadataJson = JSON.stringify(metadata, null, 2);
    await uploadObject(`metadata/backup-${runDate}.json`, metadataJson, 'application/json');
    await uploadObject('metadata/latest.json', metadataJson, 'application/json');

    return {
      enabled: true,
      uploaded: true,
      message: `Uploaded ${(originalBytes / 1024 / 1024).toFixed(1)} MB DB as ${chunkPaths.length} compressed chunks (${(compressedBytes / 1024 / 1024).toFixed(1)} MB gzip).`,
      backupKey: `backups/tcg-prices-${runDate}/manifest.json`,
      latestKey: 'latest/manifest.json',
    };
  } finally {
    removePathIfExists(tempRoot);
  }
};

const restoreFromChunkedManifest = async (manifest: ChunkedBackupManifest): Promise<CloudRestoreResult> => {
  const dbPath = getDatabasePath();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tcgtracker-restore-'));
  const gzipPath = path.join(tempRoot, 'database.db.gz');

  try {
    const gzipFd = fs.openSync(gzipPath, 'w');
    try {
      for (let i = 0; i < manifest.chunkCount; i += 1) {
        const chunkName = `${String(i).padStart(4, '0')}.part`;
        const chunkKey = `${manifest.prefix}${chunkName}`;
        logger.info('Downloading cloud chunk', { chunkKey, index: i + 1, total: manifest.chunkCount });
        const chunk = await downloadObject(chunkKey);
        fs.writeSync(gzipFd, chunk);
      }
    } finally {
      fs.closeSync(gzipFd);
    }

    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    for (const sidecar of [walPath, shmPath]) {
      if (fs.existsSync(sidecar)) {
        fs.unlinkSync(sidecar);
      }
    }

    await pipeline(fs.createReadStream(gzipPath), createGunzip(), fs.createWriteStream(dbPath));
    const restoredBytes = fs.statSync(dbPath).size;

    return {
      enabled: true,
      restored: true,
      message: `Restored ${(restoredBytes / 1024 / 1024).toFixed(1)} MB from ${manifest.chunkCount} cloud chunks. Restart the server.`,
      latestKey: 'latest/manifest.json',
      databaseBytes: restoredBytes,
    };
  } finally {
    removePathIfExists(tempRoot);
  }
};

export const isCloudConfigured = () =>
  env.cloud.enabled &&
  Boolean(env.cloud.supabaseUrl) &&
  Boolean(env.cloud.serviceRoleKey) &&
  Boolean(env.cloud.bucket);

export const uploadDatabaseFileToCloud = async (
  dbPath: string,
  runDate: string
): Promise<CloudBackupResult> => {
  if (!isCloudConfigured()) {
    return {
      enabled: false,
      uploaded: false,
      message: 'Cloud sync disabled or Supabase credentials missing.',
    };
  }

  const resolvedPath = path.resolve(dbPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      enabled: true,
      uploaded: false,
      message: `Database file not found: ${resolvedPath}`,
    };
  }

  return uploadChunkedDatabase(resolvedPath, runDate, 'manual_upload');
};

export interface CloudRestoreResult {
  enabled: boolean;
  restored: boolean;
  message: string;
  latestKey?: string;
  databaseBytes?: number;
}

export const restoreDatabaseFromCloud = async (
  objectKey = 'latest/manifest.json'
): Promise<CloudRestoreResult> => {
  if (!isCloudConfigured()) {
    return {
      enabled: false,
      restored: false,
      message: 'Cloud sync disabled or Supabase credentials missing.',
    };
  }

  if (objectKey.endsWith('manifest.json')) {
    try {
      const manifestBuffer = await downloadObject('latest/manifest.json');
      const manifest = JSON.parse(manifestBuffer.toString('utf8')) as ChunkedBackupManifest;
      if (manifest.format === 'gzip-chunks') {
        return restoreFromChunkedManifest(manifest);
      }
    } catch (error) {
      logger.warn('Chunked manifest restore unavailable, trying legacy single-file backup', {
        error: (error as Error).message,
      });
    }
  }

  const dbPath = getDatabasePath();
  const legacyKey = objectKey.endsWith('.db') ? objectKey : 'latest/tcg-prices-latest.db';
  const dbBuffer = await downloadObject(legacyKey);

  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  for (const sidecar of [walPath, shmPath]) {
    if (fs.existsSync(sidecar)) {
      fs.unlinkSync(sidecar);
    }
  }

  fs.writeFileSync(dbPath, dbBuffer);

  return {
    enabled: true,
    restored: true,
    message: `Restored ${(dbBuffer.length / 1024 / 1024).toFixed(1)} MB from ${legacyKey}. Restart the server.`,
    latestKey: legacyKey,
    databaseBytes: dbBuffer.length,
  };
};

const getBackupMetadata = async (runDate: string) => {
  const db = getDb();
  const summary = await new Promise<any>((resolve, reject) => {
    db.get(
      `SELECT
        (SELECT COUNT(*) FROM price_history) AS totalPriceRows,
        (SELECT COUNT(*) FROM card_mappings) AS totalMappings,
        (SELECT COUNT(*) FROM catalog_cards) AS totalCatalogCards,
        (SELECT MAX(date) FROM price_history) AS latestPriceDate`,
      [],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || {});
      }
    );
  });

  const dbPath = getDatabasePath();
  const fileStats = fs.statSync(dbPath);

  return {
    runDate,
    generatedAt: new Date().toISOString(),
    databasePath: path.basename(dbPath),
    databaseBytes: fileStats.size,
    summary,
  };
};

export const backupDatabaseToCloud = async (runDate: string): Promise<CloudBackupResult> => {
  if (!isCloudConfigured()) {
    return {
      enabled: false,
      uploaded: false,
      message: 'Cloud sync disabled or Supabase credentials missing.',
    };
  }

  try {
    const dbPath = getDatabasePath();
    const result = await uploadChunkedDatabase(dbPath, runDate, 'scheduled_backup');
    logger.info('Cloud database backup uploaded successfully', {
      backupKey: result.backupKey,
      latestKey: result.latestKey,
      message: result.message,
    });
    return result;
  } catch (error) {
    logger.error('Cloud database backup failed', { error: (error as Error).message });
    return {
      enabled: true,
      uploaded: false,
      message: `Cloud backup failed: ${(error as Error).message}`,
    };
  }
};

export const getCloudBackupStatus = async () => {
  if (!isCloudConfigured()) {
    return {
      enabled: false,
      provider: 'supabase-storage',
      bucket: env.cloud.bucket,
      configured: false,
      message: 'Set CLOUD_SYNC_ENABLED=true and SUPABASE credentials to enable cloud backups.',
    };
  }

  const db = getDb();
  const lastRun = await new Promise<any>((resolve, reject) => {
    db.get(
      `SELECT runDate, status, startedAt, completedAt, message
       FROM sync_runs
       WHERE runType = 'price_update'
       ORDER BY id DESC
       LIMIT 1`,
      [],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });

  return {
    enabled: true,
    configured: true,
    provider: 'supabase-storage',
    bucket: env.cloud.bucket,
    format: 'gzip-chunks',
    maxChunkMb: MAX_CHUNK_BYTES / 1024 / 1024,
    lastPriceUpdate: lastRun,
  };
};
