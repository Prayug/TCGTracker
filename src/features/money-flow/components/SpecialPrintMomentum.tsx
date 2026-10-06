import { useMemo, useState } from 'react';
import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { confidenceLabel, formatPct, moveTone } from '../lib/format';
import { TrendBar } from './TrendBar';

type SortKey = 'move' | 'rising' | 'n';

export function SpecialPrintMomentum({ specials }: { specials: MoneyFlowCohort[] }) {
  const [sort, setSort] = useState<SortKey>('move');
  const rows = useMemo(() => {
    const list = specials.filter((s) => s.sampleSize > 0);
    return [...list].sort((a, b) => {
      if (sort === 'rising') return (b.breadthUpPct ?? -999) - (a.breadthUpPct ?? -999);
      if (sort === 'n') return b.sampleSize - a.sampleSize;
      return Math.abs(b.medianReturnPct ?? 0) - Math.abs(a.medianReturnPct ?? 0);
    });
  }, [specials, sort]);
  const maxAbs = Math.max(3, ...rows.map((r) => Math.abs(r.medianReturnPct ?? 0)));

  return (
    <section className="mf-term__panel" aria-label="Special print momentum">
      <div className="mf-term__panel-head">
        <h2 className="mf-term__panel-title">Special print momentum</h2>
        <div className="mf-term__tabs" role="group" aria-label="Sort specials">
          {(
            [
              ['move', 'By move'],
              ['rising', 'By rising'],
              ['n', 'By n'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="mf-term__tab"
              aria-pressed={sort === id}
              onClick={() => setSort(id)}
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
              <th>#</th>
              <th>Special</th>
              <th className="is-num">Move</th>
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
                  No special prints in window
                </td>
              </tr>
            ) : (
              rows.map((c, i) => (
                <tr key={c.id}>
                  <td className="is-num mf-term__rank">{i + 1}</td>
                  <td>
                    <span className="mf-term__seg">{c.label}</span>
                    {c.exemplars[0] ? (
                      <span className="mf-term__sub">{c.exemplars[0].productName}</span>
                    ) : null}
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
