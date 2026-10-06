import type { MoneyFlowResponse, MoneyFlowWindowDays } from '@tcgtracker/shared';
import { formatDate } from '../lib/format';

const WINDOWS: MoneyFlowWindowDays[] = [7, 30, 90];

export function MarketHeader({
  data,
  days,
  onDaysChange,
  refreshing,
}: {
  data: MoneyFlowResponse | null;
  days: MoneyFlowWindowDays;
  onDaysChange: (d: MoneyFlowWindowDays) => void;
  refreshing: boolean;
}) {
  const tracked = data
    ? data.summary.trackedCount || data.headline.rawSampleSize + data.headline.slabSampleSize
    : null;

  return (
    <header className="mf-term__header">
      <div className="mf-term__header-row">
        <h1 className="mf-term__title">Money Flow</h1>
        <div className="mf-term__windows" role="group" aria-label="Window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              className="mf-term__win"
              aria-pressed={days === w}
              onClick={() => onDaysChange(w)}
            >
              {w}D
            </button>
          ))}
        </div>
      </div>
      <p className="mf-term__meta">
        {formatDate(data?.date || data?.headline.asOfDate)}
        {tracked != null ? ` · ${tracked} tracked prints` : ''}
        {data && data.headline.filteredOutCount > 0
          ? ` · −${data.headline.filteredOutCount} bulk`
          : ''}
        {refreshing ? ' · updating' : ''}
      </p>
    </header>
  );
}
