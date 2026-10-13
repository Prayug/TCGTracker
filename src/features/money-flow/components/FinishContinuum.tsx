import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { formatPct, formatPts, formatShare, moveTone, printsLabel } from '../lib/format';

export function FinishContinuum({ finishes }: { finishes: MoneyFlowCohort[] }) {
  const raw = finishes.find((f) => f.key === 'raw');
  const psa = finishes.find((f) => f.key === 'psa10');
  const rawMed = raw?.medianReturnPct ?? null;
  const psaMed = psa?.medianReturnPct ?? null;
  const spread = rawMed != null && psaMed != null ? rawMed - psaMed : null;
  const rawAbs = Math.abs(rawMed ?? 0);
  const psaAbs = Math.abs(psaMed ?? 0);
  const total = Math.max(rawAbs + psaAbs, 1);
  const rawShare = (rawAbs / total) * 100;
  const psaShare = (psaAbs / total) * 100;

  return (
    <section className="mf__section mf__section--tight" aria-label="Raw versus PSA 10">
      <div className="mf__section-head">
        <h2 className="mf__section-title">Raw vs PSA 10</h2>
        {spread != null ? <p className="mf__section-aside">{formatPts(spread)} spread</p> : null}
      </div>

      <div className="mf__spread">
        <div className="mf__spread-ends">
          <span>
            Raw <strong className={`is-${moveTone(rawMed)}`}>{formatPct(rawMed)}</strong>
          </span>
          <span>
            PSA 10 <strong className={`is-${moveTone(psaMed)}`}>{formatPct(psaMed)}</strong>
          </span>
        </div>
        <div className="mf__spread-track" aria-hidden>
          <span
            className={`mf__spread-fill is-${moveTone(rawMed)}`}
            style={{ width: `${rawShare}%` }}
          />
          <span className="mf__spread-zero" />
          <span
            className={`mf__spread-fill is-${moveTone(psaMed)}`}
            style={{ width: `${psaShare}%` }}
          />
        </div>
        <p className="mf__spread-meta">
          Raw:{' '}
          {raw ? `${printsLabel(raw.sampleSize)} · ${formatShare(raw.breadthUpPct)} rising` : '—'}
          <i aria-hidden>·</i>
          PSA 10:{' '}
          {psa ? `${printsLabel(psa.sampleSize)} · ${formatShare(psa.breadthUpPct)} rising` : '—'}
        </p>
      </div>
    </section>
  );
}
