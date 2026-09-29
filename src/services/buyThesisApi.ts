import { axios } from '../config/apiClient';
import { buildApiUrl } from '../config/env';
import type { BuyThesisAnalysis } from '../features/buy-thesis/types';

export async function fetchBuyThesis(cardId: string): Promise<BuyThesisAnalysis> {
  const url = buildApiUrl(`/api/market-insights/buy-thesis/${encodeURIComponent(cardId)}`);
  const { data } = await axios.get<BuyThesisAnalysis>(url, { timeout: 30_000 });
  return data;
}
