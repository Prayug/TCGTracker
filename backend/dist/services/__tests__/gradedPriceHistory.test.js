"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const sqlite3_1 = __importDefault(require("sqlite3"));
/**
 * Lightweight persistence check for graded_price_history upserts.
 * Uses a throwaway sqlite file so we don't need the full app DB bootstrap.
 */
(0, vitest_1.describe)('graded price history schema', () => {
    let dbPath = '';
    let db;
    (0, vitest_1.beforeEach)(async () => {
        dbPath = path_1.default.join(os_1.default.tmpdir(), `graded-hist-${Date.now()}.db`);
        db = new sqlite3_1.default.Database(dbPath);
        await new Promise((resolve, reject) => {
            db.exec(`CREATE TABLE graded_price_history (
          cardId TEXT NOT NULL,
          date TEXT NOT NULL,
          grader TEXT NOT NULL,
          grade TEXT NOT NULL,
          price REAL,
          soldListings INTEGER DEFAULT 0,
          productId TEXT,
          verified INTEGER DEFAULT 0,
          sourceUrl TEXT,
          source TEXT NOT NULL DEFAULT 'pricecharting',
          PRIMARY KEY (cardId, date, grader, grade)
        )`, (err) => (err ? reject(err) : resolve()));
        });
    });
    (0, vitest_1.afterEach)(async () => {
        await new Promise((resolve) => db.close(() => resolve()));
        try {
            fs_1.default.unlinkSync(dbPath);
        }
        catch (_a) {
            /* ignore */
        }
    });
    (0, vitest_1.it)('upserts one row per card/day/grader/grade', async () => {
        const run = (sql, params = []) => new Promise((resolve, reject) => {
            db.run(sql, params, (err) => (err ? reject(err) : resolve()));
        });
        const all = (sql, params = []) => new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
        });
        const upsert = `
      INSERT INTO graded_price_history
        (cardId, date, grader, grade, price, soldListings, productId, verified, sourceUrl, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pricecharting')
      ON CONFLICT(cardId, date, grader, grade) DO UPDATE SET
        price = excluded.price,
        soldListings = excluded.soldListings
    `;
        await run(upsert, ['card-1', '2026-08-10', 'psa', '10', 100, 5, 'pc1', 1, 'https://x']);
        await run(upsert, ['card-1', '2026-08-10', 'psa', '10', 110, 6, 'pc1', 1, 'https://x']);
        await run(upsert, ['card-1', '2026-08-11', 'psa', '10', 120, 7, 'pc1', 1, 'https://x']);
        const rows = await all(`SELECT date, price FROM graded_price_history WHERE cardId = ? AND grader = 'psa' AND grade = '10' ORDER BY date`, ['card-1']);
        (0, vitest_1.expect)(rows).toEqual([
            { date: '2026-08-10', price: 110 },
            { date: '2026-08-11', price: 120 },
        ]);
    });
});
