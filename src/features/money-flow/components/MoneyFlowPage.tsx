import { useMemo, useState } from 'react';
import type { MoneyFlowCohort } from '@tcgtracker/shared';
import { useMoneyFlow } from '../hooks/useMoneyFlow';
import '../money-flow.css';

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function ConfidenceBadge({ confidence }: { confidence: MoneyFlowCohort['confidence'] }) {
  return (
    <span className={`money-flow__confidence money-flow__confidence--${confidence}`}>
      {confidence === 'thin' ? 'thin data' : `${confidence} confidence`}
    </span>
  );
}

function ExemplarStrip({ cohort }: { cohort: MoneyFlowCohort }) {
  const arts = cohort.exemplars.filter((e) => e.imageSmall || e.imageLarge).slice(0, 3);
  if (arts.length === 0) return null;
  return (
    <div className="money-flow__exemplars" aria-hidden>
      {arts.map((e) => (
        <img
          key={`${e.cardId || e.productName}-${e.changePercent}`}
          className="money-flow__exemplar"
          src={e.imageSmall || e.imageLarge || ''}
          alt=""
          loading="lazy"
        />
      ))}
    </div>
  );
}

function CohortRows({ cohorts, emptyCopy }: { cohorts: MoneyFlowCohort[]; emptyCopy: string }) {
  if (cohorts.length === 0) {
    return <p className="money-flow__note">{emptyCopy}</p>;
  }
  return (
    <>
      {cohorts.map((c) => {
        const breadth = Math.min(
          100,
          Math.abs(c.medianReturnPct ?? 0) * 4 + (c.breadthUpPct ?? 50) / 2
        );
        return (
          <div key={c.id} className="money-flow__cohort-row">
            <div>
              <div className="money-flow__cohort-name">{c.label}</div>
              <div className="money-flow__cohort-stats">
                <span>{c.sampleSize} prints</span>
                <span>{c.breadthUpPct != null ? `${c.breadthUpPct.toFixed(0)}% rising` : '—'}</span>
                <ConfidenceBadge confidence={c.confidence} />
              </div>
              {c.dataNote ? <p className="money-flow__note">{c.dataNote}</p> : null}
              <div className="money-flow__bar" aria-hidden>
                <span style={{ width: `${Math.max(8, Math.min(100, breadth))}%` }} />
              </div>
              <ExemplarStrip cohort={c} />
            </div>
            <div className="money-flow__pct">{formatPct(c.medianReturnPct)}</div>
          </div>
        );
      })}
    </>
  );
}

