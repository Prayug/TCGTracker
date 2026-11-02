import { useMemo, useState, type PointerEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { area as d3area, curveStepAfter, line as d3line } from 'd3-shape';
import type { VaultCard } from '../../../types/pokemon';
import { CardArt } from '../../../components/exchange/CardArt';
import { Price } from '../../../components/exchange/Price';
import { useElementWidth } from '../../../components/exchange/useElementWidth';
import { formatCurrency } from '../../../utils/cardDisplay';
import { concentration, summarizePortfolio } from '../../../utils/portfolio';
import { AllocationExplorer } from './AllocationExplorer';
import { CostReview } from './CostReview';
import { holdingMarketValue } from '../../../utils/vaultCost';
import { usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import { buildTimeline, sliceRange, undatedCount, type TimelineRange } from '../portfolioTimeline';
import { cn } from '@/lib/utils';

const RANGES: { id: TimelineRange; label: string }[] = [
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
  { id: 'all', label: 'All' },
];

/**
 * The financial view of the vault. Two original figures, both from the
 * user's own records: how the collection was built (recorded cost against
 * today's value of what was bought, by acquisition date) and where its value
 * sits (an interactive allocation ring). There is no stored valuation
 * history, so nothing here plots what the collection was worth in the past.
 */
export function PortfolioVisualization({
  cards,
  game,
  setDates,
  onOpen,
  onFilter,
}: {
  cards: VaultCard[];
  game: 'pokemon' | 'onepiece';
  setDates: ReadonlyMap<string, string>;
  onOpen: (vc: VaultCard) => void;
  onFilter: (patch: Record<string, string>) => void;
}) {
  const summary = useMemo(() => summarizePortfolio(cards), [cards]);
  const conc = useMemo(() => concentration(cards, 5), [cards]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const top = useMemo(
    () =>
      [...cards]
        .filter((c) => holdingMarketValue(c) > 0)
        .sort((a, b) => holdingMarketValue(b) - holdingMarketValue(a))
        .slice(0, 6),
    [cards]
  );

  return (
    <div className="space-y-6">
      <section
        aria-label="Portfolio figures"
        className="atmo-cobalt rounded-3xl border border-border-default p-5 sm:p-7"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-[13px] font-medium text-ink-secondary">Market value</p>
            <Price
              value={summary.marketValue}
              size="xl"
              className="mt-1 block text-[clamp(2.4rem,5vw,3.6rem)]"
            />
            <p className="mt-2 text-[13px] text-ink-muted">
              TCGplayer market, Near Mint raw · {summary.copies.toLocaleString()} cards
              {summary.unpricedEntries > 0
                ? ` · ${summary.unpricedEntries} unpriced not counted`
                : ''}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <Figure
              label="Unrealized P/L"
              value={
                summary.unrealized == null
                  ? null
                  : formatCurrency(summary.unrealized, { signed: true })
              }
              tone={
                summary.unrealized == null ? undefined : summary.unrealized >= 0 ? 'gain' : 'loss'
              }
              note={summary.unrealized == null ? 'Needs purchase prices' : 'on recorded cost'}
            />
            <Figure
              label="Recorded cost"
              value={summary.knownCost > 0 ? formatCurrency(summary.knownCost) : null}
              note={
                summary.unverifiedCostEntries > 0
                  ? `${Math.round(summary.costCoverage * 100)}% of value · ${summary.unverifiedCostEntries} unverified`
                  : `${Math.round(summary.costCoverage * 100)}% of value covered`
              }
            />
            <Figure
              label="Top 5 share"
              value={`${Math.round(conc * 100)}%`}
              note="of value in five cards"
            />
            <Figure
              label="Average card"
              value={summary.copies ? formatCurrency(summary.marketValue / summary.copies) : null}
              note="market value per copy"
            />
          </dl>
        </div>
        <BuildTimeline cards={cards} highlight={highlight} />
        <ActualPerformance />
      </section>

      <CostReview
        cards={cards}
        game={game}
        onShowAll={() => onFilter({ filter: 'missing-cost' })}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <AllocationExplorer cards={cards} setDates={setDates} onOpen={onOpen} onFilter={onFilter} />
        <section
          aria-labelledby="top-hold-h"
          className="rounded-3xl border border-border-default bg-surface-raised p-5 sm:p-6"
        >
          <h3 id="top-hold-h" className="font-display text-[19px] font-semibold">
            Most valuable holdings
          </h3>
          <p className="text-[12.5px] text-ink-muted">
            Hover one to mark when you added it on the timeline.
          </p>
          <ol className="mt-4 space-y-2">
            {top.map((vc, i) => {
              const v = holdingMarketValue(vc);
              const share = summary.marketValue > 0 ? v / summary.marketValue : 0;
              return (
                <li key={vc.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(vc)}
                    onPointerEnter={() => setHighlight(vc.id)}
                    onPointerLeave={() => setHighlight(null)}
                    onFocus={() => setHighlight(vc.id)}
                    onBlur={() => setHighlight(null)}
                    className="grid w-full grid-cols-[1.25rem_2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl p-2 text-left hover:bg-surface-hover"
                  >
                    <span className="font-mono text-[12px] text-ink-muted">{i + 1}</span>
                    <CardArt card={vc.card} flat />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">{vc.card.name}</span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-inset">
                        <motion.span
                          className="block h-full rounded-full bg-accent"
                          initial={{ width: 0 }}
                          animate={{ width: `${share * 100}%` }}
                          transition={{
                            type: 'spring',
                            stiffness: 120,
                            damping: 20,
                            delay: i * 0.04,
                          }}
                        />
                      </span>
                    </span>
                    <span className="text-right">
                      <Price value={v} size="sm" className="block" />
                      <span className="font-mono text-[11.5px] text-ink-muted">
                        {(share * 100).toFixed(1)}%
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string | null;
  note: string;
  tone?: 'gain' | 'loss';
}) {
  return (
    <div>
      <dt className="text-[12.5px] text-ink-muted">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 font-mono text-[20px] font-medium tabular-nums',
          tone === 'gain' && 'text-gain',
          tone === 'loss' && 'text-loss',
          value == null && 'text-[14px] text-ink-muted'
        )}
      >
        {value ?? 'Not available'}
      </dd>
      <dd className="text-[11.5px] text-ink-muted">{note}</dd>
    </div>
  );
}

/* ───────────── Build timeline ───────────── */

function BuildTimeline({ cards, highlight }: { cards: VaultCard[]; highlight: string | null }) {
  const reduced = usePrefersReducedMotion();
  const [range, setRange] = useState<TimelineRange>('all');
  const [hover, setHover] = useState<number | null>(null);
  const [wrap, width] = useElementWidth<HTMLDivElement>(800);
  const height = 240;
  const pad = { l: 8, r: 8, t: 16, b: 26 };
  const all = useMemo(() => buildTimeline(cards), [cards]);
  const points = useMemo(() => sliceRange(all, range), [all, range]);
  const undated = useMemo(() => undatedCount(cards), [cards]);

  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const t0 = Date.parse(points[0].date);
    const t1 = Math.max(Date.now(), Date.parse(points[points.length - 1].date) + 864e5);
    const maxV = Math.max(...points.map((p) => Math.max(p.marketToday, p.cost)), 1);
    const x = (d: string) =>
      pad.l + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (width - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - v / maxV) * (height - pad.t - pad.b);
    const series = [
      ...points,
      { ...points[points.length - 1], date: new Date(t1).toISOString().slice(0, 10), added: [] },
    ];
    const mk = (key: 'marketToday' | 'cost') =>
      d3line<(typeof series)[number]>()
        .x((p) => x(p.date))
        .y((p) => y(p[key]))
        .curve(curveStepAfter)(series) ?? '';
    const fill =
      d3area<(typeof series)[number]>()
        .x((p) => x(p.date))
        .y0(height - pad.b)
        .y1((p) => y(p.marketToday))
        .curve(curveStepAfter)(series) ?? '';
    return { x, y, market: mk('marketToday'), cost: mk('cost'), fill, maxV, t0, t1 };
  }, [points, width]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!geom) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(geom.x(p.date) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hp = hover != null ? points[hover] : null;
  const mark = highlight ? points.find((p) => p.added.some((a) => a.id === highlight)) : null;

  return (
    <div className="mt-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-[19px] font-semibold">Collection growth</h3>
          <p className="max-w-[62ch] text-[12.5px] text-ink-muted">
            Running total by purchase date: what you recorded paying, and what those same cards are
            worth at today’s prices. Not a history of past values.
            {undated > 0
              ? ` ${undated} holding${undated === 1 ? ' has' : 's have'} no date and are left out.`
              : ''}
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={range === r.id}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={wrap} className="relative mt-3">
        {!geom ? (
          <p className="rounded-xl border border-dashed border-border-strong p-6 text-[13.5px] text-ink-muted">
            No dated holdings in this range.
          </p>
        ) : (
          <>
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`Recorded cost ${formatCurrency(points[points.length - 1].cost)} and today's value ${formatCurrency(points[points.length - 1].marketToday)} of cards bought since ${points[0].date}`}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              className="block touch-pan-y"
            >
              <defs>
                <linearGradient id="pv-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
                  <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <g key={f}>
                  <line
                    x1={pad.l}
                    x2={width - pad.r}
                    y1={geom.y(geom.maxV * f)}
                    y2={geom.y(geom.maxV * f)}
                    stroke="var(--chart-grid)"
                  />
                  <text
                    x={width - pad.r}
                    y={geom.y(geom.maxV * f) - 4}
                    textAnchor="end"
                    className="fill-[var(--chart-tick)] font-mono text-[10.5px]"
                  >
                    {formatCurrency(geom.maxV * f)}
                  </text>
                </g>
              ))}
              <AnimatePresence mode="wait">
                <motion.g
                  key={range}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <path d={geom.fill} fill="url(#pv-fill)" />
                  <motion.path
                    d={geom.market}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2.25}
                    initial={reduced ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
                  />
                  <motion.path
                    d={geom.cost}
                    fill="none"
                    stroke="var(--gold-line)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    initial={reduced ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.9, delay: 0.1 }}
                  />
                </motion.g>
              </AnimatePresence>
              {points.map((p) =>
                p.added.length ? (
                  <circle
                    key={p.date}
                    cx={geom.x(p.date)}
                    cy={geom.y(p.marketToday)}
                    r={2.5}
                    fill="var(--accent)"
                  />
                ) : null
              )}
              {mark ? (
                <g>
                  <line
                    x1={geom.x(mark.date)}
                    x2={geom.x(mark.date)}
                    y1={pad.t}
                    y2={height - pad.b}
                    stroke="var(--gold-line)"
                    strokeWidth={1.5}
                  />
                  <circle
                    cx={geom.x(mark.date)}
                    cy={geom.y(mark.marketToday)}
                    r={6}
                    fill="var(--gold-line)"
                    stroke="var(--surface-raised)"
                    strokeWidth={2}
                  />
                </g>
              ) : null}
              {hp ? (
                <g pointerEvents="none">
                  <line
                    x1={geom.x(hp.date)}
                    x2={geom.x(hp.date)}
                    y1={pad.t}
                    y2={height - pad.b}
                    stroke="var(--ink-muted)"
                    strokeDasharray="2 3"
                  />
                  <circle
                    cx={geom.x(hp.date)}
                    cy={geom.y(hp.marketToday)}
                    r={5}
                    fill="var(--accent)"
                    stroke="var(--surface-raised)"
                    strokeWidth={2}
                  />
                  <circle
                    cx={geom.x(hp.date)}
                    cy={geom.y(hp.cost)}
                    r={4}
                    fill="var(--gold-line)"
                    stroke="var(--surface-raised)"
                    strokeWidth={2}
                  />
                </g>
              ) : null}
              <text
                x={pad.l}
                y={height - 6}
                className="fill-[var(--chart-tick)] font-mono text-[10.5px]"
              >
                {points[0].date}
              </text>
              <text
                x={width - pad.r}
                y={height - 6}
                textAnchor="end"
                className="fill-[var(--chart-tick)] font-mono text-[10.5px]"
              >
                today
              </text>
            </svg>
            {hp ? (
              <div
                className="pointer-events-none absolute top-2 z-10 w-60 rounded-xl border border-border-default bg-surface-overlay p-3 text-[12.5px] shadow-lg"
                style={{ left: Math.min(Math.max(0, geom.x(hp.date) + 12), width - 250) }}
              >
                <p className="font-mono text-[11.5px] text-ink-muted">{hp.date}</p>
                <p className="mt-1 flex justify-between">
                  <span className="text-ink-secondary">Value today</span>
                  <span className="font-mono">{formatCurrency(hp.marketToday)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-ink-secondary">Recorded cost</span>
                  <span className="font-mono">{formatCurrency(hp.cost)}</span>
                </p>
                {hp.added.length ? (
                  <p className="mt-1.5 border-t border-border-subtle pt-1.5 text-ink-secondary">
                    Added{' '}
                    {hp.added
                      .slice(0, 3)
                      .map((a) => a.name)
                      .join(', ')}
                    {hp.added.length > 3 ? ` and ${hp.added.length - 3} more` : ''}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
      <p className="mt-2 flex flex-wrap gap-4 text-[12px] text-ink-secondary" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-accent" />
          Value of cards held, at today’s prices
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 border-t-2 border-dashed border-[var(--gold-line)]" />
          Recorded cost
        </span>
      </p>
    </div>
  );
}

/**
 * Actual performance needs the collection's value recorded on past dates.
 * No such history is stored, so this says so instead of drawing a line from
 * today's prices that would look like one.
 */
function ActualPerformance() {
  return (
    <div className="mt-5 flex flex-wrap items-start gap-3 rounded-2xl border border-dashed border-border-strong px-4 py-3">
      <svg viewBox="0 0 40 24" className="mt-0.5 h-6 w-10 shrink-0 text-ink-muted" aria-hidden>
        <path d="M2 20h36" stroke="currentColor" strokeOpacity=".4" />
        <path
          d="M2 16l8-3 7 4 8-9 6 3 7-6"
          fill="none"
          stroke="currentColor"
          strokeDasharray="2 3"
          strokeLinecap="round"
        />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium">Actual performance</p>
        <p className="text-[12.5px] text-ink-muted">
          Shown once your collection’s value has been recorded over time. No past valuations are
          stored yet, so the chart above is growth by purchase date at today’s prices, not a record
          of what the collection was worth.
        </p>
      </div>
    </div>
  );
}
