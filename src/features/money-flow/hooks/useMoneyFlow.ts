import { useEffect, useRef, useState } from 'react';
import type { MoneyFlowWindowDays } from '@tcgtracker/shared';
import { fetchMoneyFlow, type MoneyFlowResponse } from '../../../services/moneyFlowApi';

/** Keep last good payload while refetching so window switches feel instant. */
export function useMoneyFlow(days: MoneyFlowWindowDays) {
  const [data, setData] = useState<MoneyFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);
  const daysRef = useRef(days);

  useEffect(() => {
    const ac = new AbortController();
    const daysChanged = daysRef.current !== days;
    daysRef.current = days;
    setError(null);
    if (hasDataRef.current) setRefreshing(true);
    else setLoading(true);

    fetchMoneyFlow(days)
      .then((payload) => {
        if (ac.signal.aborted) return;
        setData(payload);
        hasDataRef.current = true;
        setError(null);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError((err as Error)?.message || 'Could not load money flow');
        if (!hasDataRef.current || daysChanged) setData(null);
      })
      .finally(() => {
        if (ac.signal.aborted) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => ac.abort();
  }, [days]);

  return { data, loading, refreshing, error };
}
