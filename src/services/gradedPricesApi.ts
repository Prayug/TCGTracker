import { buildApiUrl } from '../config/env';

export interface GradedPriceEntry {
  grader: string;
  grade: string;
  price: number | null;
  soldListings: number;
}

export interface GradedPriceResult {
  cardId: string;
  cardName: string;
  setName: string;
  prices: GradedPriceEntry[];
  fetchedAt: string;
  cached: boolean;
}

export const fetchGradedPrices = async (params: {
  cardId: string;
  cardName: string;
  setId?: string;
  setName?: string;
  cardNumber?: string;
}): Promise<GradedPriceResult | null> => {
  const url = new URL(buildApiUrl('/api/cards/graded-prices'));
  url.searchParams.set('cardId', params.cardId);
  url.searchParams.set('cardName', params.cardName);
  if (params.setId) url.searchParams.set('setId', params.setId);
  if (params.setName) url.searchParams.set('setName', params.setName);
  if (params.cardNumber) url.searchParams.set('cardNumber', params.cardNumber);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const json = await response.json();
    return (json?.data ?? json) as GradedPriceResult;
  } catch {
    return null;
  }
};
