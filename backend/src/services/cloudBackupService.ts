import fs from 'fs';
import path from 'path';
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

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, '');

const toStorageObjectPath = (objectKey: string): string =>
  objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const isCloudConfigured = () =>
  env.cloud.enabled &&
  Boolean(env.cloud.supabaseUrl) &&
  Boolean(env.cloud.serviceRoleKey) &&
  Boolean(env.cloud.bucket);

const uploadObject = async (
  objectKey: string,
  body: Buffer | string,
  contentType: string
) => {
  if (!env.cloud.supabaseUrl || !env.cloud.serviceRoleKey) {
    throw new Error('Supabase cloud sync is not configured');
  }

  const storagePath = toStorageObjectPath(objectKey);
  const url = `${normalizeBaseUrl(env.cloud.supabaseUrl)}/storage/v1/object/${env.cloud.bucket}/${storagePath}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.cloud.serviceRoleKey}`,
      apikey: env.cloud.serviceRoleKey,
      'x-upsert': 'true',
      'Content-Type': contentType,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Cloud upload failed (${response.status}): ${errorText}`);
  }
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
    const dbBuffer = fs.readFileSync(dbPath);
    const backupKey = `backups/tcg-prices-${runDate}.db`;
    const latestKey = 'latest/tcg-prices-latest.db';
    const metadataKey = `metadata/backup-${runDate}.json`;
    const latestMetadataKey = 'metadata/latest.json';

    await uploadObject(backupKey, dbBuffer, 'application/x-sqlite3');
    await uploadObject(latestKey, dbBuffer, 'application/x-sqlite3');

    const metadata = await getBackupMetadata(runDate);
    const metadataJson = JSON.stringify(metadata, null, 2);
    await uploadObject(metadataKey, metadataJson, 'application/json');
    await uploadObject(latestMetadataKey, metadataJson, 'application/json');

    logger.info('Cloud database backup uploaded successfully', {
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
    lastPriceUpdate: lastRun,
  };
};
