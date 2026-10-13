import { useMemo } from 'react';
import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { filterFromCohort, type SegmentFilter } from '../lib/filter';
import { formatPct, moveTone, niceAxisBound, printsLabel } from '../lib/format';

export type MapFilter = SegmentFilter;

const MAX_ROWS = 10;

export function MarketMap({
  eraFinishes,
  specials,
  filter,
  onFilter,
}: {
  eraFinishes: MoneyFlowCohort[];
  specials: MoneyFlowCohort[];
  filter: SegmentFilter | null;
  onFilter: (f: SegmentFilter | null) => void;
}) {
  const items = useMemo(() => {
    const eras = eraFinishes.filter((c) => c.sampleSize > 0);
    const extras = specials
      .filter((c) => c.sampleSize > 0)
      .sort((a, b) => Math.abs(b.medianReturnPct ?? 0) - Math.abs(a.medianReturnPct ?? 0));
    const room = Math.max(0, MAX_ROWS - eras.length);
    return [...eras, ...extras.slice(0, room)].sort(
      (a, b) => (b.medianReturnPct ?? 0) - (a.medianReturnPct ?? 0)
    );
  }, [eraFinishes, specials]);

  const bound = useMemo(
    () =>
      niceAxisBound(
        items.map((c) => c.medianReturnPct),
        10
      ),
    [items]
  );

  return (
    <section className="mf__section" aria-label="Where money is moving">
      <div className="mf__section-head">
        <h2 className="mf__section-title">Where money is moving</h2>
        {filter ? (
          <button type="button" className="mf__clear" onClick={() => onFilter(null)}>
            Showing {filter.label} — clear
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="mf__empty">No segment moves this window.</p>
      ) : (
        <div className="mf__axis" role="group" aria-label="Market segments by median move">
          <div className="mf__axis-head" aria-hidden>
            <span />
            <span className="mf__axis-zero-label">
              <i>0</i>
            </span>
            <span />
            <span />
          </div>
          {items.map((cohort) => {
            const value = cohort.medianReturnPct ?? 0;
            const span = Math.min(100, (Math.abs(value) / bound) * 100);
            const tone = moveTone(cohort.medianReturnPct);
            const active = filter?.cohortId === cohort.id;
            return (
              <button
                key={cohort.id}
                type="button"
                className={`mf__axis-row${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => onFilter(active ? null : filterFromCohort(cohort))}
              >
                <span className="mf__axis-label">{cohort.label}</span>
                <span className="mf__axis-track">
                  <span className="mf__axis-neg">
                    {tone === 'down' ? (
                      <span className="mf__axis-fill is-down" style={{ width: `${span}%` }} />
                    ) : null}
                  </span>
                  <span className="mf__axis-zero" />
                  <span className="mf__axis-pos">
                    {tone !== 'down' ? (
                      <span className={`mf__axis-fill is-${tone}`} style={{ width: `${span}%` }} />
                    ) : null}
                  </span>
                </span>
                <span className={`mf__num is-${tone}`}>{formatPct(cohort.medianReturnPct)}</span>
                <span className="mf__axis-n">{printsLabel(cohort.sampleSize)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
