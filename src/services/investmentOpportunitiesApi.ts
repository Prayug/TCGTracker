import { buildApiUrl } from '../config/env';
import type {
  BuyoutScanResult,
  InvestmentSignalsResult,
  MoverDirection,
  OpportunitiesResult,
  SignalDirection,
  SignalSort,
  SimilarSlabsResult,
  SlabMoversResult,
} from '../features/investments/types';

async function getJson<T>(url: URL, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) return null;
    const json = await response.json();
    return (json?.data ?? json) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    return null;
  }
}

export const fetchSlabMovers = async (
  params?: { days?: number; direction?: MoverDirection; limit?: number },
  signal?: AbortSignal
): Promise<SlabMoversResult | null> => {
  const url = new URL(buildApiUrl('/api/investments/movers'));
  if (params?.days != null) url.searchParams.set('days', String(params.days));
  if (params?.direction) url.searchParams.set('direction', params.direction);
  if (params?.limit != null) url.searchParams.set('limit', String(params.limit));
  return getJson<SlabMoversResult>(url, signal);
};

export const fetchSimilarSlabs = async (
  params: { cardId?: string; cardIds?: string[]; days?: number; limit?: number },
  signal?: AbortSignal
): Promise<SimilarSlabsResult | null> => {
  const url = new URL(buildApiUrl('/api/investments/similar'));
  if (params.cardId) url.searchParams.set('cardId', params.cardId);
  if (params.cardIds?.length) url.searchParams.set('cardIds', params.cardIds.join(','));
  if (params.days != null) url.searchParams.set('days', String(params.days));
  if (params.limit != null) url.searchParams.set('limit', String(params.limit));
  return getJson<SimilarSlabsResult>(url, signal);
};

export const fetchBuyoutCandidates = async (
  params?: { days?: number; limit?: number },
  signal?: AbortSignal
): Promise<BuyoutScanResult | null> => {
  const url = new URL(buildApiUrl('/api/investments/buyouts'));
  if (params?.days != null) url.searchParams.set('days', String(params.days));
  if (params?.limit != null) url.searchParams.set('limit', String(params.limit));
  return getJson<BuyoutScanResult>(url, signal);
};

export const fetchOpportunities = async (
  params?: { limit?: number; minScore?: number },
  signal?: AbortSignal
): Promise<OpportunitiesResult | null> => {
  const url = new URL(buildApiUrl('/api/investments/opportunities'));
  if (params?.limit != null) url.searchParams.set('limit', String(params.limit));
  if (params?.minScore != null) url.searchParams.set('minScore', String(params.minScore));
  return getJson<OpportunitiesResult>(url, signal);
};

export const fetchInvestmentSignals = async (
  params?: { limit?: number; type?: string; direction?: SignalDirection; sort?: SignalSort },
  signal?: AbortSignal
): Promise<InvestmentSignalsResult | null> => {
  const url = new URL(buildApiUrl('/api/investments/external-factors'));
  if (params?.limit != null) url.searchParams.set('limit', String(params.limit));
  if (params?.type) url.searchParams.set('type', params.type);
  if (params?.direction) url.searchParams.set('direction', params.direction);
  if (params?.sort) url.searchParams.set('sort', params.sort);
  return getJson<InvestmentSignalsResult>(url, signal);
};

/** @deprecated Use fetchInvestmentSignals */
export const fetchExternalFactors = fetchInvestmentSignals;
