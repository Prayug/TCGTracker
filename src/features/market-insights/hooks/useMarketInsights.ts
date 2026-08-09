import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { marketInsightsApi } from '../../../services/marketInsightsApi';
import { formatApiError, isAbortError } from '../../../utils/apiError';
import { useGame } from '../../../contexts/GameContext';
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
  AVAILABLE_OP_RARITIES,
  AVAILABLE_ERAS,
  HorizonSupportStatus,
  CalibrationHorizonStatus,
  DataQualityStatusResponse,
} from '../types';

function defaultFiltersForGame(isOnePiece: boolean): PredictionFilters {
  if (isOnePiece) {
    return {
      minPrice: 1,
      maxPrice: 10000,
      minConfidence: 30,
      rarities: [...AVAILABLE_OP_RARITIES],
      eras: [],
      releaseDateFrom: undefined,
      releaseDateTo: undefined,
    };
  }
  return {
    minPrice: 2,
    maxPrice: 10000,
    minConfidence: 30,
    rarities: [...AVAILABLE_RARITIES],
    eras: [...AVAILABLE_ERAS.map(e => e.id)],
    releaseDateFrom: undefined,
    releaseDateTo: undefined,
  };
}

function windowToDays(window: PredictionWindow): number {
  return Number(window.replace('d', ''));
}

