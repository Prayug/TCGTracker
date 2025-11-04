import axios from 'axios';
import { env } from '../config/env';
import { authService } from './authService';

const API_URL = env.apiUrl;

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

class AlertServiceFrontend {
  async getAlerts(): Promise<PriceAlert[]> {
    const response = await axios.get<{ alerts: PriceAlert[] }>(`${API_URL}/api/alerts`, {
      headers: authService.getAuthHeaders(),
    });
    return response.data.alerts;
  }

  async createAlert(
    cardId: string,
    cardName: string,
    targetPrice: number,
    condition: 'above' | 'below'
  ): Promise<PriceAlert> {
    const response = await axios.post<{ alert: PriceAlert }>(
      `${API_URL}/api/alerts`,
      { cardId, cardName, targetPrice, condition },
      { headers: authService.getAuthHeaders() }
    );
    return response.data.alert;
  }

  async deleteAlert(alertId: number): Promise<void> {
    await axios.delete(`${API_URL}/api/alerts/${alertId}`, {
      headers: authService.getAuthHeaders(),
    });
  }

  async toggleAlert(alertId: number, isActive: boolean): Promise<void> {
    await axios.put(
      `${API_URL}/api/alerts/${alertId}/toggle`,
      { isActive },
      { headers: authService.getAuthHeaders() }
    );
  }
}

export const alertServiceFrontend = new AlertServiceFrontend();

