import { buildApiUrl } from '../config/env';

export interface PopulationCompanyResult {
  grader: 'psa' | 'cgc' | 'beckett';
  total: number | null;
  grade10?: number | null;
  grade9?: number | null;
  pop?: number[] | null;
  status: 'ok' | 'unavailable' | 'error';
  source: 'cache' | 'scrape' | 'none';
  productId?: string | null;
  verified?: boolean;
  matchScore?: number | null;
  message?: string;
}

export interface PopulationLookupResponse {
  key: string;
  cardId?: string;
  cardName: string;
  setId?: string;
  setName?: string;
  cardNumber?: string;
  variant?: string;
  fetchedAt: number;
  cached: boolean;
  stale: boolean;
  ageHours: number | null;
  productId: string | null;
  verified: boolean;
  companies: {
    psa: PopulationCompanyResult;
    cgc: PopulationCompanyResult;
    beckett: PopulationCompanyResult;
  };
}

export const fetchCardPopulation = async (params: {
  cardId?: string;
  cardName: string;
  setId?: string;
  setName?: string;
  cardNumber?: string;
  variant?: string;
}): Promise<PopulationLookupResponse | null> => {
  const url = new URL(buildApiUrl('/api/cards/population'));
  if (params.cardId) url.searchParams.set('cardId', params.cardId);
  url.searchParams.set('cardName', params.cardName);
  if (params.setId) url.searchParams.set('setId', params.setId);
  if (params.setName) url.searchParams.set('setName', params.setName);
  if (params.cardNumber) url.searchParams.set('cardNumber', params.cardNumber);
  if (params.variant) url.searchParams.set('variant', params.variant);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as PopulationLookupResponse;
  } catch {
    return null;
  }
};
