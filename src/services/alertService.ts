import axios from 'axios';
import { buildApiUrl } from '../config/env';
import '../config/apiClient';

export type ServerAlertType =
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
  condition: 'above' | 'below';
  alert_type?: ServerAlertType;
  threshold_pct?: number | null;
  baseline_price?: number | null;
  metadata_json?: string | null;
  is_active: boolean;
  created_at: string;
  triggered_at?: string;
}

export interface CreateAlertOptions {
  alertType?: ServerAlertType;
  thresholdPct?: number;
  baselinePrice?: number;
  metadata?: Record<string, unknown>;
}

class AlertServiceFrontend {
  async getAlerts(): Promise<PriceAlert[]> {
    const response = await axios.get<{ alerts: PriceAlert[] }>(buildApiUrl('/api/alerts'));
    return response.data.alerts;
  }

  async createAlert(
    cardId: string,
    cardName: string,
    targetPrice: number,
    condition: 'above' | 'below',
    options?: CreateAlertOptions
  ): Promise<PriceAlert> {
    const response = await axios.post<{ alert: PriceAlert }>(buildApiUrl('/api/alerts'), {
      cardId,
      cardName,
      targetPrice,
      condition,
      alertType: options?.alertType,
      thresholdPct: options?.thresholdPct,
      baselinePrice: options?.baselinePrice,
      metadata: options?.metadata,
    });
    return response.data.alert;
  }

  async deleteAlert(alertId: number): Promise<void> {
    await axios.delete(buildApiUrl(`/api/alerts/${alertId}`));
  }

  async toggleAlert(alertId: number, isActive: boolean): Promise<void> {
    await axios.put(buildApiUrl(`/api/alerts/${alertId}/toggle`), { isActive });
  }
}

export const alertServiceFrontend = new AlertServiceFrontend();
