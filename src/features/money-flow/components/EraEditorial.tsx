import type { MoneyFlowCohort, MoneyFlowEra } from '@tcgtracker/shared';
import { formatPct } from '../lib/format';

export function EraEditorial({
  eras,
  eraFinishes,
  onSelectEra,
}: {
  eras: MoneyFlowCohort[];
  eraFinishes: MoneyFlowCohort[];
  onSelectEra: (era: MoneyFlowEra) => void;
}) {
  const vintage = eras.find((e) => e.key === 'vintage');
  const modern = eras.find((e) => e.key === 'modern');
  const mid = eras.find((e) => e.key === 'mid');

  const vMed = vintage?.medianReturnPct ?? 0;
  const mMed = modern?.medianReturnPct ?? 0;
  const separating = vMed - mMed;

  const headline =
    separating >= 3
      ? 'Vintage is separating from modern'
      : separating <= -3
        ? 'Modern is outrunning vintage'
        : 'Eras are moving closer together';

  return (
    <section className="mf-ed__era" aria-label="By era">
      <div className="mf-ed__chapter">
        <h2 className="mf-ed__chapter-title">{headline}</h2>
        <p className="mf-ed__chapter-aside">
          {vintage && modern
            ? `Vintage ${formatPct(vintage.medianReturnPct)} vs modern ${formatPct(modern.medianReturnPct)}${
                mid ? ` · mid-era ${formatPct(mid.medianReturnPct)}` : ''
              }`
            : 'Era comparison'}
        </p>
      </div>

      <div className="mf-ed__era-bars">
        {eras.map((era) => {
          const raw = eraFinishes.find((c) => c.era === era.key && c.finish === 'raw');
          const psa = eraFinishes.find((c) => c.era === era.key && c.finish === 'psa10');
          return (
            <button
              key={era.id}
              type="button"
              className="mf-ed__era-row"
              onClick={() => onSelectEra(era.key as MoneyFlowEra)}
            >
              <span className="mf-ed__era-name">{era.label}</span>
              <span className="mf-ed__era-meta">
                {era.sampleSize} prints
                {raw && psa
                  ? ` · raw ${formatPct(raw.medianReturnPct)} / PSA 10 ${formatPct(psa.medianReturnPct)}`
                  : ''}
              </span>
              <span className="mf-ed__era-pct">{formatPct(era.medianReturnPct)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
