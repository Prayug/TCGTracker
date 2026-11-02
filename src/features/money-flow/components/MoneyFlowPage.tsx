import { useMemo, useState } from 'react';
import type {
  MoneyFlowBreadthBucket,
  MoneyFlowCohort,
  MoneyFlowEra,
  MoneyFlowFinish,
  MoneyFlowMoverRow,
  MoneyFlowResponse,
  MoneyFlowWindowDays,
} from '@tcgtracker/shared';
import {
  MONEY_FLOW_ERA_LABELS,
  MONEY_FLOW_ERAS,
  MONEY_FLOW_FINISH_LABELS,
  MONEY_FLOW_FINISHES,
  MONEY_FLOW_PSA10_MIN_PRICE,
  MONEY_FLOW_RAW_MIN_PRICE,
} from '@tcgtracker/shared';
import { useSearchParams } from 'react-router-dom';
import { useCardModal } from '../../../contexts/CardModalContext';
import { PageHeader } from '../../../components/layout/PageShell';
import { CardArt } from '../../../components/exchange/CardArt';
import { Delta, Price, Unavailable } from '../../../components/exchange/Price';
import { useMoneyFlow } from '../hooks/useMoneyFlow';
import { filterFromCohort, moverMatchesFilter, type SegmentFilter } from '../lib/filter';
import { formatDate, formatSignedMoney, formatShare } from '../lib/format';
import { cn } from '@/lib/utils';

const WINDOWS: MoneyFlowWindowDays[] = [7, 30, 90];

const CONFIDENCE_COPY: Record<string, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  thin: 'Too few prints to read',
};

/**
 * Market overview. Every figure is a median or count over the tracked
 * "chase" pool (bulk and sub-floor prints removed), with its sample size
 * and confidence shown next to it. Commentary is built as
 * signal → evidence → uncertainty → next action, from the payload only.
 */
export function MoneyFlowPage() {
  const [params, setParams] = useSearchParams();
  const days = (WINDOWS.find((w) => String(w) === params.get('days')) ?? 7) as MoneyFlowWindowDays;
  const [filter, setFilter] = useState<SegmentFilter | null>(null);
  const { data, loading, refreshing, error } = useMoneyFlow(days);

  const setDays = (d: MoneyFlowWindowDays) => {
    setFilter(null);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (d === 7) next.delete('days');
        else next.set('days', String(d));
        return next;
      },
      { replace: true, preventScrollReset: true }
    );
  };

  const pick = (c: MoneyFlowCohort) => {
    setFilter((prev) => (prev?.cohortId === c.id ? null : filterFromCohort(c)));
    window.requestAnimationFrame(() =>
      document.getElementById('movers')?.scrollIntoView({ block: 'start' })
    );
  };

  return (
    <div className="space-y-10">
      <PageHeader
        title="Market overview"
        meta={
          data
            ? `${formatDate(data.date || data.headline.asOfDate)} · ${data.summary.trackedCount.toLocaleString()} prints tracked${refreshing ? ' · updating' : ''}`
            : undefined
        }
        actions={
          <div className="segmented" role="radiogroup" aria-label="Window">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={days === w}
                onClick={() => setDays(w)}
              >
                {w} days
              </button>
            ))}
          </div>
        }
      />

      {loading && !data ? (
        <div className="space-y-6" aria-busy="true">
          <div className="skeleton h-8 w-2/3 rounded" />
          <div className="skeleton h-14 rounded" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="skeleton h-56 rounded" />
            <div className="skeleton h-56 rounded" />
          </div>
        </div>
      ) : !data ? (
        <Unavailable title="Market data did not load">
          {error ?? 'The price service returned nothing for this window.'} Try another window or
          check back after the next daily snapshot.
        </Unavailable>
      ) : (
        <Overview
          data={data}
          days={days}
          filter={filter}
          onPick={pick}
          onClear={() => setFilter(null)}
        />
      )}
    </div>
  );
}

