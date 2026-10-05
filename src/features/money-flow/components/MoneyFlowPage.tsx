import type { MoneyFlowCohort, MoneyFlowExemplar, MoneyFlowResponse } from '@tcgtracker/shared';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useMoneyFlow } from '../hooks/useMoneyFlow';
import '../money-flow.css';

const METRIC_HELP = {
  median:
    'Typical move for prints in this group (middle of the pack — not the wildest card). Positive = prices rose over the window.',
  breadth:
    'Share of prints that went up. High means the group moved together; low means only a few runners.',
  sample:
    'How many chase prints we measured after dropping bulk commons. Under ~8 is a hint, not a call.',
  confidence:
    'How much to trust the read. Thin/small = few prints. Medium/high = enough to take seriously.',
} as const;

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatMoney(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function MetricHint({ label, value, help }: { label: string; value: ReactNode; help: string }) {
  const id = useId();
  return (
    <span className="money-flow__metric" title={help}>
      <button
        type="button"
        className="money-flow__metric-btn"
        aria-describedby={id}
        aria-label={`${label}: ${help}`}
      >
        <span className="money-flow__metric-label">{label}</span>
        <span className="money-flow__metric-value">{value}</span>
      </button>
      <span id={id} className="money-flow__metric-tip" role="tooltip">
        {help}
      </span>
    </span>
  );
}

function BreadthBar({ upPct }: { upPct: number | null }) {
  const up = upPct == null ? 50 : Math.max(0, Math.min(100, upPct));
  return (
    <div
      className="money-flow__breadth"
      role="img"
      aria-label={
        upPct == null
          ? 'Breadth unknown'
          : `${Math.round(up)}% of prints rising, ${Math.round(100 - up)}% flat or down`
      }
      title={METRIC_HELP.breadth}
    >
      <span className="money-flow__breadth-up" style={{ width: `${up}%` }} />
      <span className="money-flow__breadth-down" style={{ width: `${100 - up}%` }} />
    </div>
  );
}

function MoveBar({
  median,
  maxAbs,
  side,
}: {
  median: number | null;
  maxAbs: number;
  side: 'into' | 'out' | 'neutral';
}) {
  const abs = Math.abs(median ?? 0);
  const width = median == null || maxAbs <= 0 ? 8 : Math.max(10, (abs / maxAbs) * 100);
  return (
    <div className={`money-flow__movebar money-flow__movebar--${side}`} aria-hidden>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

function ExemplarThumbs({ exemplars }: { exemplars: MoneyFlowExemplar[] }) {
  const arts = exemplars.filter((e) => e.imageSmall || e.imageLarge).slice(0, 3);
  if (arts.length === 0) return null;
  return (
    <div className="money-flow__thumbs" aria-hidden>
      {arts.map((e) => (
        <img
          key={`${e.cardId || e.productName}-${e.changePercent}`}
          src={e.imageSmall || e.imageLarge || ''}
          alt=""
          loading="lazy"
          title={`${e.productName} ${formatPct(e.changePercent)} · ${formatMoney(e.currentPrice)}`}
        />
      ))}
    </div>
  );
}

function CohortVisual({
  cohort,
  maxAbs,
  compact,
}: {
  cohort: MoneyFlowCohort;
  maxAbs: number;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const side = cohort.rotation === 'into' ? 'into' : cohort.rotation === 'out' ? 'out' : 'neutral';

  return (
    <article className={`money-flow__row money-flow__row--${side}${compact ? ' is-compact' : ''}`}>
      <div className="money-flow__row-main">
        <div className="money-flow__row-id">
          <h3 className="money-flow__cohort-name">{cohort.label}</h3>
          <ExemplarThumbs exemplars={cohort.exemplars} />
        </div>
        <div className="money-flow__row-num">{formatPct(cohort.medianReturnPct)}</div>
      </div>
      <MoveBar median={cohort.medianReturnPct} maxAbs={maxAbs} side={side} />
      <div className="money-flow__row-metrics">
        <MetricHint
          label="median"
          value={formatPct(cohort.medianReturnPct)}
          help={METRIC_HELP.median}
        />
        <MetricHint
          label="rising"
          value={cohort.breadthUpPct == null ? '—' : `${Math.round(cohort.breadthUpPct)}%`}
          help={METRIC_HELP.breadth}
        />
        <MetricHint label="prints" value={cohort.sampleSize} help={METRIC_HELP.sample} />
        <MetricHint
          label="trust"
          value={
            cohort.confidence === 'thin'
              ? 'thin'
              : cohort.confidence === 'low'
                ? 'small'
                : cohort.confidence
          }
          help={METRIC_HELP.confidence}
        />
      </div>
      <BreadthBar upPct={cohort.breadthUpPct} />
      <button
        type="button"
        className="money-flow__why"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide detail' : 'What this means'}
      </button>
      {open ? (
        <div className="money-flow__detail">
          <p>{cohort.story}</p>
          {cohort.dataNote ? <p className="money-flow__note">{cohort.dataNote}</p> : null}
          {cohort.exemplars[0] ? (
            <p className="money-flow__note">
              Example: {cohort.exemplars[0].productName}{' '}
              {formatPct(cohort.exemplars[0].changePercent)} at{' '}
              {formatMoney(cohort.exemplars[0].currentPrice)}
              {cohort.exemplars[0].finish === 'psa10' ? ' PSA 10' : ' raw'}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function RotationFlow({ data }: { data: MoneyFlowResponse }) {
  const into = data.rotationInto;
  const out = data.rotationOut;
  const maxAbs = useMemo(() => {
    const vals = [...into, ...out].map((c) => Math.abs(c.medianReturnPct ?? 0));
    return Math.max(3, ...vals);
  }, [into, out]);

  const intoWeight = into.reduce((s, c) => s + Math.abs(c.medianReturnPct ?? 0), 0);
  const outWeight = out.reduce((s, c) => s + Math.abs(c.medianReturnPct ?? 0), 0);
  const total = intoWeight + outWeight || 1;
  const intoShare = (intoWeight / total) * 100;
  const outShare = (outWeight / total) * 100;

  return (
    <section className="money-flow__board" aria-label="Capital rotation">
      <div className="money-flow__flow-summary" aria-hidden>
        <div className="money-flow__flow-track">
          <span className="money-flow__flow-into" style={{ width: `${intoShare}%` }} />
          <span className="money-flow__flow-out" style={{ width: `${outShare}%` }} />
        </div>
        <div className="money-flow__flow-legend">
          <span className="is-into">Chased {Math.round(intoShare)}%</span>
          <span className="is-out">Cooled {Math.round(outShare)}%</span>
        </div>
      </div>

      <div className="money-flow__streams">
        <div className="money-flow__stream money-flow__stream--into">
          <h2 className="money-flow__stream-label">Chased</h2>
          {into.length === 0 ? (
            <p className="money-flow__empty-side">None clear</p>
          ) : (
            into.map((c) => <CohortVisual key={c.id} cohort={c} maxAbs={maxAbs} />)
          )}
        </div>
        <div className="money-flow__stream-divider" aria-hidden />
        <div className="money-flow__stream money-flow__stream--out">
          <h2 className="money-flow__stream-label">Cooled</h2>
          {out.length === 0 ? (
            <p className="money-flow__empty-side">None clear</p>
          ) : (
            out.map((c) => <CohortVisual key={c.id} cohort={c} maxAbs={maxAbs} />)
          )}
        </div>
      </div>
    </section>
  );
}

function EraCompare({ eras }: { eras: MoneyFlowCohort[] }) {
  const maxAbs = Math.max(3, ...eras.map((e) => Math.abs(e.medianReturnPct ?? 0)));
  return (
    <section className="money-flow__section" aria-label="By era">
      <h2 className="money-flow__section-title">By era</h2>
      <div className="money-flow__era-bars">
        {eras.map((era) => {
          const pct = era.medianReturnPct ?? 0;
          const width = era.sampleSize === 0 ? 0 : Math.max(4, (Math.abs(pct) / maxAbs) * 50);
          const side = pct >= 0 ? 'into' : 'out';
          return (
            <div key={era.id} className="money-flow__era-bar-row">
              <div className="money-flow__era-bar-label">{era.label}</div>
              <div className="money-flow__era-bar-track">
                <div className="money-flow__era-bar-mid" aria-hidden />
                {pct >= 0 ? (
                  <span
                    className="money-flow__era-bar money-flow__era-bar--into"
                    style={{ left: '50%', width: `${width}%` }}
                  />
                ) : (
                  <span
                    className="money-flow__era-bar money-flow__era-bar--out"
                    style={{ right: '50%', width: `${width}%` }}
                  />
                )}
              </div>
              <div className={`money-flow__era-bar-pct is-${side}`}>
                {formatPct(era.medianReturnPct)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="money-flow__era-hints">
        {eras.map((era) => (
          <div key={`${era.id}-m`} className="money-flow__era-hint">
            <BreadthBar upPct={era.breadthUpPct} />
            <div className="money-flow__row-metrics">
              <MetricHint label="prints" value={era.sampleSize} help={METRIC_HELP.sample} />
              <MetricHint
                label="rising"
                value={era.breadthUpPct == null ? '—' : `${Math.round(era.breadthUpPct)}%`}
                help={METRIC_HELP.breadth}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CompareGrid({ title, cohorts }: { title: string; cohorts: MoneyFlowCohort[] }) {
  const maxAbs = Math.max(3, ...cohorts.map((c) => Math.abs(c.medianReturnPct ?? 0)));
  return (
    <section className="money-flow__section" aria-label={title}>
      <h2 className="money-flow__section-title">{title}</h2>
      <div className="money-flow__compare-grid">
        {cohorts.map((c) => (
          <CohortVisual key={c.id} cohort={c} maxAbs={maxAbs} compact />
        ))}
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="money-flow__skeleton" aria-busy="true" aria-label="Loading money flow">
      <div className="money-flow__skel-block money-flow__skel-block--wide" />
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
        <h1 className="money-flow__title">Money flow</h1>
        <p className="money-flow__lede">{data?.headline.summary || 'Chase prints only.'}</p>
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
              {data.date || '—'} · {data.headline.rawSampleSize + data.headline.slabSampleSize}{' '}
              prints
              {data.headline.filteredOutCount > 0
                ? ` · −${data.headline.filteredOutCount} bulk`
                : ''}
              {refreshing ? ' · …' : ''}
            </span>
          ) : null}
        </div>
        <p className="money-flow__legend-help">
          Hover any metric for what it means. Bars = move size; gold/grey strip = % rising.
        </p>
      </header>

      {loading && !data ? (
        <Skeleton />
      ) : error && !data ? (
        <div className="money-flow__empty">{error}</div>
      ) : !data ? (
        <div className="money-flow__empty">No data yet.</div>
      ) : (
        <>
          <RotationFlow data={data} />
          <EraCompare eras={data.eras} />
          <CompareGrid title="Special prints" cohorts={data.specials} />
          <CompareGrid title="Raw vs PSA 10" cohorts={data.finishes} />
        </>
      )}
    </div>
  );
}

export default MoneyFlowPage;
