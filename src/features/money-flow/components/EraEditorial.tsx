import type { MoneyFlowCohort, MoneyFlowEra } from '@tcgtracker/shared';
import { formatPct, formatShare, moveTone } from '../lib/format';

function diverge(raw: number | null | undefined, psa: number | null | undefined): boolean {
  if (raw == null || psa == null || !Number.isFinite(raw) || !Number.isFinite(psa)) return false;
  if ((raw > 0 && psa < 0) || (raw < 0 && psa > 0)) return true;
  return Math.abs(raw - psa) >= 10;
}

export function EraEditorial({
  eras,
  eraFinishes,
  onSelectEra,
}: {
  eras: MoneyFlowCohort[];
  eraFinishes: MoneyFlowCohort[];
  onSelectEra: (era: MoneyFlowEra) => void;
}) {
  return (
    <section className="mf__section" aria-label="Era comparison">
      <div className="mf__section-head">
        <h2 className="mf__section-title">Era comparison</h2>
      </div>

      <div className="mf__table">
        <div className="mf__table-head">
          <span>Era</span>
          <span>Total</span>
          <span>Raw</span>
          <span>PSA 10</span>
          <span>Breadth</span>
          <span>N</span>
        </div>
        {eras.map((era) => {
          const raw = eraFinishes.find((c) => c.era === era.key && c.finish === 'raw');
          const psa = eraFinishes.find((c) => c.era === era.key && c.finish === 'psa10');
          const split = diverge(raw?.medianReturnPct, psa?.medianReturnPct);
          return (
            <button
              key={era.id}
              type="button"
              className={`mf__table-row${split ? ' is-split' : ''}`}
              onClick={() => onSelectEra(era.key as MoneyFlowEra)}
            >
              <span className="mf__row-title">{era.label}</span>
              <span className={`mf__num is-${moveTone(era.medianReturnPct)}`}>
                {formatPct(era.medianReturnPct)}
              </span>
              <span className={`mf__num is-${moveTone(raw?.medianReturnPct)}`}>
                {formatPct(raw?.medianReturnPct)}
              </span>
              <span className={`mf__num is-${moveTone(psa?.medianReturnPct)}`}>
                {formatPct(psa?.medianReturnPct)}
              </span>
              <span className="mf__num">{formatShare(era.breadthUpPct)}</span>
              <span className="mf__num mf__dim">{era.sampleSize}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
