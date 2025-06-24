import fs from 'fs';
import path from 'path';
import { getDb } from './db/database';
import { CardIdentifier } from './services/cardIdentifier';

const db = getDb();
// Note: Vite serves from the root of the TCGTracker project, so we navigate up from the backend directory.
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const PRICES_DIR = path.join(DATA_DIR, 'prices');

const exportStaticData = async () => {
  console.log('Starting static data export...');

  try {
    // 1. Create directories if they don't exist
    if (!fs.existsSync(PRICES_DIR)) {
      fs.mkdirSync(PRICES_DIR, { recursive: true });
      console.log(`Created data directories at ${DATA_DIR}`);
    }

    // 2. Get all card mappings
    const mappings = await new Promise<CardIdentifier[]>((resolve, reject) => {
      db.all('SELECT * FROM card_mappings', [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows as CardIdentifier[]);
      });
    });
    console.log(`Found ${mappings.length} card mappings.`);

    // 3. Write mappings to JSON
    fs.writeFileSync(path.join(DATA_DIR, 'mappings.json'), JSON.stringify(mappings, null, 2));
    console.log('Exported card mappings to mappings.json');

    // 4. Export price history for each card
    let exportedCount = 0;
    for (const mapping of mappings) {
      if (!mapping.uniqueIdentifier) continue;

      const history = await new Promise<any[]>((resolve, reject) => {
        db.all('SELECT date, price, subTypeName, lowPrice, highPrice, marketPrice FROM price_history WHERE uniqueIdentifier = ? ORDER BY date ASC', [mapping.uniqueIdentifier], (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });

      if (history.length > 0) {
        const fileName = `${mapping.uniqueIdentifier}.json`;
        fs.writeFileSync(path.join(PRICES_DIR, fileName), JSON.stringify(history, null, 2));
        exportedCount++;
      }
    }

    console.log(`Exported price history for ${exportedCount} of ${mappings.length} cards.`);
    console.log('Static data export complete!');
  } catch (error) {
    console.error('Failed to export static data:', error);
  } finally {
    db.close(err => {
      if (err) console.error('Error closing database:', err);
    });
  }
};

exportStaticData(); 