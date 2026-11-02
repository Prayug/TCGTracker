import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FilterBar, FilterChip } from '@/components/layout/PageShell';
import { InlineNotice } from '@/components/common/InlineNotice';
import { cn } from '@/lib/utils';
import { fetchStrategyReport } from '../../../services/investmentOpportunitiesApi';
import type { StrategyMarket, StrategyPick, StrategyReport, StrategySummary } from '../types';
import {
  classifyStrategyReport,
  maxDrawdown,
  MIN_WINDOWS,
  type StrategyState,
} from '../utils/strategyState';
import { CardThumb, EmptyState, formatUsd, PanelLoading } from './shared';

const HORIZONS = [4, 8, 12] as const;

const pct = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(digits)}%`;

const drawdown = (n: number) => (n === 0 ? 'None' : `${(n * 100).toFixed(1)}%`);

const share = (n: number) => `${Math.round(n * 100)}%`;

function useStrategyReport(market: StrategyMarket, horizonWeeks: number, attempt: number) {
  const [report, setReport] = useState<StrategyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 3000);
    fetchStrategyReport({ market, horizonWeeks }, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setReport(res);
        setFailed(res == null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        clearTimeout(slowTimer);
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      clearTimeout(slowTimer);
      controller.abort();
    };
  }, [market, horizonWeeks, attempt]);

  return { report, loading, failed, slow };
}

function EquityChart({ s }: { s: StrategySummary }) {
  if (s.equity.length < 2) return null;
  const data = s.equity.map((p) => ({
    date: p.date.slice(5),
    strategy: Math.round((p.strategy - 1) * 1000) / 10,
    random: Math.round((p.universe - 1) * 1000) / 10,
  }));
  return (
    <div className="card-chrome">
      <p className="text-sm font-semibold text-ink-primary">
        $1 in {s.label.toLowerCase()} vs random cards
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">
        Cumulative net return, rolling into the next {s.horizonWeeks}-week hold after each sale.
      </p>
      <div className="mt-3 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--ink-muted)' }} />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--ink-muted)' }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              formatter={(v: number) => `${v}%`}
              contentStyle={{
                background: 'var(--surface-overlay)',
                border: '1px solid var(--border-default)',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="strategy"
              name={s.label}
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="random"
              name="Random card"
              stroke="var(--ink-muted)"
              strokeDasharray="4 3"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PickRow({ p, onOpen }: { p: StrategyPick; onOpen?: () => void }) {
  const body = (
    <>
      <CardThumb imageSmall={p.imageSmall} name={p.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-primary">{p.name ?? p.id}</p>
        <p className="truncate text-xs text-ink-muted">{p.setName}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
          {formatUsd(p.entryPrice)}
        </p>
        <p className="text-[11px] text-ink-muted">
          {p.lowestListing != null ? `lowest listing ${formatUsd(p.lowestListing)}` : 'market'}
        </p>
      </div>
      <div className="hidden w-32 shrink-0 text-right sm:block">
        <p className="font-mono text-sm tabular-nums text-ink-secondary">
          {formatUsd(p.breakEvenPrice)}
        </p>
        <p className="text-[11px] text-ink-muted">break-even {pct(p.breakEvenPct, 0)}</p>
      </div>
      <div
        className={cn(
          'w-16 shrink-0 text-right font-mono text-xs tabular-nums',
          p.change4w == null ? 'text-ink-muted' : p.change4w >= 0 ? 'text-gain' : 'text-loss'
        )}
        title="Four-week change"
      >
        {pct(p.change4w)}
      </div>
    </>
  );
  const cls = 'flex w-full items-center gap-3 px-3 py-2.5 text-left';
  return onOpen ? (
    <button type="button" onClick={onOpen} className={cn(cls, 'hover:bg-surface-hover')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * Backtested strategies on real weekly prices, net of fees, plus what the
 * fair-entry screen would buy today. Each outcome has its own screen:
 * loading, an API failure, no price history, too little history for the
 * chosen hold, too few comparable cards, and a run with results, whose
 * quality (small sample, no strategy ahead, or ahead) is said up front.
 */
export function StrategyPanel() {
  const [market, setMarket] = useState<StrategyMarket>('raw');
  const [horizon, setHorizon] = useState<number>(8);
  const [attempt, setAttempt] = useState(0);
  const { report, loading, failed, slow } = useStrategyReport(market, horizon, attempt);
  const [, setSearchParams] = useSearchParams();
  const state = classifyStrategyReport(report, { loading, failed, horizon });

  const openCard = (cardId: string | null) =>
    cardId && !cardId.startsWith('tcgcsv-')
      ? () =>
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('card', cardId);
            return next;
          })
      : undefined;

  return (
    <div className="space-y-6">
      <FilterBar>
        <FilterChip active={market === 'raw'} onClick={() => setMarket('raw')}>
          Raw cards
        </FilterChip>
        <FilterChip active={market === 'psa10'} onClick={() => setMarket('psa10')}>
          PSA 10
        </FilterChip>
        <span className="mx-1 h-4 w-px bg-border-subtle" aria-hidden />
        {HORIZONS.map((h) => (
          <FilterChip key={h} active={horizon === h} onClick={() => setHorizon(h)}>
            Hold {h}w
          </FilterChip>
        ))}
      </FilterBar>

      {state.kind === 'loading' ? (
        <PanelLoading
          message={
            slow
              ? 'Building the backtest from price history. The first load after a backend restart can take up to a minute; after that it is cached.'
              : undefined
          }
        />
      ) : state.kind === 'error' ? (
        <StateCard
          icon="error"
          title="The backtest didn’t load"
          body="The strategy service did not answer. The backend may be offline or still building price history; the first load after a restart can take a minute."
          action={{ label: 'Try again', onClick: () => setAttempt((n) => n + 1) }}
        />
      ) : state.kind === 'no-data' ? (
        <StateCard
          icon="empty"
          title="No price history to test against yet"
          body={`A backtest replays weekly ${market === 'psa10' ? 'PSA 10 sale' : 'TCGplayer market'} prices. None are stored for this market yet, so there is nothing to test. Results appear once weekly prices start being recorded.`}
          action={
            market === 'psa10'
              ? { label: 'Try raw cards', onClick: () => setMarket('raw') }
              : undefined
          }
        />
      ) : state.kind === 'insufficient-history' ? (
        <StateCard
          icon="history"
          title={`${state.weeks} week${state.weeks === 1 ? '' : 's'} of prices: not enough for a ${horizon}-week hold`}
          body={`Each test buys in one week and sells ${horizon} weeks later, so it needs more than ${horizon} weeks of prices. ${
            state.testableHorizon
              ? `${state.testableHorizon === 8 ? 'An' : 'A'} ${state.testableHorizon}-week hold fits the history on file.`
              : 'No hold length fits the history on file yet; check back as more weeks are recorded.'
          }`}
          action={
            state.testableHorizon
              ? {
                  label: `Test ${state.testableHorizon === 8 ? 'an' : 'a'} ${state.testableHorizon}-week hold`,
                  onClick: () => setHorizon(state.testableHorizon as number),
                }
              : undefined
          }
          weeks={{ have: state.weeks, need: horizon + 1 }}
        />
      ) : state.kind === 'no-universe' ? (
        <StateCard
          icon="empty"
          title="Too few comparable cards to test"
          body={`There are ${state.weeks} weeks of prices across ${state.series} cards, but in no week were enough cards above ${formatUsd(report?.minPrice)} priced at both the buy and the sell date to compare a strategy with buying at random.`}
          action={
            market === 'psa10'
              ? { label: 'Try raw cards', onClick: () => setMarket('raw') }
              : undefined
          }
        />
      ) : report ? (
        <Results report={report} state={state} horizon={horizon} />
      ) : null}

      {report && state.kind !== 'loading' && state.kind !== 'error' ? (
        <>
          {report.notes.map((note) => (
            <InlineNotice
              key={note}
              tone={note.startsWith('TCGplayer prices stopped') ? 'error' : 'info'}
            >
              {note}
            </InlineNotice>
          ))}

          {market === 'raw' && (report.picks.length > 0 || state.kind === 'results') && (
            <section className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold text-ink-primary">Fair entries right now</h3>
                <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">
                  Not predicted winners. These are $50+ cards where the cheapest listing sits just
                  under market and the price hasn&rsquo;t just spiked, which historically lost less
                  than a random buy. Break-even is the price you need to sell at to cover fees and
                  shipping.
                </p>
              </div>
              {report.picks.length === 0 ? (
                <EmptyState message="No cards pass the fair-entry screen in the latest prices." />
              ) : (
                <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
                  {report.picks.map((p) => (
                    <PickRow key={p.id} p={p} onOpen={openCard(p.cardId)} />
                  ))}
                </div>
              )}
            </section>
          )}

          {report.spikes.length > 0 && (
            <section className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold text-ink-primary">Just spiked: wait</h3>
                <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">
                  Up 50% or more in four weeks. In the backtest, buying after a spike like this did
                  worse than buying at random.
                </p>
              </div>
              <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
                {report.spikes.map((p) => (
                  <PickRow key={p.id} p={p} onOpen={openCard(p.cardId)} />
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

const STATE_ICONS: Record<'error' | 'empty' | 'history', JSX.Element> = {
  error: (
    <path
      d="M24 8 42 40H6L24 8Zm0 12v10m0 4v2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  ),
  empty: (
    <>
      <path d="M6 40h36" stroke="currentColor" strokeWidth="2" strokeOpacity=".5" />
      <path
        d="M8 34l8-6 7 4 9-10 8 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeDasharray="2 4"
        strokeLinecap="round"
      />
    </>
  ),
  history: (
    <>
      <circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M24 14v10l7 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </>
  ),
};

function StateCard({
  icon,
  title,
  body,
  action,
  weeks,
}: {
  icon: keyof typeof STATE_ICONS;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  weeks?: { have: number; need: number };
}) {
  return (
    <section
      role={icon === 'error' ? 'alert' : undefined}
      className="grid gap-5 rounded-3xl border border-border-default bg-surface-raised p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-8"
    >
      <svg
        viewBox="0 0 48 48"
        className={cn('h-12 w-12', icon === 'error' ? 'text-loss' : 'text-accent')}
        aria-hidden
      >
        {STATE_ICONS[icon]}
      </svg>
      <div className="max-w-[62ch]">
        <h3 className="font-display text-[clamp(1.2rem,2.2vw,1.5rem)] font-semibold tracking-[-0.01em]">
          {title}
        </h3>
        <p className="mt-2 text-[14px] text-ink-secondary">{body}</p>
        {weeks ? (
          <div className="mt-4" aria-label={`${weeks.have} of ${weeks.need} weeks needed`}>
            <div className="flex gap-1">
              {Array.from({ length: weeks.need }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-2 flex-1 rounded-full',
                    i < weeks.have ? 'bg-accent' : 'bg-surface-inset'
                  )}
                />
              ))}
            </div>
            <p className="mt-1.5 font-mono text-[11.5px] text-ink-muted">
              {weeks.have} of {weeks.need} weeks
            </p>
          </div>
        ) : null}
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="btn-primary mt-5 h-9 px-4 text-[13px]"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}

const QUALITY_COPY = {
  'small-sample': {
    tone: 'text-warn',
    label: 'Small sample',
    line: (w: number) =>
      `Only ${w} test window${w === 1 ? '' : 's'} so far. Treat these numbers as early, not as evidence.`,
  },
  poor: {
    tone: 'text-loss',
    label: 'No strategy beat random',
    line: (w: number) =>
      `Across ${w} test windows, none of the strategies did better than buying a random card in the same price range.`,
  },
  good: {
    tone: 'text-gain',
    label: 'Tested',
    line: (w: number) => `Results across ${w} weekly test windows, after fees and shipping.`,
  },
} as const;

function Results({
  report,
  state,
  horizon,
}: {
  report: StrategyReport;
  state: Extract<StrategyState, { kind: 'results' }>;
  horizon: number;
}) {
  const tested = report.strategies
    .filter((s) => s.formations > 0)
    .sort((a, b) => b.meanExcess - a.meanExcess);
  const untested = report.strategies.filter((s) => s.formations === 0);
  const [pick, setPick] = useState<string>(state.best.strategyId);
  const selected = tested.find((s) => s.strategyId === pick) ?? state.best;
  const q = QUALITY_COPY[state.quality];
  const maxAbs = Math.max(0.01, ...tested.map((s) => Math.abs(s.meanExcess)));
  const fees = `${Math.round(report.costs.sellFeePct * 1000) / 10}% fees and shipping`;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-border-default bg-surface-raised p-5 sm:p-7">
        <p className={cn('font-mono text-[11.5px] uppercase tracking-[0.14em]', q.tone)}>
          {q.label}
        </p>
        <h3 className="mt-1 font-display text-[clamp(1.3rem,2.6vw,1.9rem)] font-semibold tracking-[-0.02em]">
          {state.quality === 'poor'
            ? `Buying at random did as well as any strategy over ${horizon} weeks`
            : `${state.best.label}: ${pct(state.best.meanExcess)} vs random per ${horizon}-week hold`}
        </h3>
        <p className="mt-1 max-w-[70ch] text-[13px] text-ink-muted">
          {q.line(state.windows)} Prices {report.data.firstDate} to {report.data.lastDate}, cards{' '}
          {formatUsd(report.minPrice)}+, net of {fees}.
        </p>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>
            <p className="text-[12.5px] font-medium text-ink-secondary">
              Average return vs a random card, per hold
            </p>
            <ul className="mt-2 space-y-1" aria-label="Strategies compared with random buying">
              {tested.map((s) => {
                const w = (Math.abs(s.meanExcess) / maxAbs) * 50;
                const up = s.meanExcess >= 0;
                return (
                  <li key={s.strategyId}>
                    <button
                      type="button"
                      aria-pressed={selected.strategyId === s.strategyId}
                      onClick={() => setPick(s.strategyId)}
                      className={cn(
                        'grid w-full grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-lg px-2 py-2 text-left text-[13px] hover:bg-surface-hover',
                        selected.strategyId === s.strategyId && 'bg-surface-hover'
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{s.label}</span>
                        <span className="block font-mono text-[11px] text-ink-muted">
                          {s.formations} window{s.formations === 1 ? '' : 's'}
                          {s.formations < MIN_WINDOWS ? (
                            <span className="ml-1 font-sans text-warn">· small sample</span>
                          ) : null}
                        </span>
                      </span>
                      <span className="relative h-3 rounded-full bg-surface-inset ring-1 ring-inset ring-rule">
                        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-rule-strong" />
                        <span
                          className={cn(
                            'absolute inset-y-0 rounded-full',
                            up ? 'left-1/2 bg-gain' : 'right-1/2 bg-loss'
                          )}
                          style={{ width: `${w}%` }}
                        />
                      </span>
                      <span
                        className={cn(
                          'text-right font-mono tabular-nums',
                          up ? 'text-gain' : 'text-loss'
                        )}
                      >
                        {pct(s.meanExcess)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {untested.length > 0 ? (
              <p className="mt-2 text-[12px] text-ink-muted">
                Not testable with this history: {untested.map((s) => s.label).join(', ')}.
              </p>
            ) : null}
          </div>

          <StrategyDetail s={selected} />
        </div>
      </section>

      <EquityChart s={selected} />
    </div>
  );
}

function StrategyDetail({ s }: { s: StrategySummary }) {
  const ddS = maxDrawdown(s.equity.map((e) => e.strategy));
  const ddU = maxDrawdown(s.equity.map((e) => e.universe));
  const rows: { label: string; mine: string; base: string; hint: string; good: boolean | null }[] =
    [
      {
        label: 'Median net',
        mine: pct(s.pickMedianNet),
        base: pct(s.universeMedianNet),
        hint: 'Middle round trip after fees',
        good: s.pickMedianNet >= s.universeMedianNet,
      },
      {
        label: 'Made money',
        mine: share(s.pickHitRate),
        base: share(s.universeHitRate),
        hint: 'Share of round trips that came out ahead',
        good: s.pickHitRate >= s.universeHitRate,
      },
      {
        label: 'Weeks ahead',
        mine: `${Math.round(s.beatRate * s.formations)}/${s.formations}`,
        base: '',
        hint: 'Windows where its picks beat random',
        good: s.beatRate >= 0.5,
      },
      {
        label: 'Worst drawdown',
        mine: s.equity.length > 1 ? drawdown(ddS) : '—',
        base: s.equity.length > 1 ? drawdown(ddU) : '—',
        hint: 'Deepest fall of $1 rolled hold to hold',
        good: s.equity.length > 1 ? ddS >= ddU : null,
      },
    ];
  return (
    <div>
      <p className="text-[12.5px] font-medium text-ink-secondary">{s.label}</p>
      <p className="text-[12px] text-ink-muted">{s.description}</p>
      <dl className="mt-3 divide-y divide-rule rounded-xl border border-border-default">
        <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] gap-2 px-3 py-1.5 text-[11px] text-ink-muted">
          <span />
          <span className="text-right">Strategy</span>
          <span className="text-right">Random</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-2 px-3 py-2"
          >
            <dt className="min-w-0">
              <span className="block text-[13px]">{r.label}</span>
              <span className="block truncate text-[11px] text-ink-muted">{r.hint}</span>
            </dt>
            <dd
              className={cn(
                'text-right font-mono text-[13px] tabular-nums',
                r.good == null ? '' : r.good ? 'text-gain' : 'text-loss'
              )}
            >
              {r.mine}
            </dd>
            <dd className="text-right font-mono text-[13px] tabular-nums text-ink-muted">
              {r.base}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
