import { useState, useEffect, useCallback, useRef } from 'react';
import { marketInsightsApi } from '../../../services/marketInsightsApi';
import { formatApiError, isAbortError } from '../../../utils/apiError';
import {
  CardPrediction,
  BacktestResult,
  ForwardTestStatus,
  MarketOverview,
  PredictionWindow,
  PredictionFilters,
  SortField,
  SortDirection,
  InsightsTabType,
  AVAILABLE_RARITIES,
  AVAILABLE_ERAS,
} from '../types';

const DEFAULT_FILTERS: PredictionFilters = {
  minPrice: 2,
  maxPrice: 10000,
  minConfidence: 30,
  rarities: [...AVAILABLE_RARITIES],
  eras: [...AVAILABLE_ERAS.map(e => e.id)],
  releaseDateFrom: undefined,
  releaseDateTo: undefined,
};

export function useMarketInsights() {
  const [activeTab, setActiveTab] = useState<InsightsTabType['id']>('overview');

  const [predictions, setPredictions] = useState<CardPrediction[]>([]);
  const [predictionsLoading, setPredictionsLoading] = useState(true);
  const [predictionsError, setPredictionsError] = useState<string | null>(null);

  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [backtestResults, setBacktestResults] = useState<BacktestResult[]>([]);
  const [forwardStatus, setForwardStatus] = useState<ForwardTestStatus | null>(null);

  const [runningPrediction, setRunningPrediction] = useState(false);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [refreshingForward, setRefreshingForward] = useState(false);

  const [predictionWindow, setPredictionWindow] = useState<PredictionWindow>('90d');
  const [filters, setFilters] = useState<PredictionFilters>(DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('return');
  const [sortOrder, setSortOrder] = useState<SortDirection>('desc');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [backtestDate, setBacktestDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });

  const [message, setMessage] = useState<string | null>(null);
  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 5000);
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  const loadPredictions = useCallback(async (signal?: AbortSignal) => {
    setPredictionsLoading(true);
    setPredictionsError(null);
    try {
      const res = await marketInsightsApi.getPredictions({
        limit: 250,
        window: predictionWindow,
        filters,
        search: searchQuery || undefined,
        sortBy,
        sortOrder,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
      }, { signal });
      if (signal?.aborted) return;
      setPredictions(res.data);
    } catch (err: unknown) {
      if (signal?.aborted || isAbortError(err)) return;
      const message = formatApiError(err, 'Failed to load predictions');
      console.error('Failed to load predictions:', message, err);
      setPredictionsError(message || 'Failed to load predictions');
      setPredictions([]);
    } finally {
      if (!signal?.aborted) setPredictionsLoading(false);
    }
  }, [predictionWindow, filters, searchQuery, sortBy, sortOrder, categoryFilter]);

  const loadOverview = useCallback(async (signal?: AbortSignal) => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const data = await marketInsightsApi.getOverview({ signal });
      if (signal?.aborted) return;
      setOverview(data);
    } catch (err: unknown) {
      if (signal?.aborted || isAbortError(err)) return;
      const message = formatApiError(err, 'Failed to load overview');
      console.error('Failed to load overview:', message, err);
      setOverviewError(message || 'Failed to load overview');
      setOverview(null);
    } finally {
      if (!signal?.aborted) setOverviewLoading(false);
    }
  }, []);

  const loadBackendData = useCallback(async () => {
    const [btData, ftStatus] = await Promise.all([
      marketInsightsApi.getBacktestResults().catch(() => ({ data: [] as BacktestResult[] })),
      marketInsightsApi.getForwardTestStatus().catch(() => null),
    ]);
    setBacktestResults(btData?.data || []);
    setForwardStatus(ftStatus);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadOverview(controller.signal);
    loadBackendData();
    return () => controller.abort();
  }, [loadOverview, loadBackendData]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    loadPredictions(controller.signal);
    return () => controller.abort();
  }, [loadPredictions]);

  const handleApplyFilters = useCallback((next: PredictionFilters) => {
    setFilters(next);
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSearchQuery('');
    setSortBy('return');
    setSortOrder('desc');
    setCategoryFilter('all');
  }, []);

  const handleRunPredictions = async () => {
    setRunningPrediction(true);
    try {
      const result = await marketInsightsApi.triggerPredictionRun();
      showMessage(`Prediction run ${result.runId}: ${result.message}`);
      await Promise.all([loadPredictions(), loadOverview(), loadBackendData()]);
    } catch (err: any) {
      showMessage(`Failed: ${err.message}`);
    } finally {
      setRunningPrediction(false);
    }
  };

  const handleRefreshForwardTest = async () => {
    setRefreshingForward(true);
    try {
      const result = await marketInsightsApi.updateForwardTest();
      showMessage(`Forward test updated: ${result.updated} outcomes refreshed`);
      await loadBackendData();
    } catch (err: any) {
      showMessage(`Forward test update failed: ${err.message}`);
    } finally {
      setRefreshingForward(false);
    }
  };

  const handleRunBacktest = async () => {
    setRunningBacktest(true);
    try {
      await marketInsightsApi.runBacktest({ backtestDate, windowDays: 90 });
      showMessage('Backtest completed');
      const btData = await marketInsightsApi.getBacktestResults();
      setBacktestResults(btData?.data || []);
      setActiveTab('backtest');
    } catch (err: any) {
      showMessage(`Backtest failed: ${err.message}`);
    } finally {
      setRunningBacktest(false);
    }
  };

  return {
    activeTab, setActiveTab,
    predictions, predictionsLoading, predictionsError,
    overview, overviewLoading, overviewError,
    backtestResults, forwardStatus,
    runningPrediction, runningBacktest, refreshingForward,
    predictionWindow, setPredictionWindow,
    filters, searchQuery, setSearchQuery,
    sortBy, setSortBy, sortOrder, setSortOrder,
    categoryFilter, setCategoryFilter,
    backtestDate, setBacktestDate,
    message,
    handleApplyFilters, handleResetFilters,
    handleRunPredictions, handleRunBacktest, handleRefreshForwardTest,
    loadPredictions, loadOverview, showMessage,
    DEFAULT_FILTERS,
  };
}
