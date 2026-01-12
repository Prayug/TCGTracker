/**
 * One-time upload of the local SQLite database to Supabase Storage.
 *
 * Requires in backend/.env:
 *   CLOUD_SYNC_ENABLED=true
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Usage: npm run upload-db-to-cloud
 */
import path from 'path';
import fs from 'fs';
import { uploadDatabaseFileToCloud } from '../services/cloudBackupService';

const runDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './tcg-prices.db');

async function main() {
  const sizeMb = (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1);
  console.log(`Uploading ${dbPath} (${sizeMb} MB) to Supabase...`);
  console.log('Compressing and uploading in <50 MB chunks (Supabase limit). This may take 15–30 minutes.');
  const result = await uploadDatabaseFileToCloud(dbPath, runDate);
  console.log(JSON.stringify(result, null, 2));
  if (!result.uploaded) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
