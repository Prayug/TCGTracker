import { BarChart3, RotateCcw } from 'lucide-react';
import { BacktestResult, PredictionCategory, CATEGORY_LABELS, CATEGORY_COLORS } from '../types';

interface Props {
  results: BacktestResult[];
  backtestDate: string;
  onBacktestDateChange: (date: string) => void;
  onRunBacktest: () => void;
  runningBacktest: boolean;
}

function MetricCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-xl border border-border-default bg-surface-raised p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold ${positive === true ? 'text-emerald-400' : positive === false ? 'text-red-400' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );
}

export function BacktestPanel({ results, backtestDate, onBacktestDateChange, onRunBacktest, runningBacktest }: Props) {
  const latest = results[0];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Backtesting Results</h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            As-of date:
            <input
              type="date"
              value={backtestDate}
              onChange={e => onBacktestDateChange(e.target.value)}
              className="rounded-lg border border-border-default bg-surface-inset px-2 py-1 text-xs text-white"
            />
          </label>
          <button
            onClick={onRunBacktest}
            disabled={runningBacktest}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-inset px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${runningBacktest ? 'animate-spin' : ''}`} />
            {runningBacktest ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border-default">
          <p className="text-sm text-ink-muted">
            No backtest results yet. Pick a historical date and run a backtest.
          </p>
        </div>
      ) : (
        <>
          {latest && (
            <div className="mb-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <MetricCard label="Test Date" value={latest.backtestDate} />
                <MetricCard label="Cards Tested" value={latest.cardsTested.toString()} />
                <MetricCard
                  label="Directional Accuracy"
                  value={latest.directionalAccuracy != null ? `${(latest.directionalAccuracy * 100).toFixed(1)}%` : 'N/A'}
                  positive={latest.directionalAccuracy != null && latest.directionalAccuracy > 0.5}
                />
                <MetricCard
                  label="MAPE"
                  value={latest.mape != null ? `${(latest.mape * 100).toFixed(1)}%` : 'N/A'}
                  positive={latest.mape != null && latest.mape < 0.2}
                />
                <MetricCard
                  label="Top 10 Gainers Avg"
                  value={latest.top10AvgReturn != null ? `${(latest.top10AvgReturn * 100).toFixed(1)}%` : 'N/A'}
                  positive={latest.top10AvgReturn != null && latest.top10AvgReturn > 0}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <MetricCard
                  label="Market Avg Return"
                  value={latest.marketAvgReturn != null ? `${(latest.marketAvgReturn * 100).toFixed(1)}%` : 'N/A'}
                  positive={latest.marketAvgReturn != null && latest.marketAvgReturn > 0}
                />
                <MetricCard
                  label="Strong Buy FP Rate"
                  value={latest.strongBuyFalsePositiveRate != null ? `${(latest.strongBuyFalsePositiveRate * 100).toFixed(1)}%` : 'N/A'}
                  positive={latest.strongBuyFalsePositiveRate != null && latest.strongBuyFalsePositiveRate < 0.2}
                />
                <MetricCard
                  label="Avoid Avg Return"
                  value={latest.avoidAvgReturn != null ? `${(latest.avoidAvgReturn * 100).toFixed(1)}%` : 'N/A'}
                  positive={latest.avoidAvgReturn != null && latest.avoidAvgReturn < 0}
                />
                <MetricCard
                  label="Sharpe Ratio"
                  value={latest.sharpeRatio != null ? latest.sharpeRatio.toFixed(2) : 'N/A'}
                  positive={latest.sharpeRatio != null && latest.sharpeRatio > 1}
                />
                <MetricCard
                  label="Max Drawdown"
                  value={latest.maxDrawdown != null ? `${(latest.maxDrawdown * 100).toFixed(1)}%` : 'N/A'}
                  positive={latest.maxDrawdown != null && latest.maxDrawdown < 0.2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <MetricCard
                  label="Win Rate"
                  value={latest.winRate != null ? `${(latest.winRate * 100).toFixed(1)}%` : 'N/A'}
                  positive={latest.winRate != null && latest.winRate > 0.5}
                />
                <MetricCard
                  label="Profit Factor"
                  value={latest.profitFactor != null ? latest.profitFactor.toFixed(2) : 'N/A'}
                  positive={latest.profitFactor != null && latest.profitFactor > 1}
                />
                <MetricCard
                  label="Rank IC"
                  value={latest.rankIC != null ? latest.rankIC.toFixed(2) : 'N/A'}
                  positive={latest.rankIC != null && latest.rankIC > 0}
                />
                <MetricCard
                  label="Mean Bias"
                  value={latest.meanBias != null ? `${latest.meanBias >= 0 ? '+' : ''}${(latest.meanBias * 100).toFixed(1)}%` : 'N/A'}
                  positive={latest.meanBias != null && Math.abs(latest.meanBias) < 0.02}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <MetricCard
                  label="Hit Rate (skill)"
                  value={latest.hitRate != null ? `${(latest.hitRate * 100).toFixed(1)}%` : 'N/A'}
                  positive={latest.hitRate != null && latest.hitRate > 0.5}
                />
                <MetricCard
                  label="Baseline Avg Return"
                  value={latest.baselineAvgReturn != null ? `${(latest.baselineAvgReturn * 100).toFixed(1)}%` : 'N/A'}
                  positive={latest.baselineAvgReturn != null && latest.baselineAvgReturn > 0}
                />
                <MetricCard
                  label="Model Alpha (top10-baseline)"
                  value={latest.modelAlpha != null ? `${latest.modelAlpha >= 0 ? '+' : ''}${(latest.modelAlpha * 100).toFixed(1)}%` : 'N/A'}
                  positive={latest.modelAlpha != null && latest.modelAlpha > 0}
                />
                <MetricCard label="Window" value={`${latest.windowDays}d`} />
              </div>

              {latest.categoryPerformance && latest.categoryPerformance.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium text-ink-secondary">Category Performance</h3>
                  <div className="overflow-x-auto rounded-xl border border-border-default">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border-default bg-surface-inset">
                          <th className="px-3 py-2 font-medium text-ink-muted">Category</th>
                          <th className="px-3 py-2 font-medium text-ink-muted">Count</th>
                          <th className="px-3 py-2 font-medium text-ink-muted">Avg Return</th>
                          <th className="px-3 py-2 font-medium text-ink-muted">Avg Predicted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latest.categoryPerformance.map((cp: any) => (
                          <tr key={cp.category} className="border-b border-border-subtle last:border-0">
                            <td className="px-3 py-2">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[cp.category as PredictionCategory] || ''}`}>
                                {CATEGORY_LABELS[cp.category as PredictionCategory] || cp.category}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-ink-secondary">{cp.count}</td>
                            <td className={`px-3 py-2 font-mono ${cp.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {(cp.avgReturn * 100).toFixed(1)}%
                            </td>
                            <td className="px-3 py-2 font-mono text-ink-muted">
                              {(cp.avgPredictedReturn * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {results.length > 1 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-ink-secondary">Previous Backtest Runs</h3>
              <div className="space-y-2">
                {results.slice(1, 6).map(r => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-inset px-3 py-2 text-xs">
                    <span className="text-ink-muted">{r.backtestDate}</span>
                    <span className="text-ink-secondary">{r.cardsTested} cards</span>
                    <span className={r.directionalAccuracy != null && r.directionalAccuracy >= 0.5 ? 'text-emerald-400' : 'text-red-400'}>
                      Acc: {r.directionalAccuracy != null ? `${(r.directionalAccuracy * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                    <span className="text-ink-muted">MAPE: {r.mape != null ? `${(r.mape * 100).toFixed(1)}%` : 'N/A'}</span>
                    <span className={r.marketAvgReturn != null && r.marketAvgReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      Avg: {r.marketAvgReturn != null ? `${(r.marketAvgReturn * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
