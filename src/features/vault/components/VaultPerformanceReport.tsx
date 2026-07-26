import React, { useMemo, useState } from 'react';
import { Download, TrendingDown, TrendingUp } from 'lucide-react';
import { VaultCard } from '../../../types/pokemon';
import { getCardPrice } from '../../../utils/cardPrice';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { PriceChart } from '../../market/components/PriceChart';
import { SectionLabel } from '../../../components/common/SectionLabel';

export type PerformancePeriod = '7d' | '30d' | 'ytd' | 'all';

interface VaultPerformanceReportProps {
  vaultCards: VaultCard[];
}

interface HoldingPerf {
  id: string;
  name: string;
  setName: string;
  quantity: number;
  costBasis: number;
  currentValue: number;
  profit: number;
  profitPct: number;
}

function periodStart(period: PerformancePeriod): Date | null {
  const now = new Date();
  if (period === 'all') return null;
  if (period === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (period === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  // YTD
  return new Date(now.getFullYear(), 0, 1);
}

function buildHoldings(vaultCards: VaultCard[]): HoldingPerf[] {
  return vaultCards.map((vc) => {
    const market = getCardPrice(vc.card);
    const costBasis = vc.purchasePrice * vc.quantity;
    const currentValue = market * vc.quantity;
    const profit = currentValue - costBasis;
    return {
      id: vc.id,
      name: vc.card.name,
      setName: vc.card.set?.name ?? '',
      quantity: vc.quantity,
      costBasis,
      currentValue,
      profit,
      profitPct: costBasis > 0 ? (profit / costBasis) * 100 : 0,
    };
  });
}

/** Approximate portfolio value series from cost basis + current snapshot. */
function buildValueSeries(
  vaultCards: VaultCard[],
  period: PerformancePeriod
): { date: string; price: number }[] {
  const start = periodStart(period);
  const holdings = buildHoldings(vaultCards);
  const totalCost = holdings.reduce((s, h) => s + h.costBasis, 0);
  const totalCurrent = holdings.reduce((s, h) => s + h.currentValue, 0);

  const points: { date: string; price: number }[] = [];
  const end = new Date();
  const begin = start ?? (() => {
    const dates = vaultCards
      .map((c) => new Date(c.purchaseDate).getTime())
      .filter((t) => !Number.isNaN(t));
    return new Date(dates.length ? Math.min(...dates) : end.getTime() - 90 * 86400000);
  })();

  const days = Math.max(1, Math.ceil((end.getTime() - begin.getTime()) / 86400000));
  const steps = Math.min(days, period === '7d' ? 7 : period === '30d' ? 30 : 60);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const d = new Date(begin.getTime() + t * (end.getTime() - begin.getTime()));
    // Linear blend cost → current as a simple performance proxy without full history
    const value = totalCost + (totalCurrent - totalCost) * t;
    // Weight in purchases that occurred by this date
    const purchasedCost = vaultCards
      .filter((vc) => new Date(vc.purchaseDate) <= d)
      .reduce((s, vc) => s + vc.purchasePrice * vc.quantity, 0);
    const purchasedCurrent = vaultCards
      .filter((vc) => new Date(vc.purchaseDate) <= d)
      .reduce((s, vc) => {
        const market = getCardPrice(vc.card);
        const entryCost = vc.purchasePrice * vc.quantity;
        const entryCurrent = market * vc.quantity;
        return s + entryCost + (entryCurrent - entryCost) * t;
      }, 0);
    points.push({
      date: d.toISOString().slice(0, 10),
      price: Math.max(purchasedCurrent || value * (purchasedCost / (totalCost || 1)), 0),
    });
  }

  return points;
}

function exportCostBasisCsv(holdings: HoldingPerf[]) {
  const rows = [
    ['Name', 'Set', 'Qty', 'Cost Basis', 'Current Value', 'P/L', 'P/L %'].join(','),
    ...holdings.map((h) =>
      [
        `"${h.name.replace(/"/g, '""')}"`,
        `"${h.setName.replace(/"/g, '""')}"`,
        h.quantity,
        h.costBasis.toFixed(2),
        h.currentValue.toFixed(2),
        h.profit.toFixed(2),
        h.profitPct.toFixed(2),
      ].join(',')
    ),
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vault-cost-basis-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const VaultPerformanceReport: React.FC<VaultPerformanceReportProps> = ({ vaultCards }) => {
  const [period, setPeriod] = useState<PerformancePeriod>('30d');

  const holdings = useMemo(() => buildHoldings(vaultCards), [vaultCards]);
  const filtered = useMemo(() => {
    const start = periodStart(period);
    if (!start) return holdings;
    return holdings.filter((_, idx) => {
      const purchased = new Date(vaultCards[idx].purchaseDate);
      return purchased >= start || period === 'all';
    });
    // For period filter we still show all holdings' current P/L but chart is period-scoped
  }, [holdings, period, vaultCards]);

  const series = useMemo(() => buildValueSeries(vaultCards, period), [vaultCards, period]);
  const totalCost = holdings.reduce((s, h) => s + h.costBasis, 0);
  const totalCurrent = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalProfit = totalCurrent - totalCost;
  const best = [...holdings].sort((a, b) => b.profitPct - a.profitPct)[0];
  const worst = [...holdings].sort((a, b) => a.profitPct - b.profitPct)[0];

  if (vaultCards.length === 0) return null;

  return (
    <section className="rounded-xl border border-border-default bg-surface-raised p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel className="text-accent/90">Performance</SectionLabel>
          <h2 className="mt-1 text-lg font-semibold text-ink-primary">Portfolio report</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Value vs cost basis · best/worst holdings · CSV for records
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-border-subtle p-0.5">
            {([
              ['7d', '7D'],
              ['30d', '30D'],
              ['ytd', 'YTD'],
              ['all', 'All'],
            ] as [PerformancePeriod, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === key
                    ? 'bg-accent/20 text-accent'
                    : 'text-ink-muted hover:text-ink-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => exportCostBasisCsv(holdings)}
            className="btn-secondary text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Cost basis CSV
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border-subtle bg-surface-inset px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Period value
          </p>
          <p className="text-lg font-bold tabular-nums text-ink-primary">
            {formatCurrency(totalCurrent)}
          </p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface-inset px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Cost basis
          </p>
          <p className="text-lg font-bold tabular-nums text-ink-secondary">
            {formatCurrency(totalCost)}
          </p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface-inset px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">P/L</p>
          <p
            className={`text-lg font-bold tabular-nums ${
              totalProfit >= 0 ? 'text-gain' : 'text-loss'
            }`}
          >
            {totalProfit >= 0 ? '+' : ''}
            {formatCurrency(totalProfit)} (
            {formatPercent(totalCost > 0 ? (totalProfit / totalCost) * 100 : 0, { signed: true })})
          </p>
        </div>
      </div>

      {series.length > 1 && (
        <PriceChart priceHistory={series} title="Estimated portfolio value" variant="dark" height={220} compact />
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {best && (
          <div className="flex items-start gap-2 rounded-lg border border-gain/20 bg-gain/5 px-3 py-2">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-gain" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gain">Best</p>
              <p className="truncate text-sm font-medium text-ink-primary">{best.name}</p>
              <p className="text-xs tabular-nums text-ink-muted">
                {formatPercent(best.profitPct, { signed: true })} · {formatCurrency(best.profit)}
              </p>
            </div>
          </div>
        )}
        {worst && (
          <div className="flex items-start gap-2 rounded-lg border border-loss/20 bg-loss/5 px-3 py-2">
            <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-loss">Worst</p>
              <p className="truncate text-sm font-medium text-ink-primary">{worst.name}</p>
              <p className="text-xs tabular-nums text-ink-muted">
                {formatPercent(worst.profitPct, { signed: true })} · {formatCurrency(worst.profit)}
              </p>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] text-ink-muted">
        Showing {filtered.length} holdings · chart blends cost basis toward current market (
        {period.toUpperCase()}).
      </p>
    </section>
  );
};
