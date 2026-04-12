import { env } from '../config/env';
import { CardPrediction, BacktestResult, ForwardTestStatus, CardPredictionDetail, PredictionFilters, PredictionWindow, ExternalSignal } from '../features/market-insights/types';

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

    throw new Error(detail || `API error: ${response.status}`);
  }

  return response.json();
}

export const marketInsightsApi = {
  async getPredictions(params?: {
    limit?: number;
    category?: string;
    window?: PredictionWindow;
    filters?: PredictionFilters;
  }): Promise<{ data: CardPrediction[]; count: number; modelVersion: string }> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.category) searchParams.set('category', params.category);
    if (params?.window) searchParams.set('window', params.window);
    if (params?.filters?.minPrice !== undefined) searchParams.set('minPrice', String(params.filters.minPrice));
    if (params?.filters?.maxPrice !== undefined) searchParams.set('maxPrice', String(params.filters.maxPrice));
    if (params?.filters?.minConfidence !== undefined) searchParams.set('minConfidence', String(params.filters.minConfidence));
    if (params?.filters?.rarities && params.filters.rarities.length > 0) {
      searchParams.set('rarities', params.filters.rarities.join(','));
    }
    if (params?.filters?.eras && params.filters.eras.length > 0) {
      searchParams.set('eras', params.filters.eras.join(','));
    }
    if (params?.filters?.releaseDateFrom) {
      searchParams.set('releaseDateFrom', params.filters.releaseDateFrom);
    }
    if (params?.filters?.releaseDateTo) {
      searchParams.set('releaseDateTo', params.filters.releaseDateTo);
    }
    const qs = searchParams.toString();
    return fetchJson(`${BASE_URL}/predictions${qs ? `?${qs}` : ''}`);
  },

  async getCardPrediction(cardId: string): Promise<CardPredictionDetail> {
    return fetchJson(`${BASE_URL}/card/${encodeURIComponent(cardId)}`);
  },

  async getAiExplanation(cardId: string): Promise<{ explanation: string; cached: boolean }> {
    return fetchJson(`${BASE_URL}/card/${encodeURIComponent(cardId)}/explanation`);
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

  async getExternalSignals(cardId: string): Promise<{ data: ExternalSignal[] }> {
    return fetchJson(`${BASE_URL}/external-signals/${encodeURIComponent(cardId)}`);
  },

  async triggerSignalScrape(): Promise<{ success: boolean; scraped: number; stored: number; message: string }> {
    return fetchJson(`${BASE_URL}/run-scrape`, { method: 'POST' });
  },
};