export function useMarketInsights() {
  const { isOnePiece, game } = useGame();
  const apiGame = isOnePiece ? 'onepiece' as const : 'pokemon' as const;

  const DEFAULT_FILTERS = useMemo(() => defaultFiltersForGame(isOnePiece), [isOnePiece]);

  const [activeTab, setActiveTab] = useState<InsightsTabType['id']>('overview');

  const [predictions, setPredictions] = useState<CardPrediction[]>([]);
  const [predictionsLoading, setPredictionsLoading] = useState(true);
  const [predictionsError, setPredictionsError] = useState<string | null>(null);
  const [horizonSupport, setHorizonSupport] = useState<HorizonSupportStatus | null>(null);
  const [windowExperimental, setWindowExperimental] = useState(false);

  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [backtestResults, setBacktestResults] = useState<BacktestResult[]>([]);
  const [forwardStatus, setForwardStatus] = useState<ForwardTestStatus | null>(null);

  const [calibration, setCalibration] = useState<CalibrationHorizonStatus[] | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQualityStatusResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [runningPrediction, setRunningPrediction] = useState(false);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [refreshingForward, setRefreshingForward] = useState(false);

  const [predictionWindow, setPredictionWindow] = useState<PredictionWindow>('90d');
  const [filters, setFilters] = useState<PredictionFilters>(() => defaultFiltersForGame(false));
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

  // Reset filters when game switches so Pokemon eras don't wipe OP results.
  useEffect(() => {
    setFilters(defaultFiltersForGame(isOnePiece));
    setSearchQuery('');
    setCategoryFilter('all');
  }, [isOnePiece, game]);

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
        game: apiGame,
      }, { signal });
      if (signal?.aborted) return;
      setPredictions(res.data);
      if (res.horizonSupport) setHorizonSupport(res.horizonSupport);
      setWindowExperimental(Boolean(res.experimental));
    } catch (err: unknown) {
      if (signal?.aborted || isAbortError(err)) return;
      const message = formatApiError(err, 'Failed to load predictions');
      console.error('Failed to load predictions:', message, err);
      setPredictionsError(message || 'Failed to load predictions');
      setPredictions([]);
    } finally {
      if (!signal?.aborted) setPredictionsLoading(false);
    }
  }, [predictionWindow, filters, searchQuery, sortBy, sortOrder, categoryFilter, apiGame]);

  const loadOverview = useCallback(async (signal?: AbortSignal) => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const data = await marketInsightsApi.getOverview({ signal, game: apiGame });
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
  }, [apiGame]);

  const loadBackendData = useCallback(async () => {
    const [btData, ftStatus] = await Promise.all([
      marketInsightsApi.getBacktestResults().catch(() => ({ data: [] as BacktestResult[] })),
      marketInsightsApi.getForwardTestStatus().catch(() => null),
    ]);
    setBacktestResults(btData?.data || []);
    setForwardStatus(ftStatus);
  }, []);

  const loadModelHealth = useCallback(async (signal?: AbortSignal) => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const [calRes, dqRes] = await Promise.all([
        marketInsightsApi.getCalibrationStatus({ signal }),
        marketInsightsApi.getDataQuality({ signal }),
      ]);
      if (signal?.aborted) return;
      setCalibration(calRes.data ?? []);
      setDataQuality(dqRes);
    } catch (err: unknown) {
      if (signal?.aborted || isAbortError(err)) return;
      const message = formatApiError(err, 'Failed to load model health');
      setHealthError(message || 'Failed to load model health');
    } finally {
      if (!signal?.aborted) setHealthLoading(false);
    }
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

  useEffect(() => {
    if (activeTab !== 'health') return;
    const controller = new AbortController();
    loadModelHealth(controller.signal);
    return () => controller.abort();
  }, [activeTab, loadModelHealth]);

  // If current window becomes unsupported once we know horizon support, snap to a supported one.
  useEffect(() => {
    if (!horizonSupport) return;
    const days = windowToDays(predictionWindow);
    if (!horizonSupport.unsupported.includes(days as 7 | 30 | 90 | 180 | 365)) return;
    const fallback = (['90d', '30d', '7d'] as PredictionWindow[]).find((w) =>
      horizonSupport.supported.includes(windowToDays(w) as 7 | 30 | 90 | 180 | 365)
    );
    if (fallback && fallback !== predictionWindow) {
      setPredictionWindow(fallback);
    }
  }, [horizonSupport, predictionWindow]);

  const handleApplyFilters = useCallback((next: PredictionFilters) => {
    setFilters(next);
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters(defaultFiltersForGame(isOnePiece));
    setSearchQuery('');
    setSortBy('return');
    setSortOrder('desc');
    setCategoryFilter('all');
  }, [isOnePiece]);

  const handleSetPredictionWindow = useCallback((window: PredictionWindow) => {
    if (horizonSupport?.unsupported.includes(windowToDays(window) as 7 | 30 | 90 | 180 | 365)) {
      return;
    }
    setPredictionWindow(window);
  }, [horizonSupport]);

  const handleRunPredictions = async () => {
    setRunningPrediction(true);
    try {
      const result = await marketInsightsApi.triggerPredictionRun();
      showMessage(`Prediction run ${result.runId}: ${result.message}`);
      await Promise.all([loadPredictions(), loadOverview(), loadBackendData(), loadModelHealth()]);
    } catch (err: unknown) {
      showMessage(formatApiError(err, 'Failed to run predictions (admin login required)'));
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
    } catch (err: unknown) {
      showMessage(formatApiError(err, 'Forward test update failed (admin login required)'));
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
    } catch (err: unknown) {
      showMessage(formatApiError(err, 'Backtest failed (admin login required)'));
    } finally {
      setRunningBacktest(false);
    }
  };

  const windowStatus = useCallback((window: PredictionWindow) => {
    const days = windowToDays(window) as 7 | 30 | 90 | 180 | 365;
    if (!horizonSupport) return 'unknown' as const;
    if (horizonSupport.unsupported.includes(days)) return 'unsupported' as const;
    if (horizonSupport.experimental.includes(days)) return 'experimental' as const;
    return 'supported' as const;
  }, [horizonSupport]);

  return {
    activeTab, setActiveTab,
    predictions, predictionsLoading, predictionsError,
    overview, overviewLoading, overviewError,
    backtestResults, forwardStatus,
    calibration, dataQuality, healthLoading, healthError, loadModelHealth,
    horizonSupport, windowExperimental, windowStatus,
    runningPrediction, runningBacktest, refreshingForward,
    predictionWindow, setPredictionWindow: handleSetPredictionWindow,
    filters, searchQuery, setSearchQuery,
    sortBy, setSortBy, sortOrder, setSortOrder,
    categoryFilter, setCategoryFilter,
    backtestDate, setBacktestDate,
    message,
    handleApplyFilters, handleResetFilters,
    handleRunPredictions, handleRunBacktest, handleRefreshForwardTest,
    loadPredictions, loadOverview, showMessage,
    DEFAULT_FILTERS,
    isOnePiece,
  };
}
