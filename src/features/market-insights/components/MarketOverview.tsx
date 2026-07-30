import { TrendingUp, TrendingDown, Minus, Brain, Target, BarChart3 } from 'lucide-react';
import { MarketOverview as MarketOverviewType } from '../types';
import { CategoryDonutChart } from './charts/CategoryDonutChart';
import { ConfidenceDistribution } from './charts/ConfidenceDistribution';

interface Props {
  data: MarketOverviewType | null;
  loading: boolean;
  error: string | null;
}

function DirectionIcon({ direction }: { direction: string }) {
  switch (direction) {
    case 'bullish':
      return <TrendingUp className="h-5 w-5 text-emerald-400" />;
    case 'bearish':
      return <TrendingDown className="h-5 w-5 text-red-400" />;
    default:
      return <Minus className="h-5 w-5 text-ink-muted" />;
  }
}

function DirectionLabel({ direction }: { direction: string }) {
  switch (direction) {
    case 'bullish':
      return <span className="text-emerald-400">Bullish</span>;
    case 'bearish':
      return <span className="text-red-400">Bearish</span>;
    default:
      return <span className="text-ink-muted">Neutral</span>;
  }
}

export function MarketOverview({ data, loading, error }: Props) {
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border-default">
        <p className="text-sm text-ink-muted">
          {error || 'No overview data available. Run predictions first.'}
        </p>
      </div>
    );
  }

  const statCards = [
    {
      icon: <Brain className="h-4 w-4 text-violet-400" />,
      label: 'Total Predictions',
      value: data.totalPredictions.toLocaleString(),
    },
    {
      icon: <Target className="h-4 w-4 text-emerald-400" />,
      label: 'Avg Confidence',
      value: `${data.avgConfidence}%`,
    },
    {
      icon: <BarChart3 className="h-4 w-4 text-cyan-400" />,
      label: 'Market Direction',
      value: <DirectionLabel direction={data.marketDirection} />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border-default bg-surface-raised p-4"
          >
            <div className="flex items-center gap-2">
              {card.icon}
              <span className="text-xs text-ink-muted">{card.label}</span>
            </div>
            <div className="mt-2 text-lg font-semibold text-white">{card.value}</div>
          </div>
        ))}
      </div>

      {(data.marketBenchmark30d != null || data.marketBenchmark90d != null) && (
        <p className="text-xs text-ink-muted">
          Realized market benchmark (from prediction history):{' '}
          {data.marketBenchmark30d != null && (
            <span className="font-mono text-ink-secondary">
              30d {data.marketBenchmark30d >= 0 ? '+' : ''}{(data.marketBenchmark30d * 100).toFixed(1)}%
            </span>
          )}
          {data.marketBenchmark30d != null && data.marketBenchmark90d != null && ' · '}
          {data.marketBenchmark90d != null && (
            <span className="font-mono text-ink-secondary">
              90d {data.marketBenchmark90d >= 0 ? '+' : ''}{(data.marketBenchmark90d * 100).toFixed(1)}%
            </span>
          )}
          {' '}— predictions are benchmarked against these.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border-default bg-surface-raised p-4">
          <h3 className="mb-3 text-sm font-medium text-ink-secondary">Category Distribution</h3>
          <CategoryDonutChart data={data.categoryBreakdown} />
        </div>

        <div className="rounded-xl border border-border-default bg-surface-raised p-4">
          <h3 className="mb-3 text-sm font-medium text-ink-secondary">Confidence Distribution</h3>
          <ConfidenceDistribution data={data.confidenceBuckets} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border-default bg-surface-raised p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-emerald-400">
            <TrendingUp className="h-4 w-4" />
            Top Gainers
          </h3>
          {data.topGainers.length === 0 ? (
            <p className="text-sm text-ink-muted">No gainers data</p>
          ) : (
            <div className="space-y-2">
              {data.topGainers.map((card, i) => (
                <div
                  key={card.cardId}
                  className="flex items-center justify-between rounded-lg bg-surface-inset px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-muted">{i + 1}</span>
                    <span className="text-sm text-white">{card.cardName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-muted">${card.currentPrice?.toFixed(2)}</span>
                    <span className="text-xs font-mono text-emerald-400">
                      +{(card.expectedReturn * 100).toFixed(1)}%
                    </span>
                    <span className="text-xs text-ink-muted">{card.confidence}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border-default bg-surface-raised p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-red-400">
            <TrendingDown className="h-4 w-4" />
            Top Losers
          </h3>
          {data.topLosers.length === 0 ? (
            <p className="text-sm text-ink-muted">No losers data</p>
          ) : (
            <div className="space-y-2">
              {data.topLosers.map((card, i) => (
                <div
                  key={card.cardId}
                  className="flex items-center justify-between rounded-lg bg-surface-inset px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-muted">{i + 1}</span>
                    <span className="text-sm text-white">{card.cardName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-muted">${card.currentPrice?.toFixed(2)}</span>
                    <span className="text-xs font-mono text-red-400">
                      {(card.expectedReturn * 100).toFixed(1)}%
                    </span>
                    <span className="text-xs text-ink-muted">{card.confidence}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