function Overview({
  data,
  days,
  filter,
  onPick,
  onClear,
}: {
  data: MoneyFlowResponse;
  days: number;
  filter: SegmentFilter | null;
  onPick: (c: MoneyFlowCohort) => void;
  onClear: () => void;
}) {
  const { headline, summary } = data;
  return (
    <>
      <section
        aria-labelledby="read-h"
        className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
      >
        <div>
          <h2 id="read-h" className="sr-only">
            This window’s read
          </h2>
          <p className="max-w-[60ch] font-display text-[24px] leading-snug sm:text-[28px]">
            {headline.summary}
          </p>
          <dl className="mt-4 grid max-w-xl grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13.5px]">
            <dt className="text-ink-muted">Money moving into</dt>
            <dd>
              {headline.intoLabels.length ? headline.intoLabels.join(', ') : 'No clear segment'}
            </dd>
            <dt className="text-ink-muted">Moving out of</dt>
            <dd>
              {headline.outLabels.length ? headline.outLabels.join(', ') : 'No clear segment'}
            </dd>
          </dl>
        </div>
        <div className="border-t border-rule pt-3 text-[12.5px] leading-relaxed text-ink-muted lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="font-medium text-ink-secondary">How this is measured</p>
          <p className="mt-1">
            {days}-day change in TCGplayer market price for{' '}
            {headline.rawSampleSize.toLocaleString()} raw prints over ${MONEY_FLOW_RAW_MIN_PRICE}{' '}
            and {headline.slabSampleSize.toLocaleString()} PSA 10 prints over $
            {MONEY_FLOW_PSA10_MIN_PRICE}.{' '}
            {headline.filteredOutCount > 0
              ? `${headline.filteredOutCount.toLocaleString()} bulk or low-value prints were left out. `
              : ''}
            Segment figures are medians, so one runaway card can’t carry a segment. Price change is
            not volume: a segment can rise on very few sales.
          </p>
        </div>
      </section>

      <BreadthStrip
        buckets={data.breadthBuckets}
        rising={summary.risingCount}
        flat={summary.flatCount}
        falling={summary.fallingCount}
        median={summary.medianMovePct}
        days={days}
      />

      <div className="grid gap-x-10 gap-y-10 xl:grid-cols-2">
        <EraMatrix
          cohorts={data.eraFinishes}
          specials={data.specials}
          filter={filter}
          onPick={onPick}
          days={days}
        />
        <RotationBoard
          into={data.rotationInto}
          out={data.rotationOut}
          filter={filter}
          onPick={onPick}
        />
      </div>

      {data.insights.length > 0 ? (
        <section aria-labelledby="notes-h">
          <h2 id="notes-h" className="border-b border-rule-strong pb-2 text-h2">
            Notes from this window
          </h2>
          <ul className="max-w-[80ch]">
            {data.insights.map((i) => (
              <li key={i.id} className="border-b border-rule py-2.5 text-[14px] text-ink-secondary">
                {i.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Movers
        gainers={data.topGainers}
        losers={data.topLosers}
        filter={filter}
        onClear={onClear}
        days={days}
      />
    </>
  );
}

/* ---------------------------------------------------------------- breadth */

const BUCKET_TONE = (b: MoneyFlowBreadthBucket): string => {
  const mid =
    b.minPct == null
      ? (b.maxPct ?? 0) - 20
      : b.maxPct == null
        ? b.minPct + 20
        : (b.minPct + b.maxPct) / 2;
  if (Math.abs(mid) < 1) return 'var(--ink-muted)';
  const strength = Math.min(1, Math.abs(mid) / 25);
  const pct = Math.round(35 + strength * 65);
  return `color-mix(in srgb, ${mid > 0 ? 'var(--gain)' : 'var(--loss)'} ${pct}%, var(--surface-base))`;
};

function bucketLabel(b: MoneyFlowBreadthBucket): string {
  if (b.label) return b.label;
  if (b.minPct == null) return `Below ${b.maxPct}%`;
  if (b.maxPct == null) return `${b.minPct}% or more`;
  return `${b.minPct}% to ${b.maxPct}%`;
}

function BreadthStrip({
  buckets,
  rising,
  flat,
  falling,
  median,
  days,
}: {
  buckets: MoneyFlowBreadthBucket[];
  rising: number;
  flat: number;
  falling: number;
  median: number | null;
  days: number;
}) {
  const total = rising + flat + falling;
  const ordered = [...buckets].sort((a, b) => (a.minPct ?? -Infinity) - (b.minPct ?? -Infinity));
  return (
    <section aria-labelledby="breadth-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-strong pb-2">
        <h2 id="breadth-h" className="text-h2">
          Breadth
        </h2>
        <p className="text-meta text-ink-muted">Tracked prints by size of {days}-day move</p>
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
        <Fact label="Rising" value={rising} total={total} tone="gain" />
        <Fact label="Flat" value={flat} total={total} />
        <Fact label="Falling" value={falling} total={total} tone="loss" />
        <div>
          <dt className="text-meta text-ink-muted">Median move</dt>
          <dd className="mt-0.5">
            <Delta pct={median} size="md" />
          </dd>
        </div>
      </dl>
      {ordered.length > 0 ? (
        <figure className="mt-5">
          <div className="flex h-9 w-full overflow-hidden rounded-sm" aria-hidden>
            {ordered.map((b) =>
              b.sharePct > 0 ? (
                <div
                  key={b.key}
                  className="h-full border-r border-surface-base last:border-r-0"
                  style={{ width: `${b.sharePct}%`, background: BUCKET_TONE(b) }}
                  title={`${bucketLabel(b)}: ${b.count}`}
                />
              ) : null
            )}
          </div>
          <div
            className="mt-1.5 grid text-[11.5px] text-ink-muted"
            style={{ gridTemplateColumns: `repeat(${ordered.length}, minmax(0,1fr))` }}
            aria-hidden
          >
            {ordered.map((b) => (
              <span key={b.key} className="hidden truncate text-center sm:block">
                {bucketLabel(b)}
              </span>
            ))}
          </div>
          <figcaption className="sr-only">
            Distribution of moves:{' '}
            {ordered
              .map((b) => `${bucketLabel(b)}, ${b.count} prints (${Math.round(b.sharePct)}%)`)
              .join('; ')}
          </figcaption>
          <details className="mt-2 text-[12.5px]">
            <summary className="cursor-pointer text-ink-muted hover:text-ink-primary">
              Show the numbers
            </summary>
            <table className="ledger ledger-tight mt-2 max-w-md">
              <thead>
                <tr>
                  <th scope="col">Move</th>
                  <th scope="col" className="num">
                    Prints
                  </th>
                  <th scope="col" className="num">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((b) => (
                  <tr key={b.key}>
                    <th scope="row" className="text-left font-normal">
                      {bucketLabel(b)}
                    </th>
                    <td className="num">{b.count}</td>
                    <td className="num">{Math.round(b.sharePct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </figure>
      ) : null}
    </section>
  );
}

function Fact({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone?: 'gain' | 'loss';
}) {
  return (
    <div>
      <dt className="text-meta text-ink-muted">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 font-mono text-[22px] font-medium tabular-nums leading-none',
          tone === 'gain' && 'text-gain',
          tone === 'loss' && 'text-loss'
        )}
      >
        {total > 0 ? `${Math.round((value / total) * 100)}%` : '—'}
        <span className="ml-1.5 text-[12px] font-normal text-ink-muted">
          {value.toLocaleString()}
        </span>
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------- era matrix */

function cellTint(c: MoneyFlowCohort | undefined): string | undefined {
  if (!c || c.confidence === 'thin' || c.medianReturnPct == null) return undefined;
  const m = c.medianReturnPct;
  if (Math.abs(m) < 0.5) return undefined;
  const pct = Math.round(Math.min(1, Math.abs(m) / 20) * 22);
  return `color-mix(in srgb, ${m > 0 ? 'var(--gain)' : 'var(--loss)'} ${pct}%, transparent)`;
}

function CohortCell({
  c,
  active,
  onPick,
}: {
  c?: MoneyFlowCohort;
  active: boolean;
  onPick: (c: MoneyFlowCohort) => void;
}) {
  if (!c || c.sampleSize === 0) {
    return <td className="text-center text-[12.5px] text-ink-muted">No prints</td>;
  }
  const thin = c.confidence === 'thin';
  return (
    <td className="p-0" style={{ background: cellTint(c) }}>
      <button
        type="button"
        onClick={() => onPick(c)}
        aria-pressed={active}
        className={cn(
          'block w-full px-3 py-3 text-left hover:bg-surface-hover/60',
          active && 'outline outline-2 -outline-offset-2 outline-accent'
        )}
      >
        <span className="block">
          {thin ? (
            <span className="font-mono text-[13px] text-ink-muted">thin</span>
          ) : (
            <Delta pct={c.medianReturnPct} size="md" />
          )}
        </span>
        <span className="mt-0.5 block font-mono text-[11.5px] text-ink-muted">
          {formatShare(c.breadthUpPct)} up · n={c.sampleSize}
        </span>
        <span className="sr-only">
          {c.label}: median {c.medianReturnPct?.toFixed(1) ?? 'unknown'} percent,{' '}
          {CONFIDENCE_COPY[c.confidence]}. Show these prints.
        </span>
      </button>
    </td>
  );
}

function EraMatrix({
  cohorts,
  specials,
  filter,
  onPick,
  days,
}: {
  cohorts: MoneyFlowCohort[];
  specials: MoneyFlowCohort[];
  filter: SegmentFilter | null;
  onPick: (c: MoneyFlowCohort) => void;
  days: number;
}) {
  const find = (era: MoneyFlowEra, finish: MoneyFlowFinish) =>
    cohorts.find((c) => c.era === era && c.finish === finish);
  const shownSpecials = specials.filter((s) => s.sampleSize > 0);
  return (
    <section aria-labelledby="matrix-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-strong pb-2">
        <h2 id="matrix-h" className="text-h2">
          Era and grade
        </h2>
        <p className="text-meta text-ink-muted">Median {days}-day move · share rising · prints</p>
      </div>
      <table className="ledger mt-1 table-fixed">
        <caption className="sr-only">
          Median price move by era and grade. Select a cell to list its prints.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-[28%]">
              <span className="sr-only">Era</span>
            </th>
            {MONEY_FLOW_FINISHES.map((f) => (
              <th key={f} scope="col">
                {MONEY_FLOW_FINISH_LABELS[f]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MONEY_FLOW_ERAS.map((era) => (
            <tr key={era}>
              <th scope="row" className="text-left font-medium">
                {MONEY_FLOW_ERA_LABELS[era]}
                <span className="block text-[11.5px] font-normal text-ink-muted">
                  {era === 'vintage' ? 'to 2003' : era === 'mid' ? '2004–2016' : '2017 on'}
                </span>
              </th>
              {MONEY_FLOW_FINISHES.map((f) => {
                const c = find(era, f);
                return (
                  <CohortCell
                    key={f}
                    c={c}
                    active={!!c && filter?.cohortId === c.id}
                    onPick={onPick}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {shownSpecials.length > 0 ? (
        <>
          <h3 className="mt-6 text-h3">Collector segments</h3>
          <ul className="mt-1">
            {shownSpecials.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  aria-pressed={filter?.cohortId === s.id}
                  className={cn(
                    'grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 border-b border-rule py-2 text-left hover:bg-surface-hover/60',
                    filter?.cohortId === s.id && 'bg-accent-muted'
                  )}
                >
                  <span className="truncate text-[13.5px]">{s.label}</span>
                  <span className="font-mono text-[11.5px] text-ink-muted">n={s.sampleSize}</span>
                  {s.confidence === 'thin' ? (
                    <span className="w-20 text-right font-mono text-[12.5px] text-ink-muted">
                      thin
                    </span>
                  ) : (
                    <Delta pct={s.medianReturnPct} className="w-20 justify-end" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="mt-3 text-[12px] text-ink-muted">
        Cells marked thin have too few prints for the median to mean much. Tint strength follows the
        size of the median move.
      </p>
    </section>
  );
}

/* --------------------------------------------------------------- rotation */

function RotationBoard({
  into,
  out,
  filter,
  onPick,
}: {
  into: MoneyFlowCohort[];
  out: MoneyFlowCohort[];
  filter: SegmentFilter | null;
  onPick: (c: MoneyFlowCohort) => void;
}) {
  const rows = [...into, ...out];
  const max = Math.max(1, ...rows.map((c) => Math.abs(c.netDollarMove)));
  const [open, setOpen] = useState<string | null>(rows[0]?.id ?? null);
  return (
    <section aria-labelledby="rot-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-strong pb-2">
        <h2 id="rot-h" className="text-h2">
          Rotation
        </h2>
        <p className="text-meta text-ink-muted">Net dollar change across each segment’s prints</p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-meta text-ink-muted">
          No segment moved clearly enough to call a rotation.
        </p>
      ) : (
        <ul className="mt-1">
          {rows.map((c) => {
            const share = Math.abs(c.netDollarMove) / max;
            const up = c.netDollarMove >= 0;
            const expanded = open === c.id;
            return (
              <li key={c.id} className="border-b border-rule">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : c.id)}
                  aria-expanded={expanded}
                  className="grid w-full grid-cols-[minmax(0,9rem)_minmax(0,1fr)_5.5rem] items-center gap-x-3 py-2.5 text-left hover:bg-surface-hover/50 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_6rem]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium">{c.label}</span>
                    <span className="block font-mono text-[11px] text-ink-muted">
                      n={c.sampleSize} · {c.confidence}
                    </span>
                  </span>
                  <span className="relative block h-4" aria-hidden>
                    <span className="absolute inset-y-0 left-1/2 w-px bg-rule-strong" />
                    <span
                      className={cn(
                        'absolute inset-y-0.5 rounded-[1px]',
                        up ? 'left-1/2 bg-gain' : 'right-1/2 bg-loss',
                        c.confidence === 'thin' && 'opacity-40'
                      )}
                      style={{ width: `${share * 50}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      'text-right font-mono text-[12.5px] tabular-nums',
                      up ? 'text-gain' : 'text-loss'
                    )}
                  >
                    {formatSignedMoney(c.netDollarMove, c.netDollarMove)}
                  </span>
                </button>
                {expanded ? (
                  <Commentary c={c} active={filter?.cohortId === c.id} onPick={onPick} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[12px] text-ink-muted">
        Bars compare the summed change in market price across a segment’s tracked prints. It
        reflects price, not how much money actually changed hands.
      </p>
    </section>
  );
}

function Commentary({
  c,
  active,
  onPick,
}: {
  c: MoneyFlowCohort;
  active: boolean;
  onPick: (c: MoneyFlowCohort) => void;
}) {
  const { openCard } = useCardModal();
  return (
    <div className="grid gap-4 pb-4 pt-1 sm:grid-cols-[minmax(0,1fr)_auto]">
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-ink-muted">Signal</dt>
        <dd>{c.story}</dd>
        <dt className="text-ink-muted">Evidence</dt>
        <dd className="font-mono text-[12px] text-ink-secondary">
          median{' '}
          {c.medianReturnPct != null
            ? `${c.medianReturnPct > 0 ? '+' : ''}${c.medianReturnPct.toFixed(1)}%`
            : '—'}{' '}
          · {formatShare(c.breadthUpPct)} rising · {c.upCount} up / {c.downCount} down
        </dd>
        <dt className="text-ink-muted">Uncertainty</dt>
        <dd className="text-ink-secondary">
          {CONFIDENCE_COPY[c.confidence]}
          {c.dataNote ? `. ${c.dataNote}` : ''}
        </dd>
        <dt className="text-ink-muted">Next</dt>
        <dd>
          <button type="button" onClick={() => onPick(c)} className="text-accent hover:underline">
            {active ? 'Showing these prints below' : `List the ${c.sampleSize} prints`}
          </button>
        </dd>
      </dl>
      {c.exemplars.length > 0 ? (
        <ul
          className="flex gap-2 sm:w-[11rem] sm:justify-end"
          aria-label={`Example prints in ${c.label}`}
        >
          {c.exemplars.slice(0, 3).map((e, i) => (
            <li key={`${e.cardId}-${i}`} className="w-14">
              <button
                type="button"
                disabled={!e.cardId}
                onClick={() =>
                  e.cardId &&
                  openCard({
                    id: e.cardId,
                    name: e.productName,
                    images: {
                      small: e.imageSmall || '',
                      large: e.imageLarge || e.imageSmall || '',
                    },
                    set: { id: e.setId || '', name: e.setName || '', releaseDate: '', total: 0 },
                    number: '',
                  })
                }
                className="block w-full text-left disabled:cursor-default"
                title={`${e.productName} ${e.changePercent > 0 ? '+' : ''}${e.changePercent.toFixed(1)}%`}
              >
                <CardArt
                  card={{
                    name: e.productName,
                    images: { small: e.imageSmall ?? undefined, large: e.imageLarge ?? undefined },
                  }}
                  flat
                />
                <span className="sr-only">{e.productName}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- movers */

type MoverSort = 'pct' | 'dollar';

function Movers({
  gainers,
  losers,
  filter,
  onClear,
  days,
}: {
  gainers: MoneyFlowMoverRow[];
  losers: MoneyFlowMoverRow[];
  filter: SegmentFilter | null;
  onClear: () => void;
  days: number;
}) {
  const { openCard } = useCardModal();
  const [side, setSide] = useState<'up' | 'down'>('up');
  const [sort, setSort] = useState<MoverSort>('pct');
  const [limit, setLimit] = useState(25);
  const rows = useMemo(() => {
    const src = (side === 'up' ? gainers : losers).filter((r) => moverMatchesFilter(r, filter));
    return [...src].sort((a, b) =>
      sort === 'pct'
        ? Math.abs(b.changePercent) - Math.abs(a.changePercent)
        : b.absDollarMove - a.absDollarMove
    );
  }, [side, sort, gainers, losers, filter]);

  return (
    <section
      id="movers"
      aria-labelledby="movers-h"
      className="scroll-mt-[calc(var(--header-h)+16px)]"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule-strong pb-2">
        <div>
          <h2 id="movers-h" className="text-h2">
            Prints behind the read
          </h2>
          <p className="text-meta text-ink-muted">
            {filter ? (
              <>
                Showing {filter.label}{' '}
                <button type="button" onClick={onClear} className="text-accent hover:underline">
                  Show all segments
                </button>
              </>
            ) : (
              `Largest ${days}-day moves in the tracked pool`
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="segmented" role="radiogroup" aria-label="Direction">
            <button
              type="button"
              role="radio"
              aria-checked={side === 'up'}
              onClick={() => setSide('up')}
            >
              Rising
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={side === 'down'}
              onClick={() => setSide('down')}
            >
              Falling
            </button>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Rank by">
            <button
              type="button"
              role="radio"
              aria-checked={sort === 'pct'}
              onClick={() => setSort('pct')}
            >
              By %
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={sort === 'dollar'}
              onClick={() => setSort('dollar')}
            >
              By $
            </button>
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-meta text-ink-muted">
          No {side === 'up' ? 'rising' : 'falling'} prints in this segment.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="ledger ledger-tight">
              <caption className="sr-only">
                Individual prints, {side === 'up' ? 'rising' : 'falling'}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-11">
                    <span className="sr-only">Artwork</span>
                  </th>
                  <th scope="col">Print</th>
                  <th scope="col" className="hidden md:table-cell">
                    Segment
                  </th>
                  <th scope="col" className="num hidden sm:table-cell">
                    Was
                  </th>
                  <th scope="col" className="num">
                    Now
                  </th>
                  <th scope="col" className="num">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((r) => (
                  <tr key={r.id}>
                    <td className="pr-0">
                      <span className="block w-8">
                        <CardArt
                          card={{
                            name: r.productName,
                            images: {
                              small: r.imageSmall ?? undefined,
                              large: r.imageLarge ?? undefined,
                            },
                          }}
                          flat
                        />
                      </span>
                    </td>
                    <td>
                      {r.cardId ? (
                        <button
                          type="button"
                          onClick={() =>
                            openCard({
                              id: r.cardId as string,
                              name: r.productName,
                              images: {
                                small: r.imageSmall || '',
                                large: r.imageLarge || r.imageSmall || '',
                              },
                              set: { id: '', name: r.setName || '', releaseDate: '', total: 0 },
                              number: '',
                            })
                          }
                          className="block max-w-[34vw] truncate text-left font-medium hover:underline sm:max-w-[22rem]"
                        >
                          {r.productName}
                        </button>
                      ) : (
                        <span className="block max-w-[34vw] truncate font-medium sm:max-w-[22rem]">
                          {r.productName}
                        </span>
                      )}
                      <span className="block max-w-[34vw] truncate text-meta text-ink-muted sm:max-w-[22rem]">
                        {r.setName ?? 'Set unknown'}
                        {r.finish === 'psa10' ? ' · PSA 10' : ''}
                      </span>
                    </td>
                    <td className="hidden text-[12.5px] text-ink-secondary md:table-cell">
                      {r.segmentLabel}
                    </td>
                    <td className="num hidden text-ink-muted sm:table-cell">
                      <Price
                        value={r.previousPrice}
                        size="sm"
                        className="font-normal text-ink-muted"
                      />
                    </td>
                    <td className="num">
                      <Price value={r.currentPrice} size="sm" />
                    </td>
                    <td className="num">
                      <Delta pct={r.changePercent} />
                      <span className="block text-[11px] text-ink-muted">
                        {formatSignedMoney(
                          r.currentPrice - r.previousPrice,
                          r.currentPrice - r.previousPrice
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > limit ? (
            <button
              type="button"
              onClick={() => setLimit((l) => l + 25)}
              className="btn-secondary mt-4"
            >
              Show {Math.min(25, rows.length - limit)} more
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

export default MoneyFlowPage;
