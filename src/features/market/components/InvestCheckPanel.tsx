import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchCardCheck } from '../../../services/investmentOpportunitiesApi';
import type { CardCheck, PositionCheck, StrategyReport } from '../../investments/types';
import { formatCurrency } from '../../../utils/cardDisplay';

const HORIZONS = [4, 8, 12] as const;

const pct = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(digits)}%`;

type Costs = StrategyReport['costs'];

function netProfit(buy: number, sell: number, costs: Costs): number {
  const proceeds = sell * (1 - costs.sellFeePct) - costs.sellFixedFee - costs.sellShipping;
  return proceeds - (buy + costs.buyShipping);
}

function entryVerdict(c: PositionCheck): { label: string; tone: 'good' | 'warn' | 'neutral' } {
  if (c.spike) return { label: 'Just spiked: historically a bad time to buy', tone: 'warn' };
  if (c.fairEntry) return { label: 'Fair entry: cheapest listing just under market', tone: 'good' };
  if (c.askRatio != null && c.askRatio >= 1)
    return { label: 'Every listing is above market; you would overpay', tone: 'warn' };
  if (c.askRatio != null && c.askRatio < 0.85)
    return { label: 'Cheapest listing is far under market; check its condition', tone: 'neutral' };
  return { label: 'No entry signal', tone: 'neutral' };
}

function Row({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <div>
        <p className="text-sm text-ink-secondary">{label}</p>
        {hint ? <p className="text-[11px] text-ink-muted">{hint}</p> : null}
      </div>
      <div className="text-right font-mono text-sm tabular-nums text-ink-primary">{value}</div>
    </div>
  );
}

function Calculator({ check }: { check: PositionCheck }) {
  const [buy, setBuy] = useState(check.entryPrice.toFixed(2));
  const [sell, setSell] = useState(check.breakEvenPrice.toFixed(2));
  const b = Number(buy);
  const s = Number(sell);
  const valid = Number.isFinite(b) && b > 0 && Number.isFinite(s) && s > 0;
  const profit = valid ? netProfit(b, s, check.costs) : null;
  return (
    <div className="mt-3 rounded-xl bg-surface-raised p-3">
      <p className="text-xs font-medium text-ink-secondary">Trade calculator</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-[11px] text-ink-muted">
          Buy at
          <input
            className="input mt-1 h-9 w-full py-1 text-sm"
            inputMode="decimal"
            value={buy}
            onChange={(e) => setBuy(e.target.value)}
          />
        </label>
        <label className="text-[11px] text-ink-muted">
          Sell at
          <input
            className="input mt-1 h-9 w-full py-1 text-sm"
            inputMode="decimal"
            value={sell}
            onChange={(e) => setSell(e.target.value)}
          />
        </label>
      </div>
      <p
        className={cn(
          'mt-2 font-mono text-sm tabular-nums',
          profit == null ? 'text-ink-muted' : profit >= 0 ? 'text-gain' : 'text-loss'
        )}
      >
        {profit == null
          ? 'Enter prices'
          : `${profit >= 0 ? '+' : '−'}${formatCurrency(Math.abs(profit))} net (${pct(profit / (b + check.costs.buyShipping))})`}
      </p>
      <p className="mt-1 text-[11px] text-ink-muted">
        After {(check.costs.sellFeePct * 100).toFixed(2)}% +{' '}
        {formatCurrency(check.costs.sellFixedFee)} selling fees and{' '}
        {formatCurrency(check.costs.sellShipping + check.costs.buyShipping)} shipping both ways.
      </p>
    </div>
  );
}

function PositionCard({
  title,
  check,
  horizon,
}: {
  title: string;
  check: PositionCheck;
  horizon: number;
}) {
  const verdict = entryVerdict(check);
  const br = check.baseRate;
  return (
    <section className="rounded-xl border border-border-subtle p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-ink-primary">{title}</h4>
        {check.asOf && (
          <span
            className={cn(
              'text-[11px]',
              check.staleDays > 0 ? 'text-amber-200/70' : 'text-ink-muted'
            )}
          >
            prices as of {check.asOf}
          </span>
        )}
      </div>
      {check.staleDays > 0 && (
        <p className="mt-1 text-[11px] text-amber-200/70">
          This price feed stopped updating {check.staleDays} days before the latest sync.
        </p>
      )}
      <p
        className={cn(
          'mt-2 text-xs font-medium',
          verdict.tone === 'good' && 'text-gain',
          verdict.tone === 'warn' && 'text-loss',
          verdict.tone === 'neutral' && 'text-ink-muted'
        )}
      >
        {verdict.label}
      </p>

      <div className="mt-2 divide-y divide-border-subtle">
        <Row
          label="You'd pay"
          value={formatCurrency(check.entryPrice)}
          hint={
            check.lowestListing != null
              ? `market ${formatCurrency(check.price)} · lowest listing ${formatCurrency(check.lowestListing)}`
              : `market ${formatCurrency(check.price)}`
          }
        />
        <Row
          label="Break-even sale"
          value={`${formatCurrency(check.breakEvenPrice)} (${pct(check.breakEvenPct, 0)})`}
          hint="Price that covers fees and shipping"
        />
        <Row label="Last 4 weeks" value={pct(check.change4w)} />
        <Row label="Last 12 weeks" value={pct(check.change12w)} />
        {check.weeklyVolatility != null && (
          <Row
            label="Typical weekly swing"
            value={`±${(check.weeklyVolatility * 100).toFixed(1)}%`}
          />
        )}
      </div>

      {br ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-secondary">
          Cards in the {br.label} range bought at the ask and sold {horizon} weeks later returned a
          median{' '}
          <span className={br.medianNet >= 0 ? 'text-gain' : 'text-loss'}>{pct(br.medianNet)}</span>{' '}
          after costs (middle half {pct(br.p25Net)} to {pct(br.p75Net)}).{' '}
          {Math.round(br.hitRate * 100)}% made money across {br.samples.toLocaleString()} trades.
        </p>
      ) : (
        <p className="mt-3 text-xs text-ink-muted">
          Not enough price history yet for a {horizon}-week base rate in this price range.
        </p>
      )}

      <Calculator key={`${check.market}-${check.entryPrice}`} check={check} />
    </section>
  );
}

/**
 * Investment check for the open card: what you'd really pay, the sale price
 * that breaks even after fees, entry quality, and what similar-priced cards
 * have historically returned over the chosen hold.
 */
export function InvestCheckPanel({
  cardId,
  variant,
  productId,
}: {
  cardId: string;
  variant?: string;
  productId?: string;
}) {
  const [horizon, setHorizon] = useState<number>(8);
  const [check, setCheck] = useState<CardCheck | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchCardCheck({ cardId, variant, productId, horizonWeeks: horizon }, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setCheck(res);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCheck(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [cardId, variant, productId, horizon]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-primary">Investment check</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            Based on weekly prices and a walk-forward backtest, net of fees.
          </p>
        </div>
        <div className="flex gap-0.5 rounded-lg bg-surface-raised p-0.5">
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHorizon(h)}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums',
                horizon === h
                  ? 'bg-surface-hover text-ink-primary'
                  : 'text-ink-muted hover:text-ink-secondary'
              )}
            >
              Hold {h}w
            </button>
          ))}
        </div>
      </div>

      {loading && !check ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        </div>
      ) : !check || (!check.raw && !check.psa10) ? (
        <p className="py-6 text-sm text-ink-muted">
          No tracked price series for this card yet, so there is nothing to backtest.
        </p>
      ) : (
        <div className={cn('grid gap-4', check.raw && check.psa10 && 'md:grid-cols-2')}>
          {check.raw && (
            <PositionCard title="Raw (TCGplayer)" check={check.raw} horizon={horizon} />
          )}
          {check.psa10 && <PositionCard title="PSA 10" check={check.psa10} horizon={horizon} />}
        </div>
      )}
    </div>
  );
}
