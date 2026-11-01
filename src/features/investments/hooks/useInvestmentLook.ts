/* @refresh reset */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../../contexts/GameContext';
import { fetchInvestmentLook, type InvestmentLookResult } from '../../../services/dealsApi';
import {
  DEALS_LOAD_GAVE_UP,
  passesDealFilters,
  sortDeals,
  withAuctionMargin,
} from '../../deals/hooks/useDeals';
import type { Deal, DealFeedTab, DealFiltersState } from '../../deals/types';
import { INVESTMENT_LOOK_FILTERS } from '../investmentLookFilters';

function isAbort(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: string; name?: string; message?: string };
    if (e.code === 'ERR_CANCELED' || e.name === 'CanceledError' || e.name === 'AbortError')
      return true;
    if (e.code === 'ECONNABORTED') return false;
    if (typeof e.message === 'string' && /cancel|aborted/i.test(e.message)) return true;
  }
  return false;
}

function axiosStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null || !('response' in err)) return null;
  const status = (err as { response?: { status?: number } }).response?.status;
  return typeof status === 'number' ? status : null;
}

export function useInvestmentLook(enabled: boolean) {
  const { game } = useGame();
  const [tab, setActiveTab] = useState<DealFeedTab>('best');
  const [filters, setFilters] = useState<DealFiltersState>(INVESTMENT_LOOK_FILTERS);
  const [result, setResult] = useState<InvestmentLookResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadId = useRef(0);
  const inFlight = useRef(false);
  const backoffUntil = useRef(0);
  const hasResult = useRef(false);
  const retryAttempt = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal, forceRefresh: boolean | 'full' = false, silent = false) => {
      if (!enabled) return;
      if (silent && inFlight.current) return;
      if (silent && Date.now() < backoffUntil.current) return;
      const id = loadId.current + 1;
      loadId.current = id;
      inFlight.current = true;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await fetchInvestmentLook(
          {
            game,
            type: 'all',
            listingType: 'all',
            minDiscount: 0,
            minSavings: 0,
            minMarketValue: 0,
            refresh: forceRefresh,
          },
          signal
        );
        if (signal?.aborted || loadId.current !== id) return;
        hasResult.current = true;
        retryAttempt.current = 0;
        setResult(data);
        setError(null);
      } catch (err) {
        if (isAbort(err) || signal?.aborted || loadId.current !== id) return;
        const status = axiosStatus(err);
        if (status === 429 || (status != null && status >= 500)) {
          backoffUntil.current = Date.now() + (status === 429 ? 30_000 : 8_000);
        }
        if (silent && hasResult.current) return;
        if (!hasResult.current) {
          setError(
            status === 429 ? 'Too many requests — retrying shortly' : 'Reconnecting to the scan'
          );
          return;
        }
        setError('Failed to load eBay listings');
      } finally {
        if (loadId.current === id) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [enabled, game]
  );

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled || !error || result || error === DEALS_LOAD_GAVE_UP) return;
    retryAttempt.current += 1;
    if (retryAttempt.current > 6) {
      setError(DEALS_LOAD_GAVE_UP);
      return;
    }
    const delay = Math.min(12_000, 800 * 2 ** (retryAttempt.current - 1));
    const timer = window.setTimeout(() => {
      void load(undefined, false, false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [enabled, error, result, load]);

  const scanning = Boolean(enabled && result?.meta.scanning);
  useEffect(() => {
    if (!scanning) return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load(undefined, false, true);
    };
    const timer = window.setInterval(tick, 5_000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [scanning, load]);

  const prevGame = useRef(game);
  useEffect(() => {
    if (prevGame.current === game) return;
    prevGame.current = game;
    setResult(null);
    hasResult.current = false;
    setActiveTab('best');
    setFilters(INVESTMENT_LOOK_FILTERS);
  }, [game]);

  const deals: Deal[] = useMemo(() => {
    if (!result) return [];
    const filterState =
      tab === 'review' ? { ...filters, minDiscount: 0, minSavings: 0, minMarketValue: 0 } : filters;
    const source = tab === 'review' ? result.review : result.deals;
    let list = source.filter((deal) => passesDealFilters(deal, filterState));
    if (tab === 'raw') list = list.filter((deal) => deal.dealCondition === 'raw');
    if (tab === 'graded') list = list.filter((deal) => deal.dealCondition === 'graded');
    if (tab === 'auctions') list = list.filter((deal) => deal.listingType === 'auction');
    return sortDeals(
      list.map((deal) => withAuctionMargin(deal, filters.desiredAuctionMargin)),
      filters.sort
    );
  }, [result, tab, filters]);

  const relaxFilters = useCallback(() => {
    setFilters(INVESTMENT_LOOK_FILTERS);
  }, []);

  return {
    game,
    tab,
    setActiveTab,
    filters,
    setFilters,
    result,
    deals,
    loading: enabled && loading,
    error,
    refresh: () => {
      retryAttempt.current = 0;
      void load(undefined, true);
    },
    fullRescan: () => {
      retryAttempt.current = 0;
      void load(undefined, 'full');
    },
    relaxFilters,
  };
}
