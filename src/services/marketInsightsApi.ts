import { axios } from '../config/apiClient';
import { env } from '../config/env';
import {
  BacktestResult,
  ForwardTestStatus,
  CardPredictionDetail,
  PredictionFilters,
  PredictionWindow,
  ExternalSignal,
  PredictionsResponse,
  OverviewResponse,
  SortField,
  SortDirection,
  CalibrationHorizonStatus,
  DataQualityStatusResponse,
  HorizonSupportStatus,
} from '../features/market-insights/types';

type RequestOpts = { signal?: AbortSignal };

export function createInsightsApi(baseUrl: string) {
  return {
    async getPredictions(
      params?: {
        limit?: number;
        category?: string;
        window?: PredictionWindow;
        filters?: PredictionFilters;
        search?: string;
        sortBy?: SortField;
        sortOrder?: SortDirection;
        game?: 'pokemon' | 'onepiece';
      },
      opts?: RequestOpts
    ): Promise<PredictionsResponse> {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set('limit', String(params.limit));
      if (params?.category) searchParams.set('category', params.category);
      if (params?.window) searchParams.set('window', params.window);
      if (params?.search) searchParams.set('search', params.search);
      if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
      if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
      if (params?.game) searchParams.set('game', params.game);
      if (params?.filters?.minPrice !== undefined)
        searchParams.set('minPrice', String(params.filters.minPrice));
      if (params?.filters?.maxPrice !== undefined)
        searchParams.set('maxPrice', String(params.filters.maxPrice));
      if (params?.filters?.minConfidence !== undefined)
        searchParams.set('minConfidence', String(params.filters.minConfidence));
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
      const res = await axios.get<PredictionsResponse>(
        `${baseUrl}/predictions${qs ? `?${qs}` : ''}`,
        {
          signal: opts?.signal,
          timeout: 60_000,
        }
      );
      return res.data;
    },

    async getOverview(
      opts?: RequestOpts & { game?: 'pokemon' | 'onepiece' }
    ): Promise<OverviewResponse> {
      const searchParams = new URLSearchParams();
      if (opts?.game) searchParams.set('game', opts.game);
      const qs = searchParams.toString();
      const res = await axios.get<OverviewResponse>(`${baseUrl}/overview${qs ? `?${qs}` : ''}`, {
        signal: opts?.signal,
        timeout: 60_000,
      });
      return res.data;
    },

    async getCardPrediction(cardId: string): Promise<CardPredictionDetail> {
      const res = await axios.get<CardPredictionDetail>(
        `${baseUrl}/card/${encodeURIComponent(cardId)}`
      );
      return res.data;
    },

    async getAiExplanation(cardId: string): Promise<{ explanation: string; cached: boolean }> {
      const res = await axios.get<{ explanation: string; cached: boolean }>(
        `${baseUrl}/card/${encodeURIComponent(cardId)}/explanation`
      );
      return res.data;
    },

    async triggerPredictionRun(): Promise<{
      success: boolean;
      runId?: number;
      message: string;
      running?: boolean;
    }> {
      const res = await axios.post<{
        success: boolean;
        runId?: number;
        message: string;
        running?: boolean;
      }>(`${baseUrl}/run-predictions`, undefined, { timeout: 60_000 });
      return res.data;
    },

    async getPredictionRunStatus(): Promise<{
      running: boolean;
      startedAt: string | null;
      last: {
        runId: number;
        total: number;
        succeeded: number;
        failed: number;
      } | null;
    }> {
      try {
        const res = await axios.get<{
          running: boolean;
          startedAt: string | null;
          last: {
            runId: number;
            total: number;
            succeeded: number;
            failed: number;
          } | null;
        }>(`${baseUrl}/run-status`);
        return res.data;
      } catch {
        return { running: false, startedAt: null, last: null };
      }
    },

    async runBacktest(params: {
      backtestDate: string;
      windowDays?: number;
    }): Promise<BacktestResult & { cardResults: unknown[] }> {
      const res = await axios.post<BacktestResult & { cardResults: unknown[] }>(
        `${baseUrl}/backtest`,
        params
      );
      return res.data;
    },

    async getBacktestResults(): Promise<{ data: BacktestResult[] }> {
      const res = await axios.get<{ data: BacktestResult[] }>(`${baseUrl}/backtest-results`);
      return res.data;
    },

    async getForwardTestStatus(): Promise<ForwardTestStatus> {
      const res = await axios.get<ForwardTestStatus>(`${baseUrl}/forward-test`);
      return res.data;
    },

    async updateForwardTest(): Promise<{ success: boolean; updated: number }> {
      const res = await axios.post<{ success: boolean; updated: number }>(
        `${baseUrl}/forward-test/update`
      );
      return res.data;
    },

    async getExternalSignals(cardId: string): Promise<{ data: ExternalSignal[] }> {
      const res = await axios.get<{ data: ExternalSignal[] }>(
        `${baseUrl}/external-signals/${encodeURIComponent(cardId)}`
      );
      return res.data;
    },

    async triggerSignalScrape(): Promise<{
      success: boolean;
      scraped: number;
      stored: number;
      message: string;
    }> {
      const res = await axios.post<{
        success: boolean;
        scraped: number;
        stored: number;
        message: string;
      }>(`${baseUrl}/run-scrape`);
      return res.data;
    },

    async getCalibrationStatus(opts?: RequestOpts): Promise<{ data: CalibrationHorizonStatus[] }> {
      const res = await axios.get<{ data: CalibrationHorizonStatus[] }>(
        `${baseUrl}/calibration/status`,
        {
          signal: opts?.signal,
        }
      );
      return res.data;
    },

    async getDataQuality(opts?: RequestOpts): Promise<DataQualityStatusResponse> {
      const res = await axios.get<DataQualityStatusResponse>(`${baseUrl}/data-quality`, {
        signal: opts?.signal,
      });
      return res.data;
    },

    async getHorizonSupport(opts?: RequestOpts): Promise<{ data: HorizonSupportStatus }> {
      const res = await axios.get<{ data: HorizonSupportStatus }>(`${baseUrl}/horizon-support`, {
        signal: opts?.signal,
      });
      return res.data;
    },
  };
}

export type InsightsApiClient = ReturnType<typeof createInsightsApi>;

export const marketInsightsApi = createInsightsApi(`${env.apiUrl}/api/market-insights`);
export const slabInsightsApi = createInsightsApi(`${env.apiUrl}/api/slab-insights`);
