import { Database } from 'sqlite3';
import { logger } from '../utils/logger';
import { formatAlertEmail, isEmailConfigured, sendEmail } from './emailService';

export type AlertCondition = 'above' | 'below';
export type AlertType =
  | 'price_threshold'
  | 'percent_change'
  | 'volume_drop'
  | 'category_change'
  | 'graded_premium';

export interface PriceAlert {
  id: number;
  user_id: number;
  card_id: string;
  card_name: string;
  target_price: number;
  condition: AlertCondition;
  alert_type: AlertType;
  threshold_pct?: number | null;
  baseline_price?: number | null;
  metadata_json?: string | null;
  is_active: boolean;
  created_at: string;
  triggered_at?: string;
}

export interface CreateAlertInput {
  cardId: string;
  cardName: string;
  targetPrice?: number;
  condition?: AlertCondition;
  alertType?: AlertType;
  thresholdPct?: number;
  baselinePrice?: number;
  metadata?: Record<string, unknown>;
}

export class AlertService {
  private db: Database;
  private initialized = false;

  constructor(db: Database) {
    this.db = db;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    // Schema is owned by migrations — only ensure indexes exist.
    const run = (sql: string) =>
      new Promise<void>((resolve, reject) => {
        this.db.run(sql, (err) => (err ? reject(err) : resolve()));
      });

    await run(`CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_alerts_card ON price_alerts(card_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts(is_active)`);
  }

