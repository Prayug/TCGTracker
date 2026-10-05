import type { MoneyFlowCohort, MoneyFlowExemplar } from '@tcgtracker/shared';
import { useMoneyFlow } from '../hooks/useMoneyFlow';
import { useState } from 'react';
import '../money-flow.css';

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatMoney(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function SideTag({ rotation }: { rotation: MoneyFlowCohort['rotation'] }) {
  if (rotation === 'into')
    return <span className="money-flow__tag money-flow__tag--into">Getting chased</span>;
  if (rotation === 'out')
    return <span className="money-flow__tag money-flow__tag--out">Cooling off</span>;
  return <span className="money-flow__tag">Mixed</span>;
}

function ExemplarCard({ e }: { e: MoneyFlowExemplar }) {
  const art = e.imageSmall || e.imageLarge;
  return (
    <div className="money-flow__ex-card">
      {art ? <img src={art} alt="" loading="lazy" /> : <div className="money-flow__ex-ph" />}
      <div className="money-flow__ex-meta">
        <div className="money-flow__ex-name">{e.productName}</div>
        <div className="money-flow__ex-sub">
          <span className={e.changePercent >= 0 ? 'is-up' : 'is-down'}>
            {formatPct(e.changePercent)}
          </span>
          <span>{formatMoney(e.currentPrice)}</span>
          {e.finish === 'psa10' ? <span>PSA 10</span> : <span>Raw</span>}
        </div>
      </div>
    </div>
  );
}

function CohortStory({ cohort }: { cohort: MoneyFlowCohort }) {
  return (
    <article className={`money-flow__story money-flow__story--${cohort.rotation}`}>
      <header className="money-flow__story-head">
        <div>
          <h3 className="money-flow__cohort-name">{cohort.label}</h3>
          <SideTag rotation={cohort.rotation} />
        </div>
        <div className="money-flow__pct">{formatPct(cohort.medianReturnPct)}</div>
      </header>
      <p className="money-flow__story-copy">{cohort.story}</p>
      <div className="money-flow__cohort-stats">
        <span>{cohort.sampleSize} prints</span>
        {cohort.breadthUpPct != null ? (
          <span>{Math.round(cohort.breadthUpPct)}% rising</span>
        ) : null}
        {cohort.confidence === 'thin' || cohort.confidence === 'low' ? (
          <span className={`money-flow__confidence money-flow__confidence--${cohort.confidence}`}>
            {cohort.confidence === 'thin' ? 'thin sample' : 'small sample'}
          </span>
        ) : null}
      </div>
      {cohort.dataNote && (cohort.confidence === 'thin' || cohort.confidence === 'low') ? (
        <p className="money-flow__note">{cohort.dataNote}</p>
      ) : null}
      {cohort.exemplars.length > 0 ? (
        <div className="money-flow__ex-row">
          {cohort.exemplars.slice(0, 2).map((e) => (
            <ExemplarCard key={`${e.cardId || e.productName}-${e.changePercent}`} e={e} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function EraStrip({ eras }: { eras: MoneyFlowCohort[] }) {
  const maxAbs = Math.max(4, ...eras.map((e) => Math.abs(e.medianReturnPct ?? 0)));
  return (
    <div className="money-flow__era-grid">
      {eras.map((era) => {
        const pct = era.medianReturnPct ?? 0;
        const height = era.sampleSize === 0 ? 10 : 36 + (Math.abs(pct) / maxAbs) * 120;
        return (
          <div key={era.id} className="money-flow__era-col">
            <div
              className={`money-flow__era-fill${pct < 0 ? ' money-flow__era-fill--down' : ''}`}
              style={{ height }}
              aria-hidden
            />
            <div className="money-flow__era-label">{era.label}</div>
            <div className="money-flow__era-metric">
              {formatPct(era.medianReturnPct)}
              {era.sampleSize > 0 ? ` · ${era.sampleSize} prints` : ' · no data'}
            </div>
            <p className="money-flow__era-story">{era.story}</p>
          </div>
        );
      })}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="money-flow__skeleton" aria-busy="true" aria-label="Loading money flow">
      <div className="money-flow__skel-block" />
      <div className="money-flow__skel-row">
        <div className="money-flow__skel-block" />
        <div className="money-flow__skel-block" />
      </div>
    </div>
  );
}

export function MoneyFlowPage() {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, loading, refreshing, error } = useMoneyFlow(days);

  return (
    <div className="money-flow">
      <header className="money-flow__hero">
        <p className="money-flow__brand">
          TCG<span>Tracker</span>
        </p>
        <h1 className="money-flow__title">Where capital is rotating</h1>
        <p className="money-flow__lede">
          {data?.headline.summary ||
            'Chase prints only — vintage vs modern, raw vs PSA 10, Gold Stars to SIRs. Bulk commons stay off the board.'}
        </p>
        <div className="money-flow__controls">
          <button
            type="button"
            className="money-flow__chip"
            aria-pressed={days === 7}
            onClick={() => setDays(7)}
          >
            Last 7 days
          </button>
          <button
            type="button"
            className="money-flow__chip"
            aria-pressed={days === 30}
            onClick={() => setDays(30)}
          >
            Last 30 days
          </button>
          {data ? (
            <span className="money-flow__meta">
              as of {data.date || '—'} ·{' '}
              {data.headline.rawSampleSize + data.headline.slabSampleSize} chase movers
              {data.headline.filteredOutCount > 0
                ? ` · skipped ${data.headline.filteredOutCount} bulk`
                : ''}
              {refreshing ? ' · updating…' : ''}
            </span>
          ) : null}
        </div>
      </header>

      {loading && !data ? (
        <Skeleton />
      ) : error && !data ? (
        <div className="money-flow__empty">{error}</div>
      ) : !data ? (
        <div className="money-flow__empty">No money-flow payload yet.</div>
      ) : (
        <>
          <section className="money-flow__streams" aria-label="Capital rotation">
            <div className="money-flow__stream money-flow__stream--into">
              <div className="money-flow__flow-lane" aria-hidden />
              <h2 className="money-flow__stream-label">Getting chased</h2>
              {data.rotationInto.length === 0 ? (
                <p className="money-flow__note">Nothing clearly drawing bids this window.</p>
              ) : (
                data.rotationInto.map((c) => <CohortStory key={c.id} cohort={c} />)
              )}
            </div>
            <div className="money-flow__stream-divider" aria-hidden />
            <div className="money-flow__stream money-flow__stream--out">
              <div className="money-flow__flow-lane" aria-hidden />
              <h2 className="money-flow__stream-label">Cooling off</h2>
              {data.rotationOut.length === 0 ? (
                <p className="money-flow__note">Nothing clearly leaking this window.</p>
              ) : (
                data.rotationOut.map((c) => <CohortStory key={c.id} cohort={c} />)
              )}
            </div>
          </section>

          <section className="money-flow__eras" aria-label="Era posture">
            <h2 className="money-flow__section-title">By era</h2>
            <EraStrip eras={data.eras} />
          </section>

          <section className="money-flow__specials" aria-label="Special cohorts">
            <h2 className="money-flow__section-title">Special prints</h2>
            <div className="money-flow__special-grid">
              {data.specials.map((s) => (
                <CohortStory key={s.id} cohort={s} />
              ))}
            </div>

            <h2 className="money-flow__section-title" style={{ marginTop: '2.5rem' }}>
              Raw vs PSA 10
            </h2>
            <div className="money-flow__special-grid">
              {data.finishes.map((f) => (
                <CohortStory key={f.id} cohort={f} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default MoneyFlowPage;
