import { createContext, useContext } from 'react';
import { InsightsApiClient, marketInsightsApi } from '../../../services/marketInsightsApi';

export const InsightsApiContext = createContext<InsightsApiClient>(marketInsightsApi);

export function useInsightsApi(): InsightsApiClient {
  return useContext(InsightsApiContext);
}
