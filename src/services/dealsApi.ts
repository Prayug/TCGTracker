import { buildApiUrl } from '../config/env';
import '../config/apiClient';
import axios from 'axios';
import type { Deal, DealGame, DealSort, DealsResult, SavedEbayDeal } from '../features/deals/types';

export interface FetchDealsParams {
  game: DealGame;
  cardId?: string;
  type?: 'all' | 'raw' | 'graded';
  listingType?: 'all' | 'bin' | 'auction';
  minDiscount?: number;
  minSavings?: number;
  minMarketValue?: number;
  gradingCompany?: string;
  grade?: string;
  set?: string;
  minPrice?: number;
  maxPrice?: number;
  freeShipping?: boolean;
  language?: 'en' | 'ja';
  sort?: DealSort;
  desiredAuctionMargin?: number;
  refresh?: boolean;
}

function toSearchParams(params: FetchDealsParams): URLSearchParams {
  const q = new URLSearchParams();
  q.set('game', params.game);
  if (params.cardId) q.set('cardId', params.cardId);
  if (params.type && params.type !== 'all') q.set('type', params.type);
  if (params.listingType && params.listingType !== 'all') q.set('listingType', params.listingType);
  if (params.minDiscount != null) q.set('minDiscount', String(params.minDiscount));
  if (params.minSavings != null) q.set('minSavings', String(params.minSavings));
  if (params.minMarketValue != null) q.set('minMarketValue', String(params.minMarketValue));
  if (params.gradingCompany) q.set('gradingCompany', params.gradingCompany);
  if (params.grade) q.set('grade', params.grade);
  if (params.set) q.set('set', params.set);
  if (params.minPrice != null) q.set('minPrice', String(params.minPrice));
  if (params.maxPrice != null) q.set('maxPrice', String(params.maxPrice));
  if (params.freeShipping) q.set('freeShipping', '1');
  if (params.language) q.set('language', params.language);
  if (params.sort) q.set('sort', params.sort);
  if (params.desiredAuctionMargin != null) {
    q.set('desiredAuctionMargin', String(params.desiredAuctionMargin));
  }
  if (params.refresh) q.set('refresh', '1');
  return q;
}

export async function fetchDeals(
  params: FetchDealsParams,
  signal?: AbortSignal
): Promise<DealsResult> {
  const path = params.cardId
    ? `/api/deals/card/${encodeURIComponent(params.cardId)}`
    : '/api/deals';
  const url = `${buildApiUrl(path)}?${toSearchParams({ ...params, cardId: undefined }).toString()}`;
  const res = await axios.get<{ success: boolean; data: DealsResult }>(url, {
    signal,
    withCredentials: true,
    timeout: 120000,
  });
  return res.data.data;
}

export async function fetchSavedDeals(
  game: DealGame,
  signal?: AbortSignal
): Promise<SavedEbayDeal[]> {
  const url = new URL(buildApiUrl('/api/deals/saved'));
  url.searchParams.set('game', game);
  const res = await axios.get<{ success: boolean; data: { deals: SavedEbayDeal[] } }>(
    url.toString(),
    { signal, withCredentials: true }
  );
  return res.data.data.deals;
}

export async function saveDeal(deal: Deal, game: DealGame): Promise<SavedEbayDeal> {
  const res = await axios.post<{ success: boolean; data: { deal: SavedEbayDeal } }>(
    buildApiUrl(`/api/deals/${encodeURIComponent(deal.listingId)}/save`),
    {
      game,
      cardId: deal.cardId,
      uniqueIdentifier: deal.uniqueIdentifier,
      listingUrl: deal.listingUrl,
      listingPrice: deal.listingPrice,
      shippingPrice: deal.shipping,
      marketPriceSnapshot: deal.marketValue,
      discountPercentSnapshot: deal.discountPercent,
      matchConfidence: deal.matchConfidence,
      listingEndTime: deal.endDate,
    },
    { withCredentials: true }
  );
  return res.data.data.deal;
}

export async function unsaveDeal(listingId: string): Promise<void> {
  await axios.delete(buildApiUrl(`/api/deals/${encodeURIComponent(listingId)}/save`), {
    withCredentials: true,
  });
}

export async function dismissDeal(listingId: string, game: DealGame): Promise<void> {
  await axios.post(
    buildApiUrl(`/api/deals/${encodeURIComponent(listingId)}/dismiss`),
    { game },
    { withCredentials: true }
  );
}
