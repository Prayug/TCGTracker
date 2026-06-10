import { Database } from 'sqlite3';
import { allDbRows, getDbRow, runDb } from '../utils/dbAsync';

export interface PortfolioItem {
  id: number;
  user_id: number;
  card_id: string;
  card_name: string;
  quantity: number;
  purchase_price?: number;
  purchase_date?: string;
  condition?: string;
  notes?: string;
  card_data?: string | null;
  client_vault_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaultSyncEntry {
  id: string;
  card: unknown;
  purchasePrice: number;
  purchaseDate: string;
  quantity: number;
  condition: string;
  notes?: string;
}

export interface PortfolioStats {
  totalCards: number;
  totalValue: number;
  totalInvestment: number;
  profitLoss: number;
  profitLossPercentage: number;
  topGainers: Array<{ card_name: string; gain: number; gainPercentage: number }>;
  topLosers: Array<{ card_name: string; loss: number; lossPercentage: number }>;
}

export class PortfolioService {
  constructor(private db: Database) {}

  async addToCollection(
    userId: number,
    cardId: string,
    cardName: string,
    quantity = 1,
    purchasePrice?: number,
    purchaseDate?: string,
    condition?: string,
    notes?: string,
    cardData?: string,
    clientVaultId?: string
  ): Promise<PortfolioItem> {
    const { lastID } = await runDb(
      this.db,
      `INSERT INTO user_collections
         (user_id, card_id, card_name, quantity, purchase_price, purchase_date, condition, notes, card_data, client_vault_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, card_id, condition) DO UPDATE SET
         quantity = excluded.quantity,
         purchase_price = excluded.purchase_price,
         purchase_date = excluded.purchase_date,
         notes = excluded.notes,
         card_data = excluded.card_data,
         client_vault_id = excluded.client_vault_id,
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        cardId,
        cardName,
        quantity,
        purchasePrice ?? null,
        purchaseDate ?? null,
        condition ?? null,
        notes ?? null,
        cardData ?? null,
        clientVaultId ?? null,
      ]
    );

    const row = await this.getItemById(lastID, userId);
    if (!row) throw new Error('Failed to load created portfolio item');
    return row;
  }

  async getItemById(itemId: number, userId: number): Promise<PortfolioItem | undefined> {
    return getDbRow<PortfolioItem>(
      this.db,
      'SELECT * FROM user_collections WHERE id = ? AND user_id = ?',
      [itemId, userId]
    );
  }

  async getCollection(userId: number): Promise<PortfolioItem[]> {
    return allDbRows<PortfolioItem>(
      this.db,
      'SELECT * FROM user_collections WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
  }

  async syncVault(userId: number, cards: VaultSyncEntry[]): Promise<PortfolioItem[]> {
    await runDb(this.db, 'BEGIN IMMEDIATE');
    try {
      await runDb(this.db, 'DELETE FROM user_collections WHERE user_id = ?', [userId]);

      for (const entry of cards) {
        const card = entry.card as { id?: string; name?: string };
        await runDb(
          this.db,
          `INSERT INTO user_collections
             (user_id, card_id, card_name, quantity, purchase_price, purchase_date, condition, notes, card_data, client_vault_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            card?.id || entry.id,
            card?.name || 'Unknown',
            entry.quantity,
            entry.purchasePrice,
            entry.purchaseDate,
            entry.condition,
            entry.notes ?? null,
            JSON.stringify(entry),
            entry.id,
          ]
        );
      }

      await runDb(this.db, 'COMMIT');
    } catch (error) {
      await runDb(this.db, 'ROLLBACK');
      throw error;
    }

    return this.getCollection(userId);
  }

  async updateItem(
    itemId: number,
    userId: number,
    updates: Partial<Omit<PortfolioItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(itemId, userId);

    await runDb(
      this.db,
      `UPDATE user_collections SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );
  }

  async removeFromCollection(itemId: number, userId: number): Promise<void> {
    await runDb(this.db, 'DELETE FROM user_collections WHERE id = ? AND user_id = ?', [
      itemId,
      userId,
    ]);
  }

  async getPortfolioStats(userId: number): Promise<PortfolioStats> {
    const collection = await this.getCollection(userId);

    let totalCards = 0;
    let totalInvestment = 0;
    let totalValue = 0;

    const cardPerformance: Array<{ card_name: string; gain: number; gainPercentage: number }> = [];

    collection.forEach((item) => {
      totalCards += item.quantity;
      const purchasePrice = item.purchase_price || 0;
      totalInvestment += purchasePrice * item.quantity;

      let currentPrice = purchasePrice;
      if (item.card_data) {
        try {
          const parsed = JSON.parse(item.card_data) as VaultSyncEntry;
          const market = (parsed.card as { marketPrice?: number })?.marketPrice;
          if (market && market > 0) currentPrice = market;
        } catch {
          /* use purchase price */
        }
      }

      totalValue += currentPrice * item.quantity;
      const gain = (currentPrice - purchasePrice) * item.quantity;
      const gainPercentage = purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0;

      cardPerformance.push({ card_name: item.card_name, gain, gainPercentage });
    });

    const profitLoss = totalValue - totalInvestment;
    const profitLossPercentage = totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0;

    cardPerformance.sort((a, b) => b.gainPercentage - a.gainPercentage);

    return {
      totalCards,
      totalValue,
      totalInvestment,
      profitLoss,
      profitLossPercentage,
      topGainers: cardPerformance.filter((p) => p.gain > 0).slice(0, 5),
      topLosers: cardPerformance
        .filter((p) => p.gain < 0)
        .map((p) => ({
          card_name: p.card_name,
          loss: Math.abs(p.gain),
          lossPercentage: Math.abs(p.gainPercentage),
        }))
        .slice(0, 5),
    };
  }
}
