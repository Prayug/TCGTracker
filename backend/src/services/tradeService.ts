import { randomBytes } from 'crypto';
import { getDb } from '../db/database';

export interface TradePayload {
  v: 1;
  g: 'pokemon' | 'onepiece';
  t?: string;
  a: unknown[];
  b: unknown[];
  ca: number;
  cb: number;
}

export interface TradeRecord {
  id: string;
  userId: number;
  shareToken: string;
  title: string;
  game: 'pokemon' | 'onepiece';
  payload: TradePayload;
  giveTotal: number;
  getTotal: number;
  createdAt: string;
  updatedAt: string;
}

interface TradeRow {
  id: string;
  user_id: number;
  share_token: string;
  title: string;
  game: 'pokemon' | 'onepiece';
  payload_json: string;
  give_total: number;
  get_total: number;
  created_at: string;
  updated_at: string;
}

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    getDb().run(sql, params, (err) => (err ? reject(err) : resolve()));
  });

const get = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []) as T[])));
  });

function newShareToken(): string {
  return randomBytes(9).toString('base64url');
}

function rowToRecord(row: TradeRow): TradeRecord {
  return {
    id: row.id,
    userId: row.user_id,
    shareToken: row.share_token,
    title: row.title,
    game: row.game,
    payload: JSON.parse(row.payload_json) as TradePayload,
    giveTotal: row.give_total,
    getTotal: row.get_total,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTradesForUser(userId: number): Promise<TradeRecord[]> {
  const rows = await all<TradeRow>(
    `SELECT * FROM trades WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`,
    [userId]
  );
  return rows.map(rowToRecord);
}

export async function getTradeByShareToken(token: string): Promise<TradeRecord | null> {
  const row = await get<TradeRow>(`SELECT * FROM trades WHERE share_token = ?`, [token]);
  return row ? rowToRecord(row) : null;
}

export async function upsertTrade(input: {
  userId: number;
  id?: string;
  title?: string;
  game: 'pokemon' | 'onepiece';
  payload: TradePayload;
  giveTotal: number;
  getTotal: number;
}): Promise<TradeRecord> {
  const title = (input.title || input.payload.t || '').slice(0, 120);
  if (input.id) {
    const existing = await get<TradeRow>(`SELECT * FROM trades WHERE id = ? AND user_id = ?`, [
      input.id,
      input.userId,
    ]);
    if (existing) {
      await run(
        `UPDATE trades
         SET title = ?, game = ?, payload_json = ?, give_total = ?, get_total = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
        [
          title,
          input.game,
          JSON.stringify(input.payload),
          input.giveTotal,
          input.getTotal,
          input.id,
          input.userId,
        ]
      );
      const updated = await get<TradeRow>(`SELECT * FROM trades WHERE id = ?`, [input.id]);
      return rowToRecord(updated!);
    }
  }

  const id = input.id || randomBytes(16).toString('hex');
  const shareToken = newShareToken();
  await run(
    `INSERT INTO trades (id, user_id, share_token, title, game, payload_json, give_total, get_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.userId, shareToken, title, input.game, JSON.stringify(input.payload), input.giveTotal, input.getTotal]
  );
  const created = await get<TradeRow>(`SELECT * FROM trades WHERE id = ?`, [id]);
  return rowToRecord(created!);
}

export async function deleteTrade(userId: number, id: string): Promise<boolean> {
  const existing = await get<{ id: string }>(`SELECT id FROM trades WHERE id = ? AND user_id = ?`, [
    id,
    userId,
  ]);
  if (!existing) return false;
  await run(`DELETE FROM trades WHERE id = ? AND user_id = ?`, [id, userId]);
  return true;
}

export function toClientTrade(record: TradeRecord) {
  return {
    id: record.id,
    shareToken: record.shareToken,
    title: record.title,
    game: record.game,
    payload: record.payload,
    giveTotal: record.giveTotal,
    getTotal: record.getTotal,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