function EraColumns({ eras }: { eras: MoneyFlowCohort[] }) {
  const maxAbs = useMemo(() => {
    const vals = eras.map((e) => Math.abs(e.medianReturnPct ?? 0));
    return Math.max(4, ...vals);
  }, [eras]);

  return (
    <div className="money-flow__era-grid">
      {eras.map((era) => {
        const pct = era.medianReturnPct ?? 0;
        const height = era.sampleSize === 0 ? 8 : 28 + (Math.abs(pct) / maxAbs) * 140;
        const down = pct < 0;
        return (
          <div key={era.id} className="money-flow__era-col">
            <div
              className={`money-flow__era-fill${down ? ' money-flow__era-fill--down' : ''}`}
              style={{ height }}
              aria-hidden
            />
            <div className="money-flow__era-label">{era.label}</div>
            <div className="money-flow__era-metric">
              {formatPct(era.medianReturnPct)} median · {era.sampleSize} prints
            </div>
            {era.dataNote ? <p className="money-flow__note">{era.dataNote}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function MoneyFlowPage() {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, loading, error } = useMoneyFlow(days);

  return (
    <div className="money-flow">
      <header className="money-flow__hero">
        <p className="money-flow__brand">
          TCG<span>Tracker</span>
        </p>
        <p className="money-flow__lede">
          {data?.headline.summary ||
            'Where hobby capital is rotating — vintage vs modern, raw vs slab, Gold Stars to SIRs.'}
        </p>
        <div className="money-flow__controls">
          <button
            type="button"
            className="money-flow__chip"
            aria-pressed={days === 7}
            onClick={() => setDays(7)}
          >
            7d
          </button>
          <button
            type="button"
            className="money-flow__chip"
            aria-pressed={days === 30}
            onClick={() => setDays(30)}
          >
            30d
          </button>
          {data ? (
            <span className="money-flow__meta">
              as of {data.date || '—'} · {data.headline.rawSampleSize} raw ·{' '}
              {data.headline.slabSampleSize} PSA 10
            </span>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="money-flow__empty">Reading the board…</div>
      ) : error ? (
        <div className="money-flow__empty">{error}</div>
      ) : !data ? (
        <div className="money-flow__empty">No money-flow payload yet.</div>
      ) : (
        <>
          <section className="money-flow__streams" aria-label="Capital rotation">
            <div className="money-flow__stream money-flow__stream--into">
              <div className="money-flow__flow-lane" aria-hidden />
              <h2 className="money-flow__stream-label">Capital flowing into</h2>
              <CohortRows
                cohorts={data.rotationInto}
                emptyCopy="No clear INTO cohorts this window — samples may be thin or mixed."
              />
            </div>
            <div className="money-flow__stream-divider" aria-hidden />
            <div className="money-flow__stream money-flow__stream--out">
              <div className="money-flow__flow-lane" aria-hidden />
              <h2 className="money-flow__stream-label">Capital flowing out of</h2>
              <CohortRows
                cohorts={data.rotationOut}
                emptyCopy="No clear OUT cohorts this window — nothing is leaking with confidence."
              />
            </div>
          </section>

          <section className="money-flow__eras" aria-label="Era posture">
            <h2 className="money-flow__section-title">Era posture</h2>
            <EraColumns eras={data.eras} />
          </section>

          <section className="money-flow__specials" aria-label="Special cohorts">
            <h2 className="money-flow__section-title">Special prints</h2>
            <div className="money-flow__special-list">
              {data.specials.map((s) => (
                <div key={s.id} className="money-flow__special-item">
                  <div>
                    <div className="money-flow__cohort-name">{s.label}</div>
                    <div className="money-flow__cohort-stats">
                      <span>{s.sampleSize} identified</span>
                      <ConfidenceBadge confidence={s.confidence} />
                    </div>
                    {s.dataNote ? <p className="money-flow__note">{s.dataNote}</p> : null}
                    <ExemplarStrip cohort={s} />
                  </div>
                  <div className="money-flow__cohort-stats">
                    <span>
                      {s.breadthUpPct != null ? `${s.breadthUpPct.toFixed(0)}% rising` : '—'}
                    </span>
                    <span>
                      rotation{' '}
                      {s.rotation === 'into' ? 'in' : s.rotation === 'out' ? 'out' : 'flat'}
                    </span>
                  </div>
                  <div className="money-flow__pct">{formatPct(s.medianReturnPct)}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '2rem' }}>
              <h2 className="money-flow__section-title">Raw vs PSA 10</h2>
              <div className="money-flow__special-list">
                {data.finishes.map((f) => (
                  <div key={f.id} className="money-flow__special-item">
                    <div>
                      <div className="money-flow__cohort-name">{f.label}</div>
                      <div className="money-flow__cohort-stats">
                        <span>{f.sampleSize} movers</span>
                        <ConfidenceBadge confidence={f.confidence} />
                      </div>
                      {f.dataNote ? <p className="money-flow__note">{f.dataNote}</p> : null}
                    </div>
                    <div className="money-flow__cohort-stats">
                      <span>
                        {f.breadthUpPct != null ? `${f.breadthUpPct.toFixed(0)}% rising` : '—'}
                      </span>
                    </div>
                    <div className="money-flow__pct">{formatPct(f.medianReturnPct)}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default MoneyFlowPage;