  async createAlert(
    userId: number,
    cardId: string,
    cardName: string,
    targetPrice: number,
    condition: AlertCondition,
    extras?: Omit<CreateAlertInput, 'cardId' | 'cardName' | 'targetPrice' | 'condition'>
  ): Promise<PriceAlert> {
    const alertType = extras?.alertType ?? 'price_threshold';
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO price_alerts
           (user_id, card_id, card_name, target_price, condition, alert_type, threshold_pct, baseline_price, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          cardId,
          cardName,
          targetPrice ?? 0,
          condition ?? 'above',
          alertType,
          extras?.thresholdPct ?? null,
          extras?.baselinePrice ?? null,
          extras?.metadata ? JSON.stringify(extras.metadata) : null,
        ],
        function (this: { lastID: number }, err: Error | null) {
          if (err) return reject(err);

          resolve({
            id: this.lastID,
            user_id: userId,
            card_id: cardId,
            card_name: cardName,
            target_price: targetPrice ?? 0,
            condition: condition ?? 'above',
            alert_type: alertType,
            threshold_pct: extras?.thresholdPct ?? null,
            baseline_price: extras?.baselinePrice ?? null,
            metadata_json: extras?.metadata ? JSON.stringify(extras.metadata) : null,
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

  private async getUserEmail(userId: number): Promise<string | null> {
    return new Promise((resolve) => {
      this.db.get(
        'SELECT email FROM users WHERE id = ?',
        [userId],
        (err: Error | null, row: { email?: string } | undefined) => {
          if (err || !row?.email) return resolve(null);
          resolve(row.email);
        }
      );
    });
  }

  /** Best-effort email; never throws — in-app alerts must keep working. */
  private async notifyAlertEmail(alert: PriceAlert, extra?: { currentPrice?: number }): Promise<void> {
    if (!isEmailConfigured()) return;
    try {
      const email = await this.getUserEmail(alert.user_id);
      if (!email) return;
      const { subject, text } = formatAlertEmail(alert);
      const body =
        extra?.currentPrice != null
          ? `${text}\n\nCurrent price: $${Number(extra.currentPrice).toFixed(2)}`
          : text;
      await sendEmail({ to: email, subject, text: body });
    } catch (err: any) {
      logger.warn('Alert email notification failed', {
        alertId: alert.id,
        error: err?.message || String(err),
      });
    }
  }

  /** Classic absolute price threshold alerts. */
  async checkAlerts(cardId: string, currentPrice: number): Promise<PriceAlert[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM price_alerts
         WHERE card_id = ? AND is_active = 1
           AND (alert_type IS NULL OR alert_type = 'price_threshold')
           AND (
             (condition = 'above' AND target_price <= ?) OR
             (condition = 'below' AND target_price >= ?)
           )`,
        [cardId, currentPrice, currentPrice],
        (err: Error | null, rows: PriceAlert[]) => {
          if (err) return reject(err);

          (rows || []).forEach((alert) => {
            this.triggerAlert(alert.id)
              .then(() => {
                logger.info('Price alert triggered', {
                  alertId: alert.id,
                  cardId: alert.card_id,
                  targetPrice: alert.target_price,
                  currentPrice,
                });
                void this.notifyAlertEmail(alert, { currentPrice });
              })
              .catch((triggerErr) => {
                logger.error('Failed to trigger alert', { error: triggerErr.message });
              });
          });

          resolve(rows || []);
        }
      );
    });
  }

  /**
   * Evaluate richer alert types against a market snapshot.
   * Call from the daily price cron after prices update.
   */
  async evaluateSmartAlerts(snapshot: {
    cardId: string;
    currentPrice: number;
    priorPrice?: number | null;
    volume?: number | null;
    priorVolume?: number | null;
    category?: string | null;
    priorCategory?: string | null;
    gradedPremiumPct?: number | null;
  }): Promise<PriceAlert[]> {
    const alerts = await new Promise<PriceAlert[]>((resolve, reject) => {
      this.db.all(
        `SELECT * FROM price_alerts
         WHERE card_id = ? AND is_active = 1
           AND alert_type IN ('percent_change', 'volume_drop', 'category_change', 'graded_premium')`,
        [snapshot.cardId],
        (err, rows: PriceAlert[]) => (err ? reject(err) : resolve(rows || []))
      );
    });

    const triggered: PriceAlert[] = [];
    for (const alert of alerts) {
      let hit = false;
      const pct = alert.threshold_pct ?? 0;

      if (alert.alert_type === 'percent_change' && snapshot.priorPrice && snapshot.priorPrice > 0) {
        const changePct =
          ((snapshot.currentPrice - snapshot.priorPrice) / snapshot.priorPrice) * 100;
        if (alert.condition === 'above' && changePct >= pct) hit = true;
        if (alert.condition === 'below' && changePct <= -Math.abs(pct)) hit = true;
      }

      if (
        alert.alert_type === 'volume_drop' &&
        snapshot.volume != null &&
        snapshot.priorVolume != null &&
        snapshot.priorVolume > 0
      ) {
        const dropPct =
          ((snapshot.priorVolume - snapshot.volume) / snapshot.priorVolume) * 100;
        if (dropPct >= Math.abs(pct || 50)) hit = true;
      }

      if (
        alert.alert_type === 'category_change' &&
        snapshot.category &&
        snapshot.priorCategory &&
        snapshot.category !== snapshot.priorCategory
      ) {
        hit = true;
      }

      if (
        alert.alert_type === 'graded_premium' &&
        snapshot.gradedPremiumPct != null &&
        snapshot.gradedPremiumPct >= (pct || 100)
      ) {
        hit = true;
      }

      if (hit) {
        await this.triggerAlert(alert.id);
        triggered.push(alert);
        logger.info('Smart alert triggered', {
          alertId: alert.id,
          type: alert.alert_type,
          cardId: snapshot.cardId,
        });
        void this.notifyAlertEmail(alert, { currentPrice: snapshot.currentPrice });
      }
    }
    return triggered;
  }

  /**
   * Minimal post-price-update sweep: for each card with active smart alerts,
   * load latest + prior day prices from price_history and evaluate.
   */
  async evaluateAllSmartAlertsFromPrices(): Promise<number> {
    const cardIds = await new Promise<string[]>((resolve, reject) => {
      this.db.all(
        `SELECT DISTINCT card_id AS cardId FROM price_alerts
         WHERE is_active = 1
           AND alert_type IN ('percent_change', 'volume_drop', 'category_change', 'graded_premium')`,
        [],
        (err, rows: Array<{ cardId: string }>) =>
          err ? reject(err) : resolve((rows || []).map((r) => r.cardId))
      );
    });

    let triggeredCount = 0;
    for (const cardId of cardIds) {
      type PriceRow = { price: number; volume: number | null; date: string };
      const prices = await new Promise<PriceRow[]>((resolve, reject) => {
        this.db.all(
          `SELECT COALESCE(ph.marketPrice, ph.price) AS price, ph.volume, ph.date
           FROM price_history ph
           INNER JOIN card_mappings cm ON cm.uniqueIdentifier = ph.uniqueIdentifier
           WHERE cm.cardId = ? AND COALESCE(ph.marketPrice, ph.price) > 0
           ORDER BY ph.date DESC
           LIMIT 2`,
          [cardId],
          (err, rows) => (err ? reject(err) : resolve((rows as PriceRow[]) || []))
        );
      });

      if (!prices.length || !(prices[0].price > 0)) continue;

      const triggered = await this.evaluateSmartAlerts({
        cardId,
        currentPrice: prices[0].price,
        priorPrice: prices[1]?.price ?? null,
        volume: prices[0].volume ?? null,
        priorVolume: prices[1]?.volume ?? null,
      });
      triggeredCount += triggered.length;
    }
    return triggeredCount;
  }
}
