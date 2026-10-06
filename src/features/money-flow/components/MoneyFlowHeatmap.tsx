import {
  MONEY_FLOW_ERAS,
  MONEY_FLOW_FINISHES,
  MONEY_FLOW_ERA_LABELS,
  MONEY_FLOW_FINISH_LABELS,
  type MoneyFlowCohort,
  type MoneyFlowEra,
  type MoneyFlowFinish,
} from '@tcgtracker/shared';
import { formatPct, moveTone } from '../lib/format';

export type HeatFilter = {
  era?: MoneyFlowEra;
  finish?: MoneyFlowFinish;
  cohortId?: string;
} | null;

function cellFor(
  eraFinishes: MoneyFlowCohort[],
  eras: MoneyFlowCohort[],
  era: MoneyFlowEra,
  finish: MoneyFlowFinish | 'total'
): MoneyFlowCohort | undefined {
  if (finish === 'total') return eras.find((c) => c.key === era);
  return eraFinishes.find((c) => c.era === era && c.finish === finish);
}

function heatClass(median: number | null, sample: number): string {
  if (sample === 0 || median == null) return 'is-empty';
  if (median >= 5) return 'is-hot2';
  if (median >= 1.5) return 'is-hot1';
  if (median <= -5) return 'is-cold2';
  if (median <= -1.5) return 'is-cold1';
  return 'is-flat';
}

export function MoneyFlowHeatmap({
  eraFinishes,
  eras,
  filter,
  onFilter,
}: {
  eraFinishes: MoneyFlowCohort[];
  eras: MoneyFlowCohort[];
  filter: HeatFilter;
  onFilter: (f: HeatFilter) => void;
}) {
  const cols: Array<MoneyFlowFinish | 'total'> = [...MONEY_FLOW_FINISHES, 'total'];

  return (
    <section className="mf-term__panel" aria-label="Money flow matrix">
      <div className="mf-term__panel-head">
        <h2 className="mf-term__panel-title">Segment matrix</h2>
        {filter ? (
          <button type="button" className="mf-term__linkbtn" onClick={() => onFilter(null)}>
            Clear filter
          </button>
        ) : (
          <span className="mf-term__panel-hint">Click a cell to filter</span>
        )}
      </div>
      <div className="mf-term__heat" role="table" aria-label="Era by finish returns">
        <div className="mf-term__heat-row is-head" role="row">
          <div className="mf-term__heat-corner" role="columnheader">
            Era
          </div>
          {cols.map((col) => (
            <div key={col} className="mf-term__heat-h" role="columnheader">
              {col === 'total' ? 'Total' : MONEY_FLOW_FINISH_LABELS[col]}
            </div>
          ))}
        </div>
        {MONEY_FLOW_ERAS.map((era) => (
          <div key={era} className="mf-term__heat-row" role="row">
            <div className="mf-term__heat-label" role="rowheader">
              {MONEY_FLOW_ERA_LABELS[era]}
            </div>
            {cols.map((col) => {
              const cell = cellFor(eraFinishes, eras, era, col);
              const median = cell?.medianReturnPct ?? null;
              const sample = cell?.sampleSize ?? 0;
              const active =
                filter &&
                filter.era === era &&
                (col === 'total' ? !filter.finish : filter.finish === col);
              return (
                <div key={col} role="cell" className="mf-term__heat-cell-wrap">
                  <button
                    type="button"
                    className={`mf-term__heat-cell ${heatClass(median, sample)}${active ? ' is-active' : ''}`}
                    disabled={sample === 0}
                    title={
                      sample === 0
                        ? 'No chase prints'
                        : `${cell?.label}: ${formatPct(median)} · ${sample} prints · ${Math.round(cell?.breadthUpPct ?? 0)}% rising`
                    }
                    onClick={() =>
                      onFilter(
                        active
                          ? null
                          : {
                              era,
                              finish: col === 'total' ? undefined : col,
                              cohortId: cell?.id,
                            }
                      )
                    }
                  >
                    <span className={`mf-term__heat-pct is-${moveTone(median)}`}>
                      {sample === 0 ? '—' : formatPct(median, 1)}
                    </span>
                    <span className="mf-term__heat-n">n={sample}</span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
