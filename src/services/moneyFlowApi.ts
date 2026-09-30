import { axios } from '../config/apiClient';
import { buildApiUrl } from '../config/env';
import type { MoneyFlowResponse } from '@tcgtracker/shared';

export type { MoneyFlowResponse, MoneyFlowCohort, MoneyFlowExemplar } from '@tcgtracker/shared';

export async function fetchMoneyFlow(days: 7 | 30 = 7): Promise<MoneyFlowResponse> {
  const url = buildApiUrl(`/api/prices/money-flow?days=${days}`);
  const { data } = await axios.get<MoneyFlowResponse>(url, { timeout: 45_000 });
  return data;
}
