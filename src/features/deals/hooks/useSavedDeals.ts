/* @refresh reset */
import { useCallback, useEffect, useState } from 'react';
import { useGame } from '../../../contexts/GameContext';
import { useAuth } from '../../../hooks/useAuth';
import { dismissDeal, fetchSavedDeals, saveDeal, unsaveDeal } from '../../../services/dealsApi';
import type { Deal, SavedEbayDeal } from '../types';

function isAbort(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return (err as { code?: string }).code === 'ERR_CANCELED';
  }
  return false;
}

export function useSavedDeals() {
  const { game } = useGame();
  const { isAuthenticated, openAuthModal } = useAuth();
  const [saved, setSaved] = useState<SavedEbayDeal[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!isAuthenticated) {
        setSaved([]);
        return;
      }
      setLoading(true);
      try {
        const rows = await fetchSavedDeals(game, signal);
        if (!signal?.aborted) setSaved(rows);
      } catch (err) {
        if (!isAbort(err) && !signal?.aborted) setSaved([]);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [game, isAuthenticated]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const toggleSave = useCallback(
    async (deal: Deal) => {
      if (!isAuthenticated) {
        openAuthModal('login');
        return;
      }
      const existing = saved.some((row) => row.ebayListingId === deal.listingId);
      if (existing) {
        await unsaveDeal(deal.listingId);
      } else {
        await saveDeal(deal, game);
      }
      await load();
    },
    [game, isAuthenticated, load, openAuthModal, saved]
  );

  const dismiss = useCallback(
    async (listingId: string) => {
      if (!isAuthenticated) return;
      await dismissDeal(listingId, game);
      await load();
    },
    [game, isAuthenticated, load]
  );

  const savedIds = new Set(saved.map((row) => row.ebayListingId));

  return {
    saved,
    savedIds,
    loading,
    toggleSave,
    dismiss,
    refresh: () => void load(),
    isAuthenticated,
  };
}
