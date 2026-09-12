import React, { useMemo } from 'react';
import { VaultStats, VaultCard } from '../../../types/pokemon';
import { NumberTicker } from '@/components/ui/number-ticker';
import { CardSpotlight } from '@/components/ui/card-spotlight';
import { MiniSparkline } from '../../../components/common/MiniSparkline';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { cn } from '@/lib/utils';
import { buildValueSeries, periodChangeExcludingInflows } from '../utils/portfolioSeries';

interface VaultKpiStripProps {
  stats: VaultStats;
  vaultCards: VaultCard[];
  realizedPnl?: number | null;
}

function KpiTile({
  label,
  value,
  hint,
  trend,
  className,
  spark,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
  spark?: React.ReactNode;
}) {
  return (
    <CardSpotlight
      className={cn('rounded-md px-4 py-3.5 sm:px-5 sm:py-4', className)}
      radius={280}
      color="rgba(196, 180, 154, 0.12)"
    >
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </p>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p
          className={cn(
            'font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl',
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
    </CardSpotlight>
  );
}

export const VaultKpiStrip: React.FC<VaultKpiStripProps> = ({ stats, vaultCards, realizedPnl }) => {
  const series30 = useMemo(() => buildValueSeries(vaultCards, '30d'), [vaultCards]);
  const delta30 = useMemo(() => periodChangeExcludingInflows(vaultCards, '30d'), [vaultCards]);
  const sparkData = useMemo(() => series30.map((p) => ({ price: p.price })), [series30]);

  const plTrend = stats.profit > 0 ? 'up' : stats.profit < 0 ? 'down' : 'neutral';
  const d30Trend = delta30.dollar > 0 ? 'up' : delta30.dollar < 0 ? 'down' : 'neutral';
  const sparkColor = delta30.dollar >= 0 ? 'var(--gain)' : 'var(--loss)';
  const showRealized = realizedPnl != null && Number.isFinite(realizedPnl);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile
        label="Portfolio Value"
        value={
          <>
            $
            <NumberTicker value={stats.currentValue} decimalPlaces={2} />
          </>
        }
        spark={
          sparkData.length > 1 ? (
            <MiniSparkline data={sparkData} width={72} height={28} color={sparkColor} />
          ) : null
        }
      />
      <KpiTile
        label="Total P/L"
        trend={plTrend}
        value={
          <>
            {stats.profit >= 0 ? '+' : '−'}$
            <NumberTicker value={Math.abs(stats.profit)} decimalPlaces={2} />
          </>
        }
        hint={
          showRealized ? (
            <span>
              <span className={stats.profit >= 0 ? 'text-gain' : 'text-loss'}>
                {formatPercent(stats.profitPercentage, { signed: true })}
              </span>
              <span className="text-ink-muted"> · Realized </span>
              <span className={realizedPnl! >= 0 ? 'text-gain' : 'text-loss'}>
                {formatCurrency(realizedPnl!, { signed: true })}
              </span>
            </span>
          ) : (
            <span className={stats.profit >= 0 ? 'text-gain' : 'text-loss'}>
              {formatPercent(stats.profitPercentage, { signed: true })}
            </span>
          )
        }
      />
      <KpiTile
        label={
          <span>
            30D Change
            <span className="ml-1.5 font-sans font-normal normal-case tracking-normal text-ink-muted">
              · Estimated
            </span>
          </span>
        }
        trend={d30Trend}
        value={
          <>
            {delta30.dollar >= 0 ? '+' : '−'}$
            <NumberTicker value={Math.abs(delta30.dollar)} decimalPlaces={2} />
          </>
        }
        hint={
          <span>
            <span className={delta30.dollar >= 0 ? 'text-gain' : 'text-loss'}>
              {formatPercent(delta30.percent, { signed: true })}
            </span>
            {delta30.sinceAddedOnly ? <span className="text-ink-muted"> · Since added</span> : null}
          </span>
        }
      />
      <KpiTile
        label="Cost Basis"
        value={
          <>
            $
            <NumberTicker value={stats.totalValue} decimalPlaces={2} />
          </>
        }
        hint={`${stats.uniqueCards} unique · ${stats.totalCards} total`}
      />
    </div>
  );
};
