/**
 * Download latest/tcg-prices-latest.db from Supabase and replace the local DB file.
 * Stop the backend server before running. Restart after completion.
 *
 * Usage: npm run restore-db-from-cloud
 */
import { restoreDatabaseFromCloud } from '../services/cloudBackupService';

async function main() {
  console.log('Downloading latest database from Supabase...');
  const result = await restoreDatabaseFromCloud();
  console.log(JSON.stringify(result, null, 2));
  if (!result.restored) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
