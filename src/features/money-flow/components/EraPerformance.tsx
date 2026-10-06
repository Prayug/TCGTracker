import type { MoneyFlowCohort, MoneyFlowEra, MoneyFlowFinish } from '@tcgtracker/shared';
import { confidenceLabel, formatPct, moveTone } from '../lib/format';
import { TrendBar } from './TrendBar';
import type { HeatFilter } from './MoneyFlowHeatmap';

function finishOf(eraFinishes: MoneyFlowCohort[], era: MoneyFlowEra, finish: MoneyFlowFinish) {
  return eraFinishes.find((c) => c.era === era && c.finish === finish);
}

export function EraPerformance({
  eras,
  eraFinishes,
  filter,
  onSelect,
}: {
  eras: MoneyFlowCohort[];
  eraFinishes: MoneyFlowCohort[];
  filter: HeatFilter;
  onSelect: (era: MoneyFlowEra) => void;
}) {
  const maxAbs = Math.max(3, ...eras.map((e) => Math.abs(e.medianReturnPct ?? 0)));

  return (
    <section className="mf-term__panel" aria-label="By era">
      <div className="mf-term__panel-head">
        <h2 className="mf-term__panel-title">By era</h2>
        <span className="mf-term__panel-hint">Raw vs PSA 10 divergence</span>
      </div>
      <div className="mf-term__table-wrap">
        <table className="mf-term__table">
          <thead>
            <tr>
              <th>Era</th>
              <th className="is-num">Move</th>
              <th className="is-num">Rising</th>
              <th className="is-num">n</th>
              <th className="is-num">Raw</th>
              <th className="is-num">PSA 10</th>
              <th>Trust</th>
              <th className="is-trend">Trend</th>
            </tr>
          </thead>
          <tbody>
            {eras.map((era) => {
              const raw = finishOf(eraFinishes, era.key as MoneyFlowEra, 'raw');
              const psa = finishOf(eraFinishes, era.key as MoneyFlowEra, 'psa10');
              const active = filter?.era === era.key;
              return (
                <tr
                  key={era.id}
                  className={`is-click${active ? ' is-active' : ''}`}
                  onClick={() => onSelect(era.key as MoneyFlowEra)}
                >
                  <td>
                    <span className="mf-term__seg">{era.label}</span>
                  </td>
                  <td className={`is-num is-${moveTone(era.medianReturnPct)}`}>
                    {formatPct(era.medianReturnPct)}
                  </td>
                  <td className="is-num">
                    {era.breadthUpPct == null ? '—' : `${Math.round(era.breadthUpPct)}%`}
                  </td>
                  <td className="is-num">{era.sampleSize}</td>
                  <td className={`is-num is-${moveTone(raw?.medianReturnPct)}`}>
                    {formatPct(raw?.medianReturnPct ?? null)}
                  </td>
                  <td className={`is-num is-${moveTone(psa?.medianReturnPct)}`}>
                    {formatPct(psa?.medianReturnPct ?? null)}
                  </td>
                  <td>
                    <span className={`mf-term__trust is-${era.confidence}`}>
                      {confidenceLabel(era.confidence)}
                    </span>
                  </td>
                  <td className="is-trend">
                    <TrendBar value={era.medianReturnPct} maxAbs={maxAbs} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
