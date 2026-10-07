import { useMemo } from 'react';
import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { formatPct } from '../lib/format';

export type MapFilter = { cohortId: string; label: string } | null;

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
  const rows = useMemo(() => {
    const pool = [...eraFinishes, ...specials].filter((c) => c.sampleSize > 0);
    const maxN = Math.max(1, ...pool.map((c) => c.sampleSize));
    const maxAbs = Math.max(3, ...pool.map((c) => Math.abs(c.medianReturnPct ?? 0)));
    return pool
      .map((c) => ({
        cohort: c,
        // Type scale 0.85–1.55rem from sample weight
        typeScale: 0.85 + (c.sampleSize / maxN) * 0.7,
        bar: Math.max(6, (Math.abs(c.medianReturnPct ?? 0) / maxAbs) * 100),
        side: (c.medianReturnPct ?? 0) >= 0 ? 'in' : 'out',
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
        ) : null}
      </div>

      <div className="mf-ed__scale" role="list">
        <div className="mf-ed__scale-axis" aria-hidden>
          <span>Cooling</span>
          <span>Chased</span>
        </div>
        {rows.map(({ cohort, typeScale, bar, side }) => {
          const active = filter?.cohortId === cohort.id;
          return (
            <button
              key={cohort.id}
              type="button"
              role="listitem"
              className={`mf-ed__scale-row is-${side}${active ? ' is-active' : ''}`}
              onClick={() => onFilter(active ? null : { cohortId: cohort.id, label: cohort.label })}
            >
              <span className="mf-ed__scale-name" style={{ fontSize: `${typeScale}rem` }}>
                {cohort.label}
                <em>
                  {cohort.sampleSize} prints
                  {cohort.exemplars[0] ? ` · ${cohort.exemplars[0].productName}` : ''}
                </em>
              </span>
              <span className="mf-ed__scale-track" aria-hidden>
                <span className={`mf-ed__scale-arm is-${side}`} style={{ width: `${bar}%` }} />
              </span>
              <span className="mf-ed__scale-pct">{formatPct(cohort.medianReturnPct)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
