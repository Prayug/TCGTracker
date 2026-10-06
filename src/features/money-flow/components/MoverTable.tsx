import { useMemo, useState } from 'react';
import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { confidenceLabel, formatPct, moveTone } from '../lib/format';
import { TrendBar } from './TrendBar';
import type { HeatFilter } from './MoneyFlowHeatmap';

type Tab = 'in' | 'out' | 'active';

function matchesFilter(c: MoneyFlowCohort, filter: HeatFilter): boolean {
  if (!filter) return true;
  if (filter.cohortId && c.id === filter.cohortId) return true;
  if (filter.era && c.era && c.era !== filter.era) return false;
  if (filter.finish && c.finish && c.finish !== filter.finish) return false;
  if (filter.era && !c.era && c.kind === 'special') return true;
  if (filter.era && !c.era) return false;
  return true;
}

export function MoverTable({
  into,
  out,
  active,
  filter,
  onSelect,
  windowDays,
}: {
  into: MoneyFlowCohort[];
  out: MoneyFlowCohort[];
  active: MoneyFlowCohort[];
  filter: HeatFilter;
  onSelect: (c: MoneyFlowCohort) => void;
  windowDays: number;
}) {
  const [tab, setTab] = useState<Tab>('in');
  const rows = useMemo(() => {
    const src = tab === 'in' ? into : tab === 'out' ? out : active;
    return src.filter((c) => matchesFilter(c, filter));
  }, [tab, into, out, active, filter]);

  const maxAbs = Math.max(3, ...rows.map((r) => Math.abs(r.medianReturnPct ?? 0)));

  return (
    <section className="mf-term__panel" aria-label="Segment movers">
      <div className="mf-term__panel-head">
        <h2 className="mf-term__panel-title">Segment movers</h2>
        <div className="mf-term__tabs" role="tablist" aria-label="Mover side">
          {(
            [
              ['in', 'Money in'],
              ['out', 'Money out'],
              ['active', 'Most active'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="mf-term__tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mf-term__table-wrap">
        <table className="mf-term__table">
          <thead>
            <tr>
              <th>Segment</th>
              <th>Example</th>
              <th className="is-num">{windowDays}D</th>
              <th className="is-num">Rising</th>
              <th className="is-num">n</th>
              <th>Trust</th>
              <th className="is-trend">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="mf-term__empty-cell">
                  No segments in this view
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const ex = c.exemplars[0];
                return (
                  <tr key={c.id} className="is-click" onClick={() => onSelect(c)}>
                    <td>
                      <span className="mf-term__seg">{c.label}</span>
                    </td>
                    <td>
                      <span className="mf-term__ex">
                        {ex?.imageSmall ? (
                          <img src={ex.imageSmall} alt="" loading="lazy" />
                        ) : (
                          <span className="mf-term__ex-ph" />
                        )}
                        <span className="mf-term__ex-name">{ex?.productName || '—'}</span>
                      </span>
                    </td>
                    <td className={`is-num is-${moveTone(c.medianReturnPct)}`}>
                      {formatPct(c.medianReturnPct)}
                    </td>
                    <td className="is-num">
                      {c.breadthUpPct == null ? '—' : `${Math.round(c.breadthUpPct)}%`}
                    </td>
                    <td className="is-num">{c.sampleSize}</td>
                    <td>
                      <span className={`mf-term__trust is-${c.confidence}`}>
                        {confidenceLabel(c.confidence)}
                      </span>
                    </td>
                    <td className="is-trend">
                      <TrendBar value={c.medianReturnPct} maxAbs={maxAbs} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
