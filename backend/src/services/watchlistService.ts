import { Database } from 'sqlite3';
import { allDbRows, getDbRow, runDb } from '../utils/dbAsync';

export type WatchlistKind = 'watchlist' | 'wishlist' | 'tracked';

export interface WatchlistEntry {
  id: number;
  user_id: number;
  card_id: string;
  card_name: string;
  game: string;
  list_type: WatchlistKind;
  priority: string | null;
  target_price: number | null;
  notes: string | null;
  card_data: string | null;
  client_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchlistSyncItem {
  id: string;
  cardId: string;
  cardName: string;
  game?: string;
  listType: WatchlistKind;
  priority?: string;
  targetPrice?: number;
  notes?: string;
  card?: unknown;
  addedAt?: string;
  initialPrice?: number;
}

export class WatchlistService {
  constructor(private db: Database) {}

  async ensureSchema(): Promise<void> {
    await runDb(
      this.db,
      `CREATE TABLE IF NOT EXISTS user_watchlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        card_id TEXT NOT NULL,
        card_name TEXT NOT NULL,
        game TEXT NOT NULL DEFAULT 'pokemon',
        list_type TEXT NOT NULL CHECK(list_type IN ('watchlist', 'wishlist', 'tracked')),
        priority TEXT,
        target_price REAL,
        notes TEXT,
        card_data TEXT,
        client_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, card_id, list_type, game),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    );
    await runDb(
      this.db,
      'CREATE INDEX IF NOT EXISTS idx_user_watchlists_user ON user_watchlists(user_id)'
    );
    await runDb(
      this.db,
      'CREATE INDEX IF NOT EXISTS idx_user_watchlists_type ON user_watchlists(list_type)'
    );
  }

  async getForUser(userId: number, listType?: WatchlistKind): Promise<WatchlistEntry[]> {
    if (listType) {
      return allDbRows<WatchlistEntry>(
        this.db,
        'SELECT * FROM user_watchlists WHERE user_id = ? AND list_type = ? ORDER BY updated_at DESC',
        [userId, listType]
      );
    }
    return allDbRows<WatchlistEntry>(
      this.db,
      'SELECT * FROM user_watchlists WHERE user_id = ? ORDER BY list_type, updated_at DESC',
      [userId]
    );
  }

  /**
   * Full-replace sync scoped to the list_types present in `items`.
   * Other list types for the user are left untouched so wishlist/tracked
   * can sync independently.
   */
  async syncForUser(userId: number, items: WatchlistSyncItem[]): Promise<WatchlistEntry[]> {
    const types = [...new Set(items.map((i) => i.listType))];
    await runDb(this.db, 'BEGIN IMMEDIATE');
    try {
      if (types.length === 0) {
        // Empty payload with no types → clear nothing; callers that want a
        // full wipe should send an explicit listType wipe via remove APIs.
      } else {
        const placeholders = types.map(() => '?').join(',');
        await runDb(
          this.db,
          `DELETE FROM user_watchlists WHERE user_id = ? AND list_type IN (${placeholders})`,
          [userId, ...types]
        );
      }
      for (const item of items) {
        await runDb(
          this.db,
          `INSERT INTO user_watchlists
             (user_id, card_id, card_name, game, list_type, priority, target_price, notes, card_data, client_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            item.cardId,
            item.cardName,
            item.game || 'pokemon',
            item.listType,
            item.priority ?? null,
            item.targetPrice ?? item.initialPrice ?? null,
            item.notes ?? null,
            item.card ? JSON.stringify(item) : null,
            item.id,
          ]
        );
      }
      await runDb(this.db, 'COMMIT');
    } catch (error) {
      await runDb(this.db, 'ROLLBACK');
      throw error;
    }
    return this.getForUser(userId);
  }

  async upsert(
    userId: number,
    item: WatchlistSyncItem
  ): Promise<WatchlistEntry> {
    await runDb(
      this.db,
      `INSERT INTO user_watchlists
         (user_id, card_id, card_name, game, list_type, priority, target_price, notes, card_data, client_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, card_id, list_type, game) DO UPDATE SET
         card_name = excluded.card_name,
         priority = excluded.priority,
         target_price = excluded.target_price,
         notes = excluded.notes,
         card_data = excluded.card_data,
         client_id = excluded.client_id,
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        item.cardId,
        item.cardName,
        item.game || 'pokemon',
        item.listType,
        item.priority ?? null,
        item.targetPrice ?? item.initialPrice ?? null,
        item.notes ?? null,
        item.card ? JSON.stringify(item) : null,
        item.id,
      ]
    );
    const row = await getDbRow<WatchlistEntry>(
      this.db,
      `SELECT * FROM user_watchlists
       WHERE user_id = ? AND card_id = ? AND list_type = ? AND game = ?`,
      [userId, item.cardId, item.listType, item.game || 'pokemon']
    );
    if (!row) throw new Error('Failed to upsert watchlist item');
    return row;
  }

  async remove(
    userId: number,
    cardId: string,
    listType: WatchlistKind,
    game = 'pokemon'
  ): Promise<void> {
    await runDb(
      this.db,
      'DELETE FROM user_watchlists WHERE user_id = ? AND card_id = ? AND list_type = ? AND game = ?',
      [userId, cardId, listType, game]
    );
  }

  async wipeListTypes(userId: number, listTypes: WatchlistKind[]): Promise<void> {
    if (listTypes.length === 0) return;
    const placeholders = listTypes.map(() => '?').join(',');
    await runDb(
      this.db,
      `DELETE FROM user_watchlists WHERE user_id = ? AND list_type IN (${placeholders})`,
      [userId, ...listTypes]
    );
  }
}
