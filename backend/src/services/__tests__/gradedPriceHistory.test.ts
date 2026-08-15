import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';

/**
 * Lightweight persistence check for graded_price_history upserts.
 * Uses a throwaway sqlite file so we don't need the full app DB bootstrap.
 */
describe('graded price history schema', () => {
  let dbPath = '';
  let db: sqlite3.Database;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `graded-hist-${Date.now()}.db`);
    db = new sqlite3.Database(dbPath);
    await new Promise<void>((resolve, reject) => {
      db.exec(
        `CREATE TABLE graded_price_history (
          cardId TEXT NOT NULL,
          variantKey TEXT NOT NULL DEFAULT 'normal',
          date TEXT NOT NULL,
          grader TEXT NOT NULL,
          grade TEXT NOT NULL,
          price REAL,
          soldListings INTEGER DEFAULT 0,
          productId TEXT,
          verified INTEGER DEFAULT 0,
          sourceUrl TEXT,
          source TEXT NOT NULL DEFAULT 'pricecharting',
          PRIMARY KEY (cardId, variantKey, date, grader, grade)
        )`,
        (err) => (err ? reject(err) : resolve())
      );
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => db.close(() => resolve()));
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it('upserts one row per card/variant/day/grader/grade', async () => {
    const run = (sql: string, params: unknown[] = []) =>
      new Promise<void>((resolve, reject) => {
        db.run(sql, params, (err) => (err ? reject(err) : resolve()));
      });
    const all = <T>(sql: string, params: unknown[] = []) =>
      new Promise<T[]>((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
      });

    const upsert = `
      INSERT INTO graded_price_history
        (cardId, variantKey, date, grader, grade, price, soldListings, productId, verified, sourceUrl, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pricecharting')
      ON CONFLICT(cardId, variantKey, date, grader, grade) DO UPDATE SET
        price = excluded.price,
        soldListings = excluded.soldListings
    `;

    await run(upsert, ['card-1', 'reverseholofoil', '2026-08-10', 'psa', '10', 100, 5, 'pc1', 1, 'https://x']);
    await run(upsert, ['card-1', 'reverseholofoil', '2026-08-10', 'psa', '10', 110, 6, 'pc1', 1, 'https://x']);
    await run(upsert, ['card-1', 'reverseholofoil', '2026-08-11', 'psa', '10', 120, 7, 'pc1', 1, 'https://x']);
    await run(upsert, ['card-1', 'normal', '2026-08-10', 'psa', '10', 20, 2, 'pc2', 1, 'https://y']);

    const reverse = await all<{ date: string; price: number }>(
      `SELECT date, price FROM graded_price_history
       WHERE cardId = ? AND variantKey = 'reverseholofoil' AND grader = 'psa' AND grade = '10'
       ORDER BY date`,
      ['card-1']
    );
    const unlimited = await all<{ date: string; price: number }>(
      `SELECT date, price FROM graded_price_history
       WHERE cardId = ? AND variantKey = 'normal' AND grader = 'psa' AND grade = '10'
       ORDER BY date`,
      ['card-1']
    );

    expect(reverse).toEqual([
      { date: '2026-08-10', price: 110 },
      { date: '2026-08-11', price: 120 },
    ]);
    expect(unlimited).toEqual([{ date: '2026-08-10', price: 20 }]);
  });
});
