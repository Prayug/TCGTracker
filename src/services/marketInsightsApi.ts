import { env } from '../config/env';
import { CardPrediction, BacktestResult, ForwardTestStatus, CardPredictionDetail } from '../features/market-insights/types';

const BASE_URL = `${env.apiUrl}/api/market-insights`;

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') detail = body.error;
    } catch {
      /* response may not be JSON */
    }

    if (response.status === 401) {
      throw new Error('Sign in required. Use an admin account to run predictions or backtests.');
    }
    if (response.status === 403) {
      throw new Error('Admin access required for this action.');
    }
    throw new Error(detail || `API error: ${response.status}`);
  }

  return response.json();
}

export const marketInsightsApi = {
  async getPredictions(params?: {
    limit?: number;
    category?: string;
  }): Promise<{ data: CardPrediction[]; count: number; modelVersion: string }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.category) searchParams.set('category', params.category);
    const qs = searchParams.toString();
    return fetchJson(`${BASE_URL}/predictions${qs ? `?${qs}` : ''}`);
  },

  async getCardPrediction(cardId: string): Promise<CardPredictionDetail> {
    return fetchJson(`${BASE_URL}/card/${encodeURIComponent(cardId)}`);
  },

  async triggerPredictionRun(): Promise<{ success: boolean; runId: number; message: string }> {
    return fetchJson(`${BASE_URL}/run-predictions`, { method: 'POST' });
  },

  async runBacktest(params: {
    backtestDate: string;
    windowDays?: number;
  }): Promise<BacktestResult & { cardResults: any[] }> {
    return fetchJson(`${BASE_URL}/backtest`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async getBacktestResults(): Promise<{ data: BacktestResult[] }> {
    return fetchJson(`${BASE_URL}/backtest-results`);
  },

  async getForwardTestStatus(): Promise<ForwardTestStatus> {
    return fetchJson(`${BASE_URL}/forward-test`);
  },

  async updateForwardTest(): Promise<{ success: boolean; updated: number }> {
    return fetchJson(`${BASE_URL}/forward-test/update`, { method: 'POST' });
  },
};
