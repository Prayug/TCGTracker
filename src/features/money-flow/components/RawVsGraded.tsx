import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { formatPct, moveTone } from '../lib/format';

function spreadText(psa: number | null, raw: number | null): string {
  if (psa == null || raw == null) return 'Not enough finish data to read the spread.';
  const spread = Math.round((psa - raw) * 10) / 10;
  if (Math.abs(spread) < 0.5) {
    return `PSA 10 and raw are moving together (spread ${formatPct(spread)}).`;
  }
  if (spread > 0) {
    return `PSA 10 leads raw by ${formatPct(spread)} — graded demand is stronger this window.`;
  }
  return `Raw leads PSA 10 by ${formatPct(-spread)} — ungraded chase is outrunning slabs.`;
}

export function RawVsGraded({ finishes }: { finishes: MoneyFlowCohort[] }) {
  const raw = finishes.find((f) => f.key === 'raw');
  const psa = finishes.find((f) => f.key === 'psa10');
  const rawMed = raw?.medianReturnPct ?? null;
  const psaMed = psa?.medianReturnPct ?? null;
  const spread = rawMed != null && psaMed != null ? Math.round((psaMed - rawMed) * 10) / 10 : null;

  return (
    <section className="mf-term__panel" aria-label="Raw vs PSA 10">
      <div className="mf-term__panel-head">
        <h2 className="mf-term__panel-title">Raw vs PSA 10</h2>
      </div>
      <div className="mf-term__rvg">
        <FinishStat
          label="Raw"
          move={rawMed}
          rising={raw?.breadthUpPct ?? null}
          n={raw?.sampleSize ?? 0}
        />
        <div className="mf-term__rvg-spread">
          <span className="mf-term__kpi-label">Spread</span>
          <span className={`mf-term__kpi-value is-${moveTone(spread)}`}>{formatPct(spread)}</span>
          <p className="mf-term__rvg-note">{spreadText(psaMed, rawMed)}</p>
        </div>
        <FinishStat
          label="PSA 10"
          move={psaMed}
          rising={psa?.breadthUpPct ?? null}
          n={psa?.sampleSize ?? 0}
        />
      </div>
    </section>
  );
}

function FinishStat({
  label,
  move,
  rising,
  n,
}: {
  label: string;
  move: number | null;
  rising: number | null;
  n: number;
}) {
  return (
    <div className="mf-term__rvg-side">
      <span className="mf-term__kpi-label">{label}</span>
      <span className={`mf-term__rvg-move is-${moveTone(move)}`}>{formatPct(move)}</span>
      <span className="mf-term__sub">
        {rising == null ? '—' : `${Math.round(rising)}% rising`} · n={n}
      </span>
    </div>
  );
}
