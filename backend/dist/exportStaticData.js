"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const database_1 = require("./db/database");
const db = (0, database_1.getDb)();
// Note: Vite serves from the root of the TCGTracker project, so we navigate up from the backend directory.
const PUBLIC_DIR = path_1.default.join(__dirname, '..', '..', 'public');
const DATA_DIR = path_1.default.join(PUBLIC_DIR, 'data');
const PRICES_DIR = path_1.default.join(DATA_DIR, 'prices');
const exportStaticData = async () => {
    console.log('Starting static data export...');
    try {
        // 1. Create directories if they don't exist
        if (!fs_1.default.existsSync(PRICES_DIR)) {
            fs_1.default.mkdirSync(PRICES_DIR, { recursive: true });
            console.log(`Created data directories at ${DATA_DIR}`);
        }
        // 2. Get all card mappings
        const mappings = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM card_mappings', [], (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows);
            });
        });
        console.log(`Found ${mappings.length} card mappings.`);
        // 3. Write mappings to JSON
        fs_1.default.writeFileSync(path_1.default.join(DATA_DIR, 'mappings.json'), JSON.stringify(mappings, null, 2));
        console.log('Exported card mappings to mappings.json');
        // 4. Export price history for each card
        let exportedCount = 0;
        for (const mapping of mappings) {
            if (!mapping.uniqueIdentifier)
                continue;
            const history = await new Promise((resolve, reject) => {
                db.all('SELECT date, price, subTypeName, lowPrice, highPrice, marketPrice FROM price_history WHERE uniqueIdentifier = ? ORDER BY date ASC', [mapping.uniqueIdentifier], (err, rows) => {
                    if (err)
                        return reject(err);
                    resolve(rows);
                });
            });
            if (history.length > 0) {
                const fileName = `${mapping.uniqueIdentifier}.json`;
                fs_1.default.writeFileSync(path_1.default.join(PRICES_DIR, fileName), JSON.stringify(history, null, 2));
                exportedCount++;
            }
        }
        // 5. Create a unified file with the latest price for every card
        const latestPrices = {};
        for (const mapping of mappings) {
            if (!mapping.uniqueIdentifier)
                continue;
            const history = await new Promise((resolve, reject) => {
                db.all('SELECT date, price FROM price_history WHERE uniqueIdentifier = ? ORDER BY date DESC LIMIT 1', [mapping.uniqueIdentifier], (err, rows) => {
                    if (err)
                        return reject(err);
                    resolve(rows);
                });
            });
            if (history.length > 0) {
                latestPrices[mapping.uniqueIdentifier] = history[0];
            }
        }
        fs_1.default.writeFileSync(path_1.default.join(DATA_DIR, 'latest-prices.json'), JSON.stringify(latestPrices, null, 2));
        console.log('Exported latest prices to latest-prices.json');
        console.log(`Exported price history for ${exportedCount} of ${mappings.length} cards.`);
        console.log('Static data export complete!');
    }
    catch (error) {
        console.error('Failed to export static data:', error);
    }
    finally {
        db.close(err => {
            if (err)
                console.error('Error closing database:', err);
        });
    }
};
exportStaticData();
