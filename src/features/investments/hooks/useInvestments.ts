import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchBuyoutCandidates,
  fetchInvestmentSignals,
  fetchOpportunities,
  fetchSimilarSlabs,
  fetchSlabMovers,
} from '../../../services/investmentOpportunitiesApi';
import { slabBookService } from '../../../services/slabBookService';
import type {
  BuyoutScanResult,
  InvestmentSignalsResult,
  InvestmentsTab,
  MoverDirection,
  OpportunitiesResult,
  SignalDirection,
  SignalSort,
  SimilarSlabsResult,
  SlabMoversResult,
} from '../types';

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export function useInvestments() {
  const [activeTab, setActiveTab] = useState<InvestmentsTab>('opportunities');

  // Loading defaults to true so freshly-activated tabs show a spinner
  // instead of flashing their empty state before the fetch effect runs.

  // Opportunities
  const [opportunities, setOpportunities] = useState<OpportunitiesResult | null>(null);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(true);
  const [minScore, setMinScore] = useState(0);

  // Movers
  const [movers, setMovers] = useState<SlabMoversResult | null>(null);
  const [moversLoading, setMoversLoading] = useState(true);
  const [moversDays, setMoversDays] = useState<7 | 30 | 90>(7);
  const [moversDirection, setMoversDirection] = useState<MoverDirection | 'all'>('all');

  // Buyouts
  const [buyouts, setBuyouts] = useState<BuyoutScanResult | null>(null);
  const [buyoutsLoading, setBuyoutsLoading] = useState(true);

  // Similar slabs
  const [similar, setSimilar] = useState<SimilarSlabsResult | null>(null);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [anchorIds, setAnchorIds] = useState<string[]>([]);

  // Signals (external market intelligence)
  const [signals, setSignals] = useState<InvestmentSignalsResult | null>(null);
  const [signalsLoadedAt, setSignalsLoadedAt] = useState<Date | null>(null);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [signalCategory, setSignalCategory] = useState<string | null>(null);
  const [signalDirection, setSignalDirection] = useState<SignalDirection | null>(null);
  const [signalSort, setSignalSort] = useState<SignalSort>('score');

  const [error, setError] = useState<string | null>(null);

  const slabLots = useMemo(() => slabBookService.getLots(), []);

  // Default similar-slab anchors to the owned slab book.
  useEffect(() => {
    if (anchorIds.length > 0) return;
    const owned = [...new Set(slabLots.map((l) => l.cardId))].slice(0, 8);
    if (owned.length > 0) setAnchorIds(owned);
  }, [slabLots, anchorIds.length]);

  const loadOpportunities = useCallback(
    async (signal?: AbortSignal) => {
      setOpportunitiesLoading(true);
      setError(null);
      try {
        const res = await fetchOpportunities({ limit: 30, minScore }, signal);
        if (signal?.aborted) return;
        if (!res) setError('Failed to load opportunities');
        setOpportunities(res);
      } catch (err) {
        if (!isAbort(err)) setError('Failed to load opportunities');
      } finally {
        if (!signal?.aborted) setOpportunitiesLoading(false);
      }
    },
    [minScore]
  );

  const loadMovers = useCallback(
    async (signal?: AbortSignal) => {
      setMoversLoading(true);
      setError(null);
      try {
        const res = await fetchSlabMovers(
          {
            days: moversDays,
            direction: moversDirection === 'all' ? undefined : moversDirection,
            limit: 50,
          },
          signal
        );
        if (signal?.aborted) return;
        if (!res) setError('Failed to load movers');
        setMovers(res);
      } catch (err) {
        if (!isAbort(err)) setError('Failed to load movers');
      } finally {
        if (!signal?.aborted) setMoversLoading(false);
      }
    },
    [moversDays, moversDirection]
  );

  const loadBuyouts = useCallback(async (signal?: AbortSignal) => {
    setBuyoutsLoading(true);
    setError(null);
    try {
      const res = await fetchBuyoutCandidates({ days: 14, limit: 20 }, signal);
      if (signal?.aborted) return;
      if (!res) setError('Failed to load buyout candidates');
      setBuyouts(res);
    } catch (err) {
      if (!isAbort(err)) setError('Failed to load buyout candidates');
    } finally {
      if (!signal?.aborted) setBuyoutsLoading(false);
    }
  }, []);

  const loadSimilar = useCallback(
    async (signal?: AbortSignal) => {
      if (anchorIds.length === 0) {
        setSimilar(null);
        return;
      }
      setSimilarLoading(true);
      setError(null);
      try {
        const res = await fetchSimilarSlabs({ cardIds: anchorIds, days: 30, limit: 6 }, signal);
        if (signal?.aborted) return;
        if (!res) setError('Failed to load similar slabs');
        setSimilar(res);
      } catch (err) {
        if (!isAbort(err)) setError('Failed to load similar slabs');
      } finally {
        if (!signal?.aborted) setSimilarLoading(false);
      }
    },
    [anchorIds]
  );

  const loadSignals = useCallback(
    async (signal?: AbortSignal) => {
      setSignalsLoading(true);
      setError(null);
      try {
        const res = await fetchInvestmentSignals(
          {
            limit: 80,
            type: signalCategory ?? undefined,
            direction: signalDirection ?? undefined,
            sort: signalSort,
          },
          signal
        );
        if (signal?.aborted) return;
        if (!res) setError('Failed to load signals');
        setSignals(res);
        setSignalsLoadedAt(new Date());
      } catch (err) {
        if (!isAbort(err)) setError('Failed to load signals');
      } finally {
        if (!signal?.aborted) setSignalsLoading(false);
      }
    },
    [signalCategory, signalDirection, signalSort]
  );

  // Load the active tab's data lazily (and reload when its params change).
  useEffect(() => {
    const controller = new AbortController();
    if (activeTab === 'opportunities') loadOpportunities(controller.signal);
    else if (activeTab === 'movers') loadMovers(controller.signal);
    else if (activeTab === 'buyouts') loadBuyouts(controller.signal);
    else if (activeTab === 'similar') loadSimilar(controller.signal);
    else if (activeTab === 'signals') loadSignals(controller.signal);
    return () => controller.abort();
  }, [activeTab, loadOpportunities, loadMovers, loadBuyouts, loadSimilar, loadSignals]);

  const refresh = useCallback(() => {
    if (activeTab === 'opportunities') loadOpportunities();
    else if (activeTab === 'movers') loadMovers();
    else if (activeTab === 'buyouts') loadBuyouts();
    else if (activeTab === 'similar') loadSimilar();
    else if (activeTab === 'signals') loadSignals();
  }, [activeTab, loadOpportunities, loadMovers, loadBuyouts, loadSimilar, loadSignals]);

  return {
    activeTab,
    setActiveTab,
    error,
    refresh,
    opportunities,
    opportunitiesLoading,
    minScore,
    setMinScore,
    movers,
    moversLoading,
    moversDays,
    setMoversDays,
    moversDirection,
    setMoversDirection,
    buyouts,
    buyoutsLoading,
    similar,
    similarLoading,
    anchorIds,
    setAnchorIds,
    slabLots,
    signals,
    signalsLoading,
    signalsLoadedAt,
    signalCategory,
    setSignalCategory,
    signalDirection,
    setSignalDirection,
    signalSort,
    setSignalSort,
  };
}
