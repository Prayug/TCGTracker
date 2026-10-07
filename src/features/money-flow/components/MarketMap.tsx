import { useMemo } from 'react';
import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { formatPct } from '../lib/format';

export type MapFilter = { cohortId: string; label: string } | null;

type FieldItem = {
  cohort: MoneyFlowCohort;
  typeScale: number;
  weight: number;
  opacity: number;
  nudge: number;
  side: 'in' | 'out';
};

/** Typographic field — size by sample, weight/opacity by move. No cells, bars, or boxes. */
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
  const items = useMemo(() => {
    const pool = [...eraFinishes, ...specials].filter((c) => c.sampleSize > 0);
    const maxN = Math.max(1, ...pool.map((c) => c.sampleSize));
    const maxAbs = Math.max(3, ...pool.map((c) => Math.abs(c.medianReturnPct ?? 0)));
    return pool
      .map((c): FieldItem => {
        const abs = Math.abs(c.medianReturnPct ?? 0);
        const intensity = abs / maxAbs;
        return {
          cohort: c,
          typeScale: 1.05 + (c.sampleSize / maxN) * 1.55,
          weight: 400 + Math.round(intensity * 200),
          opacity: 0.42 + intensity * 0.55,
          nudge: Math.round(((c.medianReturnPct ?? 0) / maxAbs) * 28),
          side: (c.medianReturnPct ?? 0) >= 0 ? 'in' : 'out',
        };
      })
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
          <p className="mf-ed__chapter-aside">Larger type = more prints tracked</p>
        )}
      </div>

      <div className="mf-ed__field" role="group" aria-label="Market segments by move">
        <div className="mf-ed__field-poles" aria-hidden>
          <span>Cooling</span>
          <span>Chased</span>
        </div>
        <div className="mf-ed__field-body">
          {items.map(({ cohort, typeScale, weight, opacity, nudge, side }) => {
            const active = filter?.cohortId === cohort.id;
            const ex = cohort.exemplars[0];
            return (
              <button
                key={cohort.id}
                type="button"
                className={`mf-ed__field-item is-${side}${active ? ' is-active' : ''}`}
                style={{
                  fontSize: `${typeScale}rem`,
                  fontWeight: weight,
                  opacity: active ? 1 : opacity,
                  transform: `translateX(${nudge}px)`,
                }}
                onClick={() =>
                  onFilter(active ? null : { cohortId: cohort.id, label: cohort.label })
                }
              >
                {ex?.imageSmall ? (
                  <img
                    src={ex.imageSmall}
                    alt={ex.productName || cohort.label}
                    className="mf-ed__field-art"
                  />
                ) : null}
                <span className="mf-ed__field-name">{cohort.label}</span>
                <span className="mf-ed__field-meta">
                  {formatPct(cohort.medianReturnPct)}
                  <i aria-hidden>·</i>
                  {cohort.sampleSize} prints
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
