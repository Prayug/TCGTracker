import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { MoneyFlowCohort, MoneyFlowMoverRow, MoneyFlowResponse } from '@tcgtracker/shared';
import {
  MONEY_FLOW_ERA_LABELS,
  MONEY_FLOW_ERAS,
  MONEY_FLOW_FINISH_LABELS,
  MONEY_FLOW_FINISHES,
} from '@tcgtracker/shared';
import { HolographicCard } from '../../../components/collectible/HolographicCard';
import { fetchGradedSpreads, type GradedSpreadSummary } from '../../../services/gradedPricesApi';
import { useCardModal } from '../../../contexts/CardModalContext';
import { useElementWidth } from '../../../components/exchange/useElementWidth';
import type { SegmentFilter } from '../lib/filter';
import { formatMoney, formatPct, formatShare, formatSignedMoney } from '../lib/format';
import { squarify } from '../lib/squarify';
import { cn } from '@/lib/utils';

/** Diverging fill for a median move: gain or loss, stronger with size, capped at ±20%. */
function moveFill(pct: number | null | undefined, thin = false): string {
  if (pct == null || !Number.isFinite(pct) || thin) return 'var(--surface-hover)';
  const strength = Math.round(18 + Math.min(1, Math.abs(pct) / 20) * 62);
  return `color-mix(in srgb, ${pct >= 0 ? 'var(--gain)' : 'var(--loss)'} ${strength}%, var(--surface-raised))`;
}

/* ------------------------------------------------------------------ stage */

