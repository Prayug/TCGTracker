import { useMemo, type CSSProperties } from 'react';
import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { formatPct } from '../lib/format';

export type MapFilter = { cohortId: string; label: string } | null;

function intensity(median: number | null): number {
  if (median == null) return 0;
  return Math.max(-1, Math.min(1, median / 8));
}

export function MarketMap({
  eraFinishes,
  specials,
  filter,
  onFilter,
}: {
  eraFinishes: MoneyFlowCohort[];
  specials: MoneyFlowCohort[];
  filter: MapFilter;
  onFilter: (f: MapFilter) => void;
}) {
  const cells = useMemo(() => {
    const pool = [...eraFinishes, ...specials].filter((c) => c.sampleSize > 0);
    const maxN = Math.max(1, ...pool.map((c) => c.sampleSize));
    return pool
      .map((c) => ({
        cohort: c,
        weight: 0.55 + (c.sampleSize / maxN) * 1.45,
        t: intensity(c.medianReturnPct),
      }))
      .sort((a, b) => (b.cohort.medianReturnPct ?? 0) - (a.cohort.medianReturnPct ?? 0));
  }, [eraFinishes, specials]);

  return (
    <section className="mf-ed__map" aria-label="Where money is moving">
      <div className="mf-ed__chapter">
        <h2 className="mf-ed__chapter-title">Where money is moving</h2>
        {filter ? (
          <button type="button" className="mf-ed__clear" onClick={() => onFilter(null)}>
            Showing {filter.label} — clear
          </button>
        ) : (
          <p className="mf-ed__chapter-aside">Size by prints tracked · color by typical move</p>
        )}
      </div>

      <div className="mf-ed__field">
        {cells.map(({ cohort, weight, t }) => {
          const active = filter?.cohortId === cohort.id;
          const hue = t >= 0 ? 158 : 4;
          const sat = 35 + Math.abs(t) * 40;
          const light = 18 + Math.abs(t) * 14;
          return (
            <button
              key={cohort.id}
              type="button"
              className={`mf-ed__field-cell${active ? ' is-active' : ''}`}
              style={
                {
                  '--w': weight,
                  '--cell': `hsl(${hue} ${sat}% ${light}%)`,
                } as CSSProperties
              }
              onClick={() => onFilter(active ? null : { cohortId: cohort.id, label: cohort.label })}
            >
              <span className="mf-ed__field-name">{cohort.label}</span>
              <span className="mf-ed__field-pct">{formatPct(cohort.medianReturnPct)}</span>
              <span className="mf-ed__field-n">{cohort.sampleSize} prints</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
