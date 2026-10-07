import type { MoneyFlowResponse, MoneyFlowWindowDays } from '@tcgtracker/shared';
import { formatDate, formatPct } from '../lib/format';

const WINDOWS: MoneyFlowWindowDays[] = [7, 30, 90];

export function OpeningStrip({
  data,
  days,
  onDaysChange,
  refreshing,
}: {
  data: MoneyFlowResponse;
  days: MoneyFlowWindowDays;
  onDaysChange: (d: MoneyFlowWindowDays) => void;
  refreshing: boolean;
}) {
  const { summary, headline } = data;
  const risingShare =
    summary.trackedCount > 0
      ? Math.round((summary.risingCount / summary.trackedCount) * 100)
      : Math.round(summary.chasedSharePct);

  const lead =
    summary.strongestLabel != null
      ? `${summary.strongestLabel} are leading the market.`
      : headline.summary;

  return (
    <header className="mf-ed__open">
      <div className="mf-ed__open-top">
        <div>
          <h1 className="mf-ed__title">Money Flow</h1>
          <p className="mf-ed__dateline">
            {formatDate(data.date || headline.asOfDate)} · Pokémon
            {refreshing ? ' · updating' : ''}
          </p>
        </div>
        <div className="mf-ed__windows" role="group" aria-label="Window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              className="mf-ed__win"
              aria-pressed={days === w}
              onClick={() => onDaysChange(w)}
            >
              {w}D
            </button>
          ))}
        </div>
      </div>

      <p className="mf-ed__statement">
        <span className="mf-ed__statement-lead">
          {risingShare}% of tracked cards are moving higher.
        </span>{' '}
        <span className="mf-ed__statement-sub">{lead}</span>
      </p>

      <div
        className="mf-ed__breadth"
        role="img"
        aria-label={`${Math.round(summary.chasedSharePct)} percent chased, ${Math.round(summary.cooledSharePct)} percent cooled`}
      >
        <span style={{ width: `${summary.chasedSharePct}%` }} className="is-in" />
        <span style={{ width: `${summary.cooledSharePct}%` }} className="is-out" />
      </div>

      <dl className="mf-ed__facts">
        <div>
          <dt>Median</dt>
          <dd>{formatPct(summary.medianMovePct)}</dd>
        </div>
        <div>
          <dt>Rising</dt>
          <dd>{summary.risingCount}</dd>
        </div>
        <div>
          <dt>Falling</dt>
          <dd>{summary.fallingCount}</dd>
        </div>
        <div>
          <dt>Tracked</dt>
          <dd>{summary.trackedCount}</dd>
        </div>
      </dl>
    </header>
  );
}