/** The opening read: one sentence, the counts behind it, and the window. */
export function PulseStage({
  data,
  days,
  windowControl,
}: {
  data: MoneyFlowResponse;
  days: number;
  windowControl: React.ReactNode;
}) {
  const { headline, summary } = data;
  const total = Math.max(1, summary.risingCount + summary.flatCount + summary.fallingCount);
  const reduce = useReducedMotion();
  const lead = data.topGainers.filter((g) => g.imageSmall || g.imageLarge).slice(0, 3);
  return (
    <section
      data-theme="dark"
      aria-labelledby="pulse-h"
      className="atmo-stage relative overflow-hidden rounded-3xl p-5 text-white sm:p-8"
    >
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-white/60">
              Market pulse · {days} days
            </p>
            {windowControl}
          </div>
          <h1
            id="pulse-h"
            className="mt-4 max-w-[22ch] font-display text-[clamp(1.9rem,3.8vw,3.2rem)] font-semibold leading-[1.02] tracking-[-0.025em]"
          >
            {headline.summary}
          </h1>
          <dl className="mt-6 grid max-w-xl grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13.5px]">
            <dt className="text-white/55">Money moving into</dt>
            <dd className="text-white/90">
              {headline.intoLabels.length ? headline.intoLabels.join(', ') : 'No clear segment'}
            </dd>
            <dt className="text-white/55">Moving out of</dt>
            <dd className="text-white/90">
              {headline.outLabels.length ? headline.outLabels.join(', ') : 'No clear segment'}
            </dd>
          </dl>
          <div className="mt-7">
            <div
              className="flex h-3 overflow-hidden rounded-full bg-white/10"
              role="img"
              aria-label={`${summary.risingCount} prints rising, ${summary.flatCount} flat, ${summary.fallingCount} falling`}
            >
              {[
                { n: summary.risingCount, c: 'var(--gain)' },
                { n: summary.flatCount, c: 'rgba(255,255,255,0.28)' },
                { n: summary.fallingCount, c: 'var(--loss)' },
              ].map((s, i) => (
                <motion.span
                  key={i}
                  className="h-full"
                  style={{ background: s.c }}
                  initial={{ width: reduce ? `${(s.n / total) * 100}%` : 0 }}
                  animate={{ width: `${(s.n / total) * 100}%` }}
                  transition={{ duration: 0.9, delay: 0.15 * i, ease: [0.2, 0.8, 0.2, 1] }}
                />
              ))}
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-[12.5px]">
              <Count label="Rising" n={summary.risingCount} tone="text-[color:var(--gain)]" />
              <Count label="Flat" n={summary.flatCount} tone="text-white/70" />
              <Count label="Falling" n={summary.fallingCount} tone="text-[color:var(--loss)]" />
            </div>
            <p className="mt-3 font-mono text-[11.5px] text-white/50">
              Median move {formatPct(summary.medianMovePct)} across{' '}
              {summary.trackedCount.toLocaleString()} tracked prints
            </p>
          </div>
        </div>
        {lead.length ? (
          <div
            className="relative mx-auto hidden h-[19rem] w-full max-w-[24rem] sm:block"
            aria-hidden
          >
            {lead.map((g, i) => (
              <motion.div
                key={g.id}
                className="absolute top-4 w-[44%]"
                style={{ left: ['50%', '24%', '76%'][i], zIndex: [3, 1, 2][i], x: '-50%' }}
                initial={reduce ? false : { opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: [0, 22, 22][i], rotate: [0, -9, 9][i] }}
                transition={{ type: 'spring', stiffness: 150, damping: 18, delay: 0.1 * i }}
              >
                <HolographicCard
                  card={{
                    name: g.productName,
                    images: { small: g.imageSmall ?? undefined, large: g.imageLarge ?? undefined },
                  }}
                  level={i === 0 ? 'showcase' : 'featured'}
                  finish={g.finish === 'psa10' ? 'gold' : 'holo'}
                  interactive={false}
                />
                {i === 0 ? (
                  <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[color:var(--gain)] px-2.5 py-1 font-mono text-[12px] font-semibold text-[#06140f] shadow-lg">
                    {formatPct(g.changePercent)}
                  </span>
                ) : null}
              </motion.div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Count({ label, n, tone }: { label: string; n: number; tone: string }) {
  return (
    <span>
      <span
        className={cn('block font-mono text-[22px] font-medium leading-none tabular-nums', tone)}
      >
        {n.toLocaleString()}
      </span>
      <span className="text-white/55">{label}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- treemap */

/**
 * Era × grade segments as a treemap. Area is the number of tracked prints in
 * the segment (stated on the chart); colour is the segment's median move.
 * The six cells partition the pool, so areas are honest shares.
 */
export function MarketTreemap({
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
  const [wrap, width] = useElementWidth<HTMLDivElement>(900);
  const height = width < 640 ? 360 : 340;
  const items = cohorts.filter((c) => c.sampleSize > 0);
  const rects = useMemo(
    () =>
      squarify(
        items.map((c) => c.sampleSize),
        { x: 0, y: 0, w: width, h: height }
      ),
    [items, width, height]
  );
  const [hover, setHover] = useState<string | null>(null);
  const total = items.reduce((s, c) => s + c.sampleSize, 0);
  const shownSpecials = specials.filter((s) => s.sampleSize > 0);
  const reduce = useReducedMotion();

  return (
    <section aria-labelledby="tree-h">
      <SectionHead
        id="tree-h"
        title="Where the market is moving"
        note={`Area: prints tracked · colour: median ${days}-day move`}
      />
      {items.length === 0 ? (
        <p className="mt-4 text-meta text-ink-muted">
          No segment has enough tracked prints in this window.
        </p>
      ) : (
        <div ref={wrap} className="relative mt-4" style={{ height }}>
          {items.map((c, i) => {
            const r = rects[i];
            const thin = c.confidence === 'thin';
            const active = filter?.cohortId === c.id;
            const big = r.w > 150 && r.h > 90;
            return (
              <motion.button
                key={c.id}
                type="button"
                onClick={() => onPick(c)}
                onMouseEnter={() => setHover(c.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(c.id)}
                onBlur={() => setHover(null)}
                aria-pressed={active}
                aria-label={`${c.label}: median ${formatPct(c.medianReturnPct)}, ${c.sampleSize} prints, ${formatShare(c.breadthUpPct)} rising${thin ? ', thin data' : ''}. Select to list its prints.`}
                className={cn(
                  'absolute overflow-hidden rounded-xl p-3 text-left outline-offset-2 transition-[filter] hover:brightness-110',
                  active && 'ring-2 ring-ink-primary ring-offset-2 ring-offset-surface-base'
                )}
                style={{
                  background: moveFill(c.medianReturnPct, thin),
                  backgroundImage: thin
                    ? 'repeating-linear-gradient(135deg, transparent 0 6px, rgba(127,127,127,0.12) 6px 8px)'
                    : undefined,
                }}
                initial={reduce ? false : { opacity: 0, scale: 0.94 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  left: r.x + 3,
                  top: r.y + 3,
                  width: Math.max(0, r.w - 6),
                  height: Math.max(0, r.h - 6),
                }}
                transition={{
                  type: 'spring',
                  stiffness: 220,
                  damping: 28,
                  delay: reduce ? 0 : i * 0.04,
                }}
              >
                <span className="block truncate text-[13.5px] font-semibold text-ink-primary">
                  {c.label}
                </span>
                <span
                  className={cn(
                    'mt-0.5 block font-mono font-medium tabular-nums text-ink-primary',
                    big ? 'text-[28px] leading-tight' : 'text-[15px]'
                  )}
                >
                  {thin ? 'thin' : formatPct(c.medianReturnPct)}
                </span>
                {big ? (
                  <span className="mt-1 block font-mono text-[11.5px] text-ink-secondary">
                    {c.sampleSize} prints · {formatShare(c.breadthUpPct)} rising
                  </span>
                ) : null}
                {big && r.w > 260 && c.exemplars[0]?.imageSmall ? (
                  <span aria-hidden className="absolute bottom-3 right-3 flex">
                    {c.exemplars.slice(0, 3).map((e, k) => (
                      <img
                        key={k}
                        src={e.imageSmall || ''}
                        alt=""
                        loading="lazy"
                        className="-ml-4 h-16 w-auto rounded-[4px] shadow-lg ring-1 ring-black/20 first:ml-0"
                        style={{ transform: `rotate(${(k - 1) * 6}deg)` }}
                        onError={(ev) =>
                          ((ev.currentTarget as HTMLImageElement).style.display = 'none')
                        }
                      />
                    ))}
                  </span>
                ) : null}
              </motion.button>
            );
          })}
          <AnimatePresence>
            {hover
              ? (() => {
                  const i = items.findIndex((c) => c.id === hover);
                  const c = items[i];
                  const r = rects[i];
                  if (!c || !r) return null;
                  const left = Math.min(Math.max(8, r.x + r.w / 2 - 130), width - 268);
                  const top = r.y + r.h / 2 > height / 2 ? Math.max(0, r.y - 8) : r.y + r.h + 8;
                  return (
                    <motion.div
                      key={c.id}
                      role="tooltip"
                      className="pointer-events-none absolute z-20 w-[260px] rounded-xl border border-rule-strong bg-surface-raised p-3 text-[12.5px] shadow-2xl"
                      style={{ left, top, translateY: r.y + r.h / 2 > height / 2 ? '-100%' : 0 }}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                    >
                      <p className="font-semibold">{c.label}</p>
                      <p className="mt-1 text-ink-secondary">{c.story}</p>
                      <p className="mt-2 font-mono text-[11.5px] text-ink-muted">
                        {((c.sampleSize / total) * 100).toFixed(0)}% of tracked prints · {c.upCount}{' '}
                        up / {c.downCount} down ·{' '}
                        {formatSignedMoney(c.netDollarMove, c.netDollarMove)} net
                      </p>
                      {c.dataNote ? <p className="mt-1 text-ink-muted">{c.dataNote}</p> : null}
                    </motion.div>
                  );
                })()
              : null}
          </AnimatePresence>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Legend />
        {shownSpecials.length ? (
          <div className="flex flex-wrap items-center gap-2" aria-label="Collector segments">
            <span className="text-meta text-ink-muted">Collector segments</span>
            {shownSpecials.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s)}
                aria-pressed={filter?.cohortId === s.id}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] transition-colors',
                  filter?.cohortId === s.id
                    ? 'border-ink-primary bg-ink-primary text-surface-base'
                    : 'border-rule-strong hover:bg-surface-hover'
                )}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: moveFill(s.medianReturnPct, s.confidence === 'thin') }}
                />
                {s.label}
                <span className="font-mono text-[11.5px] opacity-75">
                  {s.confidence === 'thin' ? 'thin' : formatPct(s.medianReturnPct)}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Legend() {
  const stops = [-20, -10, -3, 3, 10, 20];
  return (
    <div className="flex items-center gap-2 text-[11.5px] text-ink-muted" aria-hidden>
      <span>Falling</span>
      <span className="flex overflow-hidden rounded">
        {stops.map((s) => (
          <span key={s} className="h-2.5 w-6" style={{ background: moveFill(s) }} />
        ))}
      </span>
      <span>Rising</span>
      <span
        className="ml-2 inline-block h-2.5 w-6 rounded"
        style={{
          background: 'var(--surface-hover)',
          backgroundImage:
            'repeating-linear-gradient(135deg, transparent 0 3px, rgba(127,127,127,0.25) 3px 4px)',
        }}
      />
      <span>Too few prints</span>
    </div>
  );
}

function SectionHead({ id, title, note }: { id: string; title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2
        id={id}
        className="font-display text-[clamp(1.35rem,2.2vw,1.75rem)] font-semibold tracking-[-0.02em]"
      >
        {title}
      </h2>
      {note ? <p className="text-meta text-ink-muted">{note}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- heatmap */

/** Raw against PSA 10 for each era, so the grading premium's direction is visible at a glance. */
export function EraHeatmap({
  cohorts,
  filter,
  onPick,
  days,
}: {
  cohorts: MoneyFlowCohort[];
  filter: SegmentFilter | null;
  onPick: (c: MoneyFlowCohort) => void;
  days: number;
}) {
  const find = (era: string, finish: string) =>
    cohorts.find((c) => c.era === era && c.finish === finish);
  return (
    <section aria-labelledby="heat-h">
      <SectionHead id="heat-h" title="Raw against PSA 10" note={`Median ${days}-day move by era`} />
      <div
        role="table"
        aria-label="Median move by era and grade"
        className="mt-4 grid grid-cols-[minmax(0,7rem)_repeat(2,minmax(0,1fr))_minmax(0,5.5rem)] gap-1.5"
      >
        <div role="row" className="contents">
          <span role="columnheader">
            <span className="sr-only">Era</span>
          </span>
          {MONEY_FLOW_FINISHES.map((f) => (
            <span key={f} role="columnheader" className="pb-1 text-center text-meta text-ink-muted">
              {MONEY_FLOW_FINISH_LABELS[f]}
            </span>
          ))}
          <span role="columnheader" className="pb-1 text-center text-meta text-ink-muted">
            Gap
          </span>
        </div>
        {MONEY_FLOW_ERAS.map((era) => {
          const raw = find(era, 'raw');
          const slab = find(era, 'psa10');
          const gap =
            raw?.medianReturnPct != null &&
            slab?.medianReturnPct != null &&
            raw.confidence !== 'thin' &&
            slab.confidence !== 'thin'
              ? slab.medianReturnPct - raw.medianReturnPct
              : null;
          return (
            <div role="row" key={era} className="contents">
              <span role="rowheader" className="flex flex-col justify-center pr-2">
                <span className="text-[14px] font-semibold">{MONEY_FLOW_ERA_LABELS[era]}</span>
                <span className="text-[11.5px] text-ink-muted">
                  {era === 'vintage' ? 'to 2003' : era === 'mid' ? '2004–2016' : '2017 on'}
                </span>
              </span>
              {[raw, slab].map((c, k) => (
                <span role="cell" key={k}>
                  {c ? (
                    <button
                      type="button"
                      onClick={() => onPick(c)}
                      aria-pressed={filter?.cohortId === c.id}
                      title={c.story}
                      aria-label={`${c.label}: ${c.confidence === 'thin' ? 'too few prints' : `median ${formatPct(c.medianReturnPct)}`}, ${c.sampleSize} prints`}
                      className={cn(
                        'flex h-[4.5rem] w-full flex-col items-center justify-center rounded-lg transition-transform hover:scale-[1.03]',
                        filter?.cohortId === c.id && 'ring-2 ring-ink-primary'
                      )}
                      style={{ background: moveFill(c.medianReturnPct, c.confidence === 'thin') }}
                    >
                      <span className="font-mono text-[18px] font-medium tabular-nums">
                        {c.confidence === 'thin' ? 'thin' : formatPct(c.medianReturnPct)}
                      </span>
                      <span className="font-mono text-[11px] text-ink-secondary">
                        n={c.sampleSize}
                      </span>
                    </button>
                  ) : (
                    <span className="flex h-[4.5rem] items-center justify-center rounded-lg bg-surface-hover/60 text-[12px] text-ink-muted">
                      No prints
                    </span>
                  )}
                </span>
              ))}
              <span role="cell" className="flex flex-col items-center justify-center text-center">
                {gap == null ? (
                  <span className="text-[12px] text-ink-muted">—</span>
                ) : (
                  <>
                    <span
                      className={cn(
                        'font-mono text-[14px] font-medium tabular-nums',
                        gap >= 0 ? 'text-gain' : 'text-loss'
                      )}
                    >
                      {gap > 0 ? '+' : ''}
                      {gap.toFixed(1)} pt
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      {gap >= 0 ? 'slabs lead' : 'raw leads'}
                    </span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-ink-muted">
        Gap is PSA 10 median minus raw median, in percentage points. It is left blank where either
        side is thin.
      </p>
    </section>
  );
}

/* --------------------------------------------------------- movers gallery */

/**
 * The biggest movers as cards rather than rows, with the raw-to-graded
 * spread for whichever one you pick, from the graded sales on file.
 */
export function MoversGallery({
  gainers,
  losers,
  filter,
  match,
  days,
}: {
  gainers: MoneyFlowMoverRow[];
  losers: MoneyFlowMoverRow[];
  filter: SegmentFilter | null;
  match: (r: MoneyFlowMoverRow) => boolean;
  days: number;
}) {
  const [side, setSide] = useState<'up' | 'down'>('up');
  const rows = useMemo(
    () =>
      (side === 'up' ? gainers : losers)
        .filter(match)
        .filter((r) => r.imageSmall || r.imageLarge)
        .slice(0, 12),
    [side, gainers, losers, match]
  );
  const [pick, setPick] = useState<string | null>(null);
  const selected = rows.find((r) => r.id === pick) ?? rows[0] ?? null;
  const rail = useRef<HTMLUListElement>(null);

  return (
    <section
      aria-labelledby="gallery-h"
      data-theme="dark"
      className="atmo-stage relative overflow-hidden rounded-3xl p-5 text-white sm:p-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="gallery-h"
            className="font-display text-[clamp(1.5rem,2.6vw,2.1rem)] font-semibold tracking-[-0.02em]"
          >
            The cards doing the moving
          </h2>
          <p className="text-[13px] text-white/60">
            {filter ? `In ${filter.label}` : `Largest ${days}-day moves in the tracked pool`}
          </p>
        </div>
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
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-[14px] text-white/65">
          No {side === 'up' ? 'rising' : 'falling'} prints with artwork in this segment.
        </p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <ul
            ref={rail}
            className="scrollbar-none -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-3 pt-2"
            aria-label="Movers"
          >
            {rows.map((r) => {
              const active = selected?.id === r.id;
              return (
                <li key={r.id} className="w-[9.5rem] shrink-0 snap-start sm:w-[10.5rem]">
                  <motion.div
                    animate={{ y: active ? -8 : 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                  >
                    <HolographicCard
                      card={{
                        name: r.productName,
                        images: {
                          small: r.imageSmall ?? undefined,
                          large: r.imageLarge ?? undefined,
                        },
                      }}
                      level={active ? 'featured' : 'standard'}
                      finish={r.finish === 'psa10' ? 'gold' : 'none'}
                      onSelect={() => setPick(r.id)}
                      label={`${r.productName}, ${r.finish === 'psa10' ? 'PSA 10' : 'raw'}, ${formatPct(r.changePercent)}. Show spread.`}
                    />
                  </motion.div>
                  <p className="mt-2.5 truncate text-[13px] font-medium">{r.productName}</p>
                  <p className="flex items-baseline justify-between gap-1 font-mono text-[12px]">
                    <span
                      className={
                        r.changePercent >= 0
                          ? 'text-[color:var(--gain)]'
                          : 'text-[color:var(--loss)]'
                      }
                    >
                      {formatPct(r.changePercent)}
                    </span>
                    <span className="text-white/60">{r.finish === 'psa10' ? 'PSA 10' : 'Raw'}</span>
                  </p>
                </li>
              );
            })}
          </ul>
          {selected ? <SpreadExplorer row={selected} days={days} /> : null}
        </div>
      )}
    </section>
  );
}

function SpreadExplorer({ row, days }: { row: MoneyFlowMoverRow; days: number }) {
  const { openCard } = useCardModal();
  const [state, setState] = useState<{ id: string; data: GradedSpreadSummary | null } | null>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!row.cardId) return;
    let alive = true;
    fetchGradedSpreads(row.cardId)
      .then((d) => alive && setState({ id: row.id, data: d }))
      .catch(() => alive && setState({ id: row.id, data: null }));
    return () => {
      alive = false;
    };
  }, [row.id, row.cardId]);
  const loading = row.cardId != null && state?.id !== row.id;
  const spread = state?.id === row.id ? state.data : null;
  const rungs = (spread?.spreads ?? [])
    .filter((s) => s.gradedPrice > 0)
    .sort((a, b) => a.gradedPrice - b.gradedPrice)
    .slice(-5);
  const raw = spread?.rawPrice ?? null;
  const max = Math.max(raw ?? 0, ...rungs.map((r) => r.gradedPrice), 1);

  return (
    <div
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5"
      aria-live="polite"
    >
      <p className="font-mono text-[11.5px] uppercase tracking-[0.12em] text-white/50">
        Raw to graded
      </p>
      <h3 className="mt-1 text-[17px] font-semibold">{row.productName}</h3>
      <p className="text-[12.5px] text-white/60">{row.setName}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-[13px]">
        <span>
          <span className="block text-[11px] text-white/50">{days} days ago</span>$
          {row.previousPrice.toFixed(2)}
        </span>
        <span>
          <span className="block text-[11px] text-white/50">
            Now · {row.finish === 'psa10' ? 'PSA 10' : 'raw'}
          </span>
          ${row.currentPrice.toFixed(2)}
        </span>
      </div>
      <div className="mt-5">
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-white/10" />
            ))}
          </div>
        ) : !row.cardId || !rungs.length ? (
          <p className="text-[13px] text-white/65">
            No graded sales are on file for this card, so there is no spread to show. Its{' '}
            {row.finish === 'psa10' ? 'PSA 10' : 'raw'} move above is from TCGplayer market prices.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {raw != null ? (
              <SpreadBar
                label="Raw"
                price={raw}
                max={max}
                tone="rgba(255,255,255,0.55)"
                reduce={!!reduce}
              />
            ) : null}
            {rungs.map((s, i) => (
              <SpreadBar
                key={`${s.grader}-${s.grade}`}
                label={`${s.grader.toUpperCase()} ${s.grade}`}
                price={s.gradedPrice}
                max={max}
                tone={i === rungs.length - 1 ? '#f0bd55' : '#7f9bff'}
                note={
                  s.premiumPct != null
                    ? `${s.premiumPct > 0 ? '+' : ''}${Math.round(s.premiumPct)}% over raw · ${s.soldListings} sold`
                    : `${s.soldListings} sold`
                }
                reduce={!!reduce}
                delay={0.06 * (i + 1)}
              />
            ))}
          </ul>
        )}
      </div>
      {row.cardId ? (
        <button
          type="button"
          onClick={() =>
            openCard({
              id: row.cardId as string,
              name: row.productName,
              images: {
                small: row.imageSmall || '',
                large: row.imageLarge || row.imageSmall || '',
              },
              set: { id: '', name: row.setName || '', releaseDate: '', total: 0 },
              number: '',
            })
          }
          className="mt-5 text-[13px] text-[color:var(--accent)] hover:underline"
        >
          Open card details
        </button>
      ) : null}
    </div>
  );
}

function SpreadBar({
  label,
  price,
  max,
  tone,
  note,
  reduce,
  delay = 0,
}: {
  label: string;
  price: number;
  max: number;
  tone: string;
  note?: string;
  reduce: boolean;
  delay?: number;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className="font-medium">{label}</span>
        <span className="font-mono tabular-nums">
          {formatMoney(price).startsWith('$') && price < 1000
            ? `$${price.toFixed(2)}`
            : formatMoney(price)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
        <motion.span
          className="block h-full rounded-full"
          style={{ background: tone }}
          initial={{ width: reduce ? `${(price / max) * 100}%` : 0 }}
          animate={{ width: `${(price / max) * 100}%` }}
          transition={{ duration: 0.7, delay, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>
      {note ? <p className="mt-0.5 font-mono text-[11px] text-white/50">{note}</p> : null}
    </li>
  );
}
