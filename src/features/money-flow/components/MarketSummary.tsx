import type { MoneyFlowMarketSummary } from '@tcgtracker/shared';
import { formatPct, moveTone } from '../lib/format';
import { MarketBreadth } from './MarketBreadth';

export function MarketSummary({ summary }: { summary: MoneyFlowMarketSummary }) {
  return (
    <section className="mf-term__summary" aria-label="Market summary">
      <MarketBreadth chased={summary.chasedSharePct} cooled={summary.cooledSharePct} />
      <div className="mf-term__kpi-row">
        <Kpi
          label="Median move"
          value={formatPct(summary.medianMovePct)}
          tone={moveTone(summary.medianMovePct)}
        />
        <Kpi label="Rising" value={String(summary.risingCount)} tone="up" />
        <Kpi label="Falling" value={String(summary.fallingCount)} tone="down" />
        <Kpi
          label="Strongest"
          value={
            summary.strongestLabel
              ? `${summary.strongestLabel} ${formatPct(summary.strongestMovePct)}`
              : '—'
          }
          tone="up"
          wide
        />
        <Kpi
          label="Weakest"
          value={
            summary.weakestLabel
              ? `${summary.weakestLabel} ${formatPct(summary.weakestMovePct)}`
              : '—'
          }
          tone="down"
          wide
        />
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  tone,
  wide,
}: {
  label: string;
  value: string;
  tone: 'up' | 'down' | 'flat';
  wide?: boolean;
}) {
  return (
    <div className={`mf-term__kpi${wide ? ' is-wide' : ''}`}>
      <span className="mf-term__kpi-label">{label}</span>
      <span className={`mf-term__kpi-value is-${tone}`}>{value}</span>
    </div>
  );
}
