import { Database } from 'sqlite3';
import { logger } from '../utils/logger';

export interface PriceAlert {
  id: number;
  user_id: number;
  card_id: string;
  card_name: string;
  target_price: number;
  condition: 'above' | 'below';
  is_active: boolean;
  created_at: string;
  triggered_at?: string;
}

export class AlertService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.initializeDatabase();
  }

  private initializeDatabase() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        card_id TEXT NOT NULL,
        card_name TEXT NOT NULL,
        target_price REAL NOT NULL,
        condition TEXT CHECK(condition IN ('above', 'below')) NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        triggered_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_alerts_card ON price_alerts(card_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts(is_active)
    `);
  }

  async createAlert(
    userId: number,
    cardId: string,
    cardName: string,
    targetPrice: number,
    condition: 'above' | 'below'
  ): Promise<PriceAlert> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO price_alerts (user_id, card_id, card_name, target_price, condition) 
         VALUES (?, ?, ?, ?, ?)`,
        [userId, cardId, cardName, targetPrice, condition],
        function (this: any, err: Error | null) {
          if (err) return reject(err);

          const alertId = this.lastID;
          resolve({
            id: alertId,
            user_id: userId,
            card_id: cardId,
            card_name: cardName,
            target_price: targetPrice,
            condition,
            is_active: true,
            created_at: new Date().toISOString(),
          });
        }
      );
    });
  }

  async getAlertsByUser(userId: number): Promise<PriceAlert[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM price_alerts WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err: Error | null, rows: PriceAlert[]) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });
  }

  async getActiveAlerts(): Promise<PriceAlert[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM price_alerts WHERE is_active = 1',
        [],
        (err: Error | null, rows: PriceAlert[]) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });
  }

  async deleteAlert(alertId: number, userId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM price_alerts WHERE id = ? AND user_id = ?',
        [alertId, userId],
        (err: Error | null) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  async toggleAlert(alertId: number, userId: number, isActive: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE price_alerts SET is_active = ? WHERE id = ? AND user_id = ?',
        [isActive ? 1 : 0, alertId, userId],
        (err: Error | null) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  async triggerAlert(alertId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE price_alerts SET is_active = 0, triggered_at = CURRENT_TIMESTAMP WHERE id = ?',
        [alertId],
        (err: Error | null) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  async checkAlerts(cardId: string, currentPrice: number): Promise<PriceAlert[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM price_alerts 
         WHERE card_id = ? AND is_active = 1 AND (
           (condition = 'above' AND target_price <= ?) OR
           (condition = 'below' AND target_price >= ?)
         )`,
        [cardId, currentPrice, currentPrice],
        (err: Error | null, rows: PriceAlert[]) => {
          if (err) return reject(err);
          
          // Trigger all matched alerts
          rows.forEach((alert) => {
            this.triggerAlert(alert.id)
              .then(() => {
                logger.info('Price alert triggered', {
                  alertId: alert.id,
                  cardId: alert.card_id,
                  targetPrice: alert.target_price,
                  currentPrice,
                });
              })
              .catch((err) => {
                logger.error('Failed to trigger alert', { error: err.message });
              });
          });

          resolve(rows || []);
        }
      );
    });
  }
}
