/* @refresh reset */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGame } from '../../../contexts/GameContext';
import { fetchDeals } from '../../../services/dealsApi';
import { listingTitleLooksNonEnglish } from '../listingLanguage';
import type { Deal, DealFeedTab, DealFiltersState, DealSort, DealsResult } from '../types';
import { DEFAULT_DEAL_FILTERS } from '../types';

function isAbort(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: string; name?: string; message?: string };
    if (e.code === 'ERR_CANCELED' || e.name === 'CanceledError') return true;
    if (typeof e.message === 'string' && /cancel/i.test(e.message)) return true;
  }
  return false;
}

function axiosStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null || !('response' in err)) return null;
  const status = (err as { response?: { status?: number } }).response?.status;
  return typeof status === 'number' ? status : null;
}

function passesDealFilters(deal: Deal, filters: DealFiltersState): boolean {
  if (filters.listingType !== 'all' && deal.listingType !== filters.listingType) return false;
  if (filters.gradingCompany && (deal.grader || '') !== filters.gradingCompany) return false;
  if (filters.grade && (deal.grade || '').toLowerCase() !== filters.grade.toLowerCase())
    return false;
  if (filters.set) {
    const q = filters.set.toLowerCase();
    if (!deal.setName.toLowerCase().includes(q) && deal.setId !== filters.set) return false;
  }
  if (filters.freeShipping && deal.shipping > 0) return false;
  if (filters.cardCondition && deal.cardCondition !== filters.cardCondition) return false;
  if ((deal.language || 'en') !== 'en') return false;
  if (deal.uniqueIdentifier?.startsWith('ja|')) return false;
  if (listingTitleLooksNonEnglish(deal.listingTitle)) return false;
  if (deal.marketValue < filters.minMarketValue) return false;
  if (deal.discountPercent < filters.minDiscount) return false;
  if (deal.discountAmount < filters.minSavings) return false;
  return true;
}

function sortDeals(deals: Deal[], sort: DealSort): Deal[] {
  const copy = [...deals];
  switch (sort) {
    case 'discount_pct':
      return copy.sort((a, b) => b.discountPercent - a.discountPercent);
    case 'savings':
      return copy.sort((a, b) => b.discountAmount - a.discountAmount);
    case 'price':
      return copy.sort((a, b) => a.allInCost - b.allInCost);
    case 'market':
      return copy.sort((a, b) => b.marketValue - a.marketValue);
    case 'ending':
      return copy.sort((a, b) => {
        const ah = a.hoursRemaining ?? Number.POSITIVE_INFINITY;
        const bh = b.hoursRemaining ?? Number.POSITIVE_INFINITY;
        return ah - bh;
      });
    default:
      return copy.sort((a, b) => b.dealScore - a.dealScore);
  }
}

function withAuctionMargin(deal: Deal, margin: number): Deal {
  if (deal.listingType !== 'auction') return deal;
  const ship = Number.isFinite(deal.shipping) && deal.shipping > 0 ? deal.shipping : 0;
  if (!Number.isFinite(deal.marketValue) || deal.marketValue <= 0) {
    return { ...deal, desiredAuctionMargin: margin, maxBid: null };
  }
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) {
    return { ...deal, desiredAuctionMargin: margin, maxBid: null };
  }
  const maxBid = Math.round((deal.marketValue * (1 - margin / 100) - ship) * 100) / 100;
  return {
    ...deal,
    desiredAuctionMargin: margin,
    maxBid: maxBid > 0 ? maxBid : null,
  };
}

export function useDeals() {
  const { game } = useGame();
  const [searchParams, setSearchParams] = useSearchParams();
  const cardId = searchParams.get('cardId') || undefined;

  const [tab, setActiveTab] = useState<DealFeedTab>('best');
  const [filters, setFilters] = useState<DealFiltersState>(DEFAULT_DEAL_FILTERS);
  const [result, setResult] = useState<DealsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadId = useRef(0);
  const inFlight = useRef(false);
  const backoffUntil = useRef(0);
  const hasResult = useRef(false);

  const load = useCallback(
    async (signal?: AbortSignal, forceRefresh = false, silent = false) => {
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
        const data = await fetchDeals(
          {
            game,
            cardId,
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
        setResult(data);
        setError(null);
      } catch (err) {
        if (isAbort(err) || signal?.aborted || loadId.current !== id) return;
        const status = axiosStatus(err);
        if (status === 429 || (status != null && status >= 500)) {
          backoffUntil.current = Date.now() + (status === 429 ? 30_000 : 8_000);
          if (!silent && !hasResult.current) {
            setError(
              status === 429
                ? 'Too many requests — retrying shortly'
                : 'Server restarting — retrying'
            );
          }
          return;
        }
        if (silent && hasResult.current) return;
        setError('Failed to load eBay deals');
      } finally {
        if (loadId.current === id) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [game, cardId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const scanning = Boolean(result?.meta.scanning);
  useEffect(() => {
    if (!scanning) return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load(undefined, false, true);
    };
    const timer = window.setInterval(tick, 15_000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [scanning, load]);

  const clearCardWatch = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('cardId');
        return next;
      },
      { preventScrollReset: true }
    );
  }, [setSearchParams]);

  const prevGame = useRef(game);
  useEffect(() => {
    if (prevGame.current === game) return;
    prevGame.current = game;
    setResult(null);
    hasResult.current = false;
    setActiveTab('best');
    if (cardId) clearCardWatch();
  }, [game, cardId, clearCardWatch]);

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
    setFilters((prev) => ({
      ...prev,
      minDiscount: 0,
      minSavings: 0,
      minMarketValue: 0,
    }));
  }, []);

  return {
    game,
    cardId,
    clearCardWatch,
    tab,
    setActiveTab,
    filters,
    setFilters,
    result,
    deals,
    loading,
    error,
    refresh: () => void load(undefined, true),
    relaxFilters,
  };
}
