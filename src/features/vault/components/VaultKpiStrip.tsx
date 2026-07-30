import React, { useMemo } from 'react';
import { VaultStats, VaultCard } from '../../../types/pokemon';
import { CountUp } from '../../../components/common/CountUp';
import { MiniSparkline } from '../../../components/common/MiniSparkline';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { cn } from '@/lib/utils';
import { buildValueSeries, seriesDelta } from '../utils/portfolioSeries';

interface VaultKpiStripProps {
  stats: VaultStats;
  vaultCards: VaultCard[];
}

function KpiTile({
  label,
  value,
  hint,
  trend,
  className,
  spark,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
  spark?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border-subtle bg-surface-raised px-4 py-3.5 sm:px-5 sm:py-4',
        className
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p
          className={cn(
            'text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl',
            trend === 'up' && 'text-gain',
            trend === 'down' && 'text-loss',
            (!trend || trend === 'neutral') && 'text-ink-primary'
          )}
        >
          {value}
        </p>
        {spark}
      </div>
      {hint ? <div className="mt-1.5 text-xs tabular-nums text-ink-muted">{hint}</div> : null}
    </div>
  );
}

export const VaultKpiStrip: React.FC<VaultKpiStripProps> = ({ stats, vaultCards }) => {
  const series30 = useMemo(() => buildValueSeries(vaultCards, '30d'), [vaultCards]);
  const delta30 = useMemo(() => seriesDelta(series30), [series30]);
  const sparkData = useMemo(
    () => series30.map((p) => ({ price: p.price })),
    [series30]
  );

  const plTrend = stats.profit > 0 ? 'up' : stats.profit < 0 ? 'down' : 'neutral';
  const d30Trend = delta30.dollar > 0 ? 'up' : delta30.dollar < 0 ? 'down' : 'neutral';
  const sparkColor =
    delta30.dollar >= 0 ? 'var(--gain)' : 'var(--loss)';

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
      <KpiTile
        className="sm:col-span-2 lg:col-span-5"
        label="Portfolio Value"
        value={<CountUp end={stats.currentValue} prefix="$" decimals={2} />}
        hint={
          <span className={cn(stats.profit >= 0 ? 'text-gain' : 'text-loss')}>
            {formatCurrency(stats.profit, { signed: true })} ·{' '}
            {formatPercent(stats.profitPercentage, { signed: true })} all time
          </span>
        }
        spark={
          sparkData.length > 1 ? (
            <MiniSparkline data={sparkData} width={96} height={32} color={sparkColor} />
          ) : null
        }
      />
      <KpiTile
        className="lg:col-span-2 sm:col-span-1"
        label="Cost Basis"
        value={
          <span className="text-xl sm:text-2xl">
            <CountUp end={stats.totalValue} prefix="$" decimals={2} />
          </span>
        }
        hint={`${stats.uniqueCards} unique · ${stats.totalCards} total`}
      />
      <KpiTile
        className="lg:col-span-2"
        label="Total P/L"
        trend={plTrend}
        value={
          <span className="text-xl sm:text-2xl">
            {stats.profit >= 0 ? '+' : '−'}
            <CountUp end={Math.abs(stats.profit)} prefix="$" decimals={2} />
          </span>
        }
        hint={
          <span className={stats.profit >= 0 ? 'text-gain' : 'text-loss'}>
            {formatPercent(stats.profitPercentage, { signed: true })}
          </span>
        }
      />
      <KpiTile
        className="lg:col-span-3"
        label="30D Change"
        trend={d30Trend}
        value={
          <span className="text-xl sm:text-2xl">
            {delta30.dollar >= 0 ? '+' : '−'}
            <CountUp end={Math.abs(delta30.dollar)} prefix="$" decimals={2} />
          </span>
        }
        hint={
          <span>
            <span className={delta30.dollar >= 0 ? 'text-gain' : 'text-loss'}>
              {formatPercent(delta30.percent, { signed: true })}
            </span>
            <span className="text-ink-muted"> · Estimated</span>
          </span>
        }
      />
    </div>
  );
};
