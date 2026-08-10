import { authService } from './authService';
import {
  alertServiceFrontend,
  PriceAlert as ServerAlert,
  ServerAlertType,
  CreateAlertOptions,
} from './alertService';
import { priceTrackingService, PriceAlert as LocalAlert } from './priceTrackingService';

export type UnifiedAlertCondition = 'above' | 'below';

export interface UnifiedAlert {
  id: string;
  cardId: string;
  cardName: string;
  targetPrice: number;
  condition: UnifiedAlertCondition;
  alertType?: ServerAlertType;
  thresholdPct?: number | null;
  baselinePrice?: number | null;
  isActive: boolean;
  createdAt: string;
  triggeredAt?: string;
  source: 'server' | 'local';
}

export interface AlertDigestEntry {
  id: string;
  cardId: string;
  cardName: string;
  targetPrice: number;
  condition: UnifiedAlertCondition;
  currentPrice: number;
  triggeredAt: string;
  read: boolean;
}

const DIGEST_KEY = 'tcg_alert_digest';

function mapServer(alert: ServerAlert): UnifiedAlert {
  return {
    id: String(alert.id),
    cardId: alert.card_id,
    cardName: alert.card_name,
    targetPrice: alert.target_price,
    condition: alert.condition,
    alertType: alert.alert_type ?? 'price_threshold',
    thresholdPct: alert.threshold_pct,
    baselinePrice: alert.baseline_price,
    isActive: alert.is_active,
    createdAt: alert.created_at,
    triggeredAt: alert.triggered_at,
    source: 'server',
  };
}

function mapLocal(alert: LocalAlert): UnifiedAlert {
  return {
    id: alert.id,
    cardId: alert.cardId,
    cardName: alert.cardName,
    targetPrice: alert.targetPrice,
    condition: alert.alertType,
    alertType: 'price_threshold',
    isActive: alert.isActive,
    createdAt: alert.createdAt,
    source: 'local',
  };
}

function readDigest(): AlertDigestEntry[] {
  try {
    const raw = localStorage.getItem(DIGEST_KEY);
    return raw ? (JSON.parse(raw) as AlertDigestEntry[]) : [];
  } catch {
    return [];
  }
}

function writeDigest(entries: AlertDigestEntry[]) {
  localStorage.setItem(DIGEST_KEY, JSON.stringify(entries.slice(0, 100)));
  window.dispatchEvent(new CustomEvent('tcg:alert-digest-updated'));
}

class UnifiedAlertService {
  isServerMode(): boolean {
    return authService.isAuthenticated();
  }

  async getAlerts(): Promise<UnifiedAlert[]> {
    if (this.isServerMode()) {
      try {
        const alerts = await alertServiceFrontend.getAlerts();
        return alerts.map(mapServer);
      } catch (err) {
        console.warn('Server alerts unavailable, falling back to local:', err);
      }
    }
    return priceTrackingService.getAlerts().map(mapLocal);
  }

  async createAlert(
    cardId: string,
    cardName: string,
    targetPrice: number,
    condition: UnifiedAlertCondition,
    options?: CreateAlertOptions
  ): Promise<UnifiedAlert> {
    if (this.isServerMode()) {
      try {
        const alert = await alertServiceFrontend.createAlert(
          cardId,
          cardName,
          targetPrice,
          condition,
          options
        );
        return mapServer(alert);
      } catch (err) {
        console.warn('Server alert create failed, using local:', err);
      }
    }
    priceTrackingService.createAlert(cardId, cardName, targetPrice, condition);
    const local = priceTrackingService.getAlerts().find(
      (a) => a.cardId === cardId && a.targetPrice === targetPrice && a.alertType === condition
    );
    return local
      ? mapLocal(local)
      : {
          id: Date.now().toString(),
          cardId,
          cardName,
          targetPrice,
          condition,
          alertType: options?.alertType ?? 'price_threshold',
          thresholdPct: options?.thresholdPct,
          baselinePrice: options?.baselinePrice,
          isActive: true,
          createdAt: new Date().toISOString(),
          source: 'local',
        };
  }

  async deleteAlert(alert: UnifiedAlert): Promise<void> {
    if (alert.source === 'server' && this.isServerMode()) {
      await alertServiceFrontend.deleteAlert(Number(alert.id));
      return;
    }
    priceTrackingService.deleteAlert(alert.id);
  }

  async toggleAlert(alert: UnifiedAlert, isActive: boolean): Promise<void> {
    if (alert.source === 'server' && this.isServerMode()) {
      await alertServiceFrontend.toggleAlert(Number(alert.id), isActive);
      return;
    }
    priceTrackingService.setAlertActive(alert.id, isActive);
  }

  getDigest(): AlertDigestEntry[] {
    return readDigest();
  }

  getUnreadDigestCount(): number {
    return readDigest().filter((e) => !e.read).length;
  }

  markDigestRead(id?: string): void {
    const entries = readDigest().map((e) =>
      id == null || e.id === id ? { ...e, read: true } : e
    );
    writeDigest(entries);
  }

  clearDigest(): void {
    writeDigest([]);
  }

  /**
   * Evaluate active alerts against current prices and append to the in-app digest.
   * Returns newly triggered entries.
   */
  async evaluateDigest(
    priceByCardId: Record<string, number>
  ): Promise<AlertDigestEntry[]> {
    const alerts = await this.getAlerts();
    const existing = readDigest();
    const existingKeys = new Set(
      existing.map((e) => `${e.cardId}:${e.condition}:${e.targetPrice}:${e.triggeredAt.slice(0, 10)}`)
    );
    const today = new Date().toISOString().slice(0, 10);
    const newly: AlertDigestEntry[] = [];

    for (const alert of alerts) {
      if (!alert.isActive) continue;
      // Local digest only evaluates price_threshold style alerts.
      if (alert.alertType && alert.alertType !== 'price_threshold') continue;
      const current = priceByCardId[alert.cardId];
      if (current == null || current <= 0) continue;

      const hit =
        alert.condition === 'above'
          ? current >= alert.targetPrice
          : current <= alert.targetPrice;
      if (!hit) continue;

      const key = `${alert.cardId}:${alert.condition}:${alert.targetPrice}:${today}`;
      if (existingKeys.has(key)) continue;

      const entry: AlertDigestEntry = {
        id: `digest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        cardId: alert.cardId,
        cardName: alert.cardName,
        targetPrice: alert.targetPrice,
        condition: alert.condition,
        currentPrice: current,
        triggeredAt: new Date().toISOString(),
        read: false,
      };
      newly.push(entry);
      existingKeys.add(key);
    }

    if (newly.length > 0) {
      writeDigest([...newly, ...existing]);
    }
    return newly;
  }
}

export const unifiedAlertService = new UnifiedAlertService();
