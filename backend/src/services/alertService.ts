import { getDb } from '../db/database';

interface PriceAlert {
  id: number;
  cardId?: string;
  productId?: number;
  targetPrice: number;
  alertType: 'above' | 'below' | 'change_percent';
  threshold: number;
  isActive: boolean;
  lastTriggered?: string;
}

interface PriceData {
  productId: number;
  cardId?: string;
  currentPrice: number;
  previousPrice?: number;
  productName: string;
}

export class AlertService {
  
  async checkPriceAlerts(): Promise<void> {
    try {
      console.log('Checking price alerts...');
      
      const alerts = await this.getActiveAlerts();
      if (alerts.length === 0) {
        console.log('No active alerts to check');
        return;
      }

      for (const alert of alerts) {
        await this.processAlert(alert);
      }
      
      console.log(`Checked ${alerts.length} price alerts`);
    } catch (error) {
      console.error('Error checking price alerts:', error);
    }
  }

  private async getActiveAlerts(): Promise<PriceAlert[]> {
    const db = getDb();
    
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM price_alerts WHERE isActive = 1';
      
      db.all(sql, [], (err, rows: PriceAlert[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  private async processAlert(alert: PriceAlert): Promise<void> {
    try {
      let priceData: PriceData | null = null;

      if (alert.productId) {
        priceData = await this.getCurrentPrice(alert.productId);
      } else if (alert.cardId) {
        priceData = await this.getCurrentPriceByCardId(alert.cardId);
      }

      if (!priceData) {
        console.log(`No price data found for alert ${alert.id}`);
        return;
      }

      const shouldTrigger = this.shouldTriggerAlert(alert, priceData);
      
      if (shouldTrigger) {
        await this.triggerAlert(alert, priceData);
      }
    } catch (error) {
      console.error(`Error processing alert ${alert.id}:`, error);
    }
  }

  private async getCurrentPrice(productId: number): Promise<PriceData | null> {
    const db = getDb();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          productId,
          price as currentPrice,
          productName,
          date
        FROM price_history 
        WHERE productId = ? 
        ORDER BY date DESC 
        LIMIT 1
      `;
      
      db.get(sql, [productId], (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? {
            productId: row.productId,
            currentPrice: row.currentPrice,
            productName: row.productName
          } : null);
        }
      });
    });
  }

  private async getCurrentPriceByCardId(cardId: string): Promise<PriceData | null> {
    const db = getDb();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          cardId,
          marketPrice as currentPrice,
          date
        FROM rolling_averages 
        WHERE cardId = ? 
        ORDER BY date DESC 
        LIMIT 1
      `;
      
      db.get(sql, [cardId], (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? {
            productId: 0,
            cardId: row.cardId,
            currentPrice: row.currentPrice,
            productName: cardId
          } : null);
        }
      });
    });
  }

  private shouldTriggerAlert(alert: PriceAlert, priceData: PriceData): boolean {
    const { currentPrice } = priceData;
    
    // Check if alert was recently triggered (within last hour)
    if (alert.lastTriggered) {
      const lastTriggeredTime = new Date(alert.lastTriggered).getTime();
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      
      if (lastTriggeredTime > oneHourAgo) {
        return false; // Don't spam alerts
      }
    }

    switch (alert.alertType) {
      case 'above':
        return currentPrice >= alert.targetPrice;
        
      case 'below':
        return currentPrice <= alert.targetPrice;
        
      case 'change_percent':
        if (priceData.previousPrice) {
          const changePercent = ((currentPrice - priceData.previousPrice) / priceData.previousPrice) * 100;
          return Math.abs(changePercent) >= alert.threshold;
        }
        return false;
        
      default:
        return false;
    }
  }

  private async triggerAlert(alert: PriceAlert, priceData: PriceData): Promise<void> {
    console.log(`🚨 PRICE ALERT TRIGGERED!`);
    console.log(`Alert ID: ${alert.id}`);
    console.log(`Card/Product: ${priceData.productName || priceData.cardId}`);
    console.log(`Current Price: $${priceData.currentPrice.toFixed(2)}`);
    console.log(`Alert Type: ${alert.alertType}`);
    console.log(`Target/Threshold: ${alert.alertType === 'change_percent' ? alert.threshold + '%' : '$' + alert.targetPrice}`);
    
    // Update last triggered timestamp
    const db = getDb();
    const updateSql = 'UPDATE price_alerts SET lastTriggered = datetime("now") WHERE id = ?';
    
    return new Promise((resolve, reject) => {
      db.run(updateSql, [alert.id], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    // Here you could add:
    // - Email notifications
    // - Push notifications  
    // - Webhook calls
    // - Discord/Slack notifications
    // etc.
  }

  async getAlertHistory(days: number = 7): Promise<any[]> {
    const db = getDb();
    
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM price_alerts 
        WHERE lastTriggered IS NOT NULL 
          AND lastTriggered >= datetime('now', '-${days} days')
        ORDER BY lastTriggered DESC
      `;
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }
}

export const alertService = new AlertService(); 