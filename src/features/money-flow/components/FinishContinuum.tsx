import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { formatPct } from '../lib/format';

export function FinishContinuum({ finishes }: { finishes: MoneyFlowCohort[] }) {
  const raw = finishes.find((f) => f.key === 'raw');
  const psa = finishes.find((f) => f.key === 'psa10');
  const rawMed = raw?.medianReturnPct ?? null;
  const psaMed = psa?.medianReturnPct ?? null;
  const spread = rawMed != null && psaMed != null ? Math.round((psaMed - rawMed) * 10) / 10 : null;

  let interpretation = 'Not enough finish data to read the spread.';
  if (rawMed != null && psaMed != null && spread != null) {
    if (Math.abs(spread) < 0.5) {
      interpretation = 'PSA 10 and raw are moving together this window.';
    } else if (spread > 0) {
      interpretation = `Graded demand is stronger — PSA 10 leads raw by ${formatPct(spread)}.`;
    } else {
      interpretation = `Ungraded chase is outrunning slabs — raw leads PSA 10 by ${formatPct(-spread)}.`;
    }
  }

  // Continuum position: 0 = raw side, 1 = psa side based on relative strength
  const continuum =
    rawMed == null || psaMed == null
      ? 0.5
      : Math.max(0.12, Math.min(0.88, 0.5 + (psaMed - rawMed) / 20));

  return (
    <section className="mf-ed__finish" aria-label="Raw versus PSA 10">
      <div className="mf-ed__chapter">
        <h2 className="mf-ed__chapter-title">Raw versus PSA 10</h2>
      </div>
      <p className="mf-ed__finish-line">{interpretation}</p>

      <div className="mf-ed__continuum" aria-hidden>
        <span className="mf-ed__cont-end">
          Raw
          <strong>{formatPct(rawMed)}</strong>
        </span>
        <span className="mf-ed__cont-track">
          <span className="mf-ed__cont-mark" style={{ left: `${continuum * 100}%` }} />
        </span>
        <span className="mf-ed__cont-end is-right">
          PSA 10
          <strong>{formatPct(psaMed)}</strong>
        </span>
      </div>

      <p className="mf-ed__finish-meta">
        Spread {formatPct(spread)}
        {raw ? ` · raw n=${raw.sampleSize}` : ''}
        {psa ? ` · PSA 10 n=${psa.sampleSize}` : ''}
        {raw?.breadthUpPct != null ? ` · raw ${Math.round(raw.breadthUpPct)}% rising` : ''}
        {psa?.breadthUpPct != null ? ` · PSA 10 ${Math.round(psa.breadthUpPct)}% rising` : ''}
      </p>
    </section>
  );
}
