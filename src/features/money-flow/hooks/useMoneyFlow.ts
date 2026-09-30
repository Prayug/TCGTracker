import { useCallback, useEffect, useState } from 'react';
import { fetchMoneyFlow, type MoneyFlowResponse } from '../../../services/moneyFlowApi';

export function useMoneyFlow(days: 7 | 30) {
  const [data, setData] = useState<MoneyFlowResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchMoneyFlow(days)
      .then((payload) => {
        if (!ac.signal.aborted) setData(payload);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError((err as Error)?.message || 'Could not load money flow');
        setData(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [days]);

  useEffect(() => {
    const cancel = reload();
    return cancel;
  }, [reload]);

  return { data, loading, error, reload };
}
