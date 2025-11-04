import { Database } from 'sqlite3';
import { logger } from '../utils/logger';

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
  created_at: string;
  updated_at: string;
}

export interface PortfolioStats {
  totalCards: number;
  totalValue: number;
  totalInvestment: number;
  profitLoss: number;
  profitLossPercentage: number;
  topGainers: Array<{
    card_name: string;
    gain: number;
    gainPercentage: number;
  }>;
  topLosers: Array<{
    card_name: string;
    loss: number;
    lossPercentage: number;
  }>;
}

export class PortfolioService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async addToCollection(
    userId: number,
    cardId: string,
    cardName: string,
    quantity: number = 1,
    purchasePrice?: number,
    purchaseDate?: string,
    condition?: string,
    notes?: string
  ): Promise<PortfolioItem> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO user_collections (user_id, card_id, card_name, quantity, purchase_price, purchase_date, condition, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, card_id, condition) DO UPDATE SET
           quantity = quantity + excluded.quantity,
           updated_at = CURRENT_TIMESTAMP`,
        [userId, cardId, cardName, quantity, purchasePrice, purchaseDate, condition, notes],
        function (this: any, err: Error | null) {
          if (err) return reject(err);

          const itemId = this.lastID;
          resolve({
            id: itemId,
            user_id: userId,
            card_id: cardId,
            card_name: cardName,
            quantity,
            purchase_price: purchasePrice,
            purchase_date: purchaseDate,
            condition,
            notes,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      );
    });
  }

  async getCollection(userId: number): Promise<PortfolioItem[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM user_collections WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err: Error | null, rows: PortfolioItem[]) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });
  }

  async updateItem(
    itemId: number,
    userId: number,
    updates: Partial<Omit<PortfolioItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(itemId, userId);

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE user_collections SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
        values,
        (err: Error | null) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  async removeFromCollection(itemId: number, userId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM user_collections WHERE id = ? AND user_id = ?',
        [itemId, userId],
        (err: Error | null) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  async getPortfolioStats(userId: number): Promise<PortfolioStats> {
    return new Promise(async (resolve, reject) => {
      try {
        const collection = await this.getCollection(userId);

        let totalCards = 0;
        let totalInvestment = 0;
        let totalValue = 0; // This would come from current market prices

        const cardPerformance: Array<{
          card_name: string;
          gain: number;
          gainPercentage: number;
        }> = [];

        collection.forEach((item) => {
          totalCards += item.quantity;
          if (item.purchase_price) {
            totalInvestment += item.purchase_price * item.quantity;
          }

          // TODO: Fetch current market price for accurate calculation
          // For now, using mock calculation
          const currentPrice = item.purchase_price || 0;
          const purchasePrice = item.purchase_price || 0;
          const gain = (currentPrice - purchasePrice) * item.quantity;
          const gainPercentage =
            purchasePrice > 0 ? ((currentPrice - purchasePrice) / purchasePrice) * 100 : 0;

          cardPerformance.push({
            card_name: item.card_name,
            gain,
            gainPercentage,
          });
        });

        const profitLoss = totalValue - totalInvestment;
        const profitLossPercentage =
          totalInvestment > 0 ? (profitLoss / totalInvestment) * 100 : 0;

        cardPerformance.sort((a, b) => b.gainPercentage - a.gainPercentage);

        resolve({
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
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

