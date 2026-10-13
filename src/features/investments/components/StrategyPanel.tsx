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
import { FilterBar, FilterChip, StatBlock } from '@/components/layout/PageShell';
import { InlineNotice } from '@/components/common/InlineNotice';
import { cn } from '@/lib/utils';
import { fetchStrategyReport } from '../../../services/investmentOpportunitiesApi';
import type { StrategyMarket, StrategyPick, StrategyReport, StrategySummary } from '../types';
import { CardThumb, EmptyState, formatUsd, PanelLoading } from './shared';

const HORIZONS = [4, 8, 12] as const;

const pct = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(digits)}%`;

const share = (n: number) => `${Math.round(n * 100)}%`;

function useStrategyReport(market: StrategyMarket, horizonWeeks: number) {
  const [report, setReport] = useState<StrategyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
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
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [market, horizonWeeks]);

  return { report, loading, failed };
}

function StrategyRow({ s }: { s: StrategySummary }) {
  const tested = s.formations > 0;
  return (
    <tr className="border-t border-border-subtle align-top">
      <td className="py-3 pr-4">
        <p className="text-sm font-medium text-ink-primary">{s.label}</p>
        <p className="mt-0.5 max-w-xs text-xs text-ink-muted">{s.description}</p>
      </td>
      <td
        className={cn(
          'py-3 pr-4 text-right font-mono text-sm tabular-nums',
          !tested ? 'text-ink-muted' : s.meanExcess >= 0 ? 'text-gain' : 'text-loss'
        )}
      >
        {tested ? pct(s.meanExcess) : '—'}
      </td>
      <td className="py-3 pr-4 text-right font-mono text-sm tabular-nums text-ink-secondary">
        {tested ? `${Math.round(s.beatRate * s.formations)}/${s.formations}` : '—'}
      </td>
      <td
        className={cn(
          'py-3 pr-4 text-right font-mono text-sm tabular-nums',
          !tested ? 'text-ink-muted' : s.pickMedianNet >= 0 ? 'text-gain' : 'text-loss'
        )}
      >
        {tested ? pct(s.pickMedianNet) : '—'}
      </td>
      <td className="py-3 text-right font-mono text-sm tabular-nums text-ink-secondary">
        {tested ? share(s.pickHitRate) : '—'}
      </td>
    </tr>
  );
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
 * fair-entry screen would buy today. Leads with the honest baseline: what
 * buying a random card and selling later actually returned.
 */
export function StrategyPanel() {
  const [market, setMarket] = useState<StrategyMarket>('raw');
  const [horizon, setHorizon] = useState<number>(8);
  const { report, loading, failed } = useStrategyReport(market, horizon);
  const [, setSearchParams] = useSearchParams();

  const openCard = (cardId: string | null) =>
    cardId && !cardId.startsWith('tcgcsv-')
      ? () =>
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('card', cardId);
            return next;
          })
      : undefined;

  const strategies = [...(report?.strategies ?? [])].sort((a, b) => b.meanExcess - a.meanExcess);
  const baseline = report?.strategies[0];
  const featured =
    report?.strategies.find((s) => s.strategyId === 'fair_entry' && s.equity.length > 1) ??
    strategies.find((s) => s.equity.length > 1);

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

      {loading ? (
        <PanelLoading />
      ) : failed || !report ? (
        <EmptyState
          message="Couldn't load the backtest. The backend may be offline, or it's still building price history (the first load can take a minute)."
          isError
        />
      ) : (
        <>
          {report.notes.map((note) => (
            <InlineNotice
              key={note}
              tone={note.startsWith('TCGplayer prices stopped') ? 'error' : 'info'}
            >
              {note}
            </InlineNotice>
          ))}

          <div className="grid gap-3 sm:grid-cols-3">
            <StatBlock
              label={`Random card, held ${horizon} weeks`}
              value={baseline && baseline.formations > 0 ? pct(baseline.universeMedianNet) : '—'}
              trend={
                baseline && baseline.formations > 0
                  ? baseline.universeMedianNet >= 0
                    ? 'up'
                    : 'down'
                  : undefined
              }
              hint={`Median after ${Math.round(report.costs.sellFeePct * 1000) / 10}% fees and shipping, cards ${formatUsd(report.minPrice)}+`}
            />
            <StatBlock
              label="Made money"
              value={baseline && baseline.formations > 0 ? share(baseline.universeHitRate) : '—'}
              hint="Share of round trips that came out ahead"
            />
            <StatBlock
              label="Test windows"
              value={baseline?.formations ?? 0}
              hint={
                report.data.firstDate && report.data.lastDate
                  ? `${report.data.weeks} weeks of prices, ${report.data.firstDate} to ${report.data.lastDate}`
                  : 'No price history yet'
              }
            />
          </div>

          <div className="card-chrome overflow-x-auto">
            <p className="text-sm font-semibold text-ink-primary">Strategies vs buying at random</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Each week, each strategy buys at the real ask and sells {horizon} weeks later.
              &ldquo;vs random&rdquo; is how much better its picks did than every card in the same
              price range.
            </p>
            <table className="mt-3 w-full min-w-[34rem]">
              <thead>
                <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                  <th className="pb-2 pr-4 font-medium">Strategy</th>
                  <th className="pb-2 pr-4 text-right font-medium">vs random</th>
                  <th className="pb-2 pr-4 text-right font-medium">Weeks ahead</th>
                  <th className="pb-2 pr-4 text-right font-medium">Median net</th>
                  <th className="pb-2 text-right font-medium">Made money</th>
                </tr>
              </thead>
              <tbody>
                {strategies.map((s) => (
                  <StrategyRow key={s.strategyId} s={s} />
                ))}
              </tbody>
            </table>
          </div>

          {featured && <EquityChart s={featured} />}

          {market === 'raw' && (
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
      )}
    </div>
  );
}
