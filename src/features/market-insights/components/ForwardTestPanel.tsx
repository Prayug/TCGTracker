import { Clock, CheckCircle2, XCircle, HelpCircle, RefreshCw } from 'lucide-react';
import { ForwardTestStatus, PredictionCategory, CATEGORY_LABELS, CATEGORY_COLORS } from '../types';

interface Props {
  status: ForwardTestStatus | null;
  onRefresh?: () => void;
  refreshing?: boolean;
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

export function ForwardTestPanel({ status, onRefresh, refreshing = false }: Props) {
  if (!status) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">Forward Testing Tracker</h2>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs text-ink-secondary transition hover:bg-surface-hover disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh outcomes
            </button>
          )}
        </div>
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border-default">
          <p className="text-sm text-ink-muted">No forward test data available yet.</p>
        </div>
      </div>
    );
  }

  const totalResolved = status.hit + status.missed + status.partiallyCorrect;
  const accuracy = status.overallAccuracy ?? (totalResolved > 0 ? (status.hit + status.partiallyCorrect * 0.5) / totalResolved : 0);
  const awaitingMaturity =
    status.totalPredictions > 0 &&
    totalResolved === 0 &&
    (status.matureEnoughFor7d ?? 0) === 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Clock className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-white">Forward Testing Tracker</h2>
          <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-ink-muted">
            {status.totalPredictions} predictions · last 180d
          </span>
          {status.latestRunId != null && (
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-ink-muted">
              Latest run #{status.latestRunId}
              {status.latestRunDate ? ` · ${status.latestRunDate}` : ''}
            </span>
          )}
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-3 py-1.5 text-xs text-ink-secondary transition hover:bg-surface-hover disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh outcomes
          </button>
        )}
      </div>

      {awaitingMaturity && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Predictions need at least 7 days before 7d outcomes can score. Longer windows unlock at 30 / 90 / 180 / 365 days.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border-default bg-surface-raised p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-ink-muted">Pending</span>
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-amber-400">{status.pending}</div>
        </div>
        <div className="rounded-xl border border-border-default bg-surface-raised p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-ink-muted">Hit</span>
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-emerald-400">{status.hit}</div>
        </div>
        <div className="rounded-xl border border-border-default bg-surface-raised p-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-ink-muted" />
            <span className="text-xs text-ink-muted">Partial</span>
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-ink-secondary">{status.partiallyCorrect}</div>
        </div>
        <div className="rounded-xl border border-border-default bg-surface-raised p-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-400" />
            <span className="text-xs text-ink-muted">Missed</span>
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-red-400">{status.missed}</div>
        </div>
      </div>

      <div className="mb-4">
        <MetricCard
          label="Overall Accuracy"
          value={totalResolved > 0 ? `${(accuracy * 100).toFixed(1)}%` : 'N/A'}
          positive={totalResolved > 0 ? accuracy > 0.5 : undefined}
        />
      </div>

      <div className="mb-6 overflow-x-auto rounded-xl border border-border-default">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border-default bg-surface-inset">
              <th className="px-3 py-2 font-medium text-ink-muted">Window</th>
              <th className="px-3 py-2 font-medium text-ink-muted">Pending</th>
              <th className="px-3 py-2 font-medium text-ink-muted">Dir. Hit</th>
              <th className="px-3 py-2 font-medium text-ink-muted">Dir. Miss</th>
              <th className="px-3 py-2 font-medium text-ink-muted">Directional Accuracy</th>
              <th className="px-3 py-2 font-medium text-ink-muted">Rank IC</th>
              <th className="px-3 py-2 font-medium text-ink-muted">Mean Bias</th>
              <th className="px-3 py-2 font-medium text-ink-muted">Hit Rate</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: '7-Day', data: status.byWindow._7d },
              { label: '30-Day', data: status.byWindow._30d },
              { label: '90-Day', data: status.byWindow._90d },
              ...(status.byWindow._180d ? [{ label: '6-Month', data: status.byWindow._180d }] : []),
              ...(status.byWindow._365d ? [{ label: '1-Year', data: status.byWindow._365d }] : []),
            ].map(({ label, data }) => (
              <tr key={label} className="border-b border-border-subtle last:border-0">
                <td className="px-3 py-2 font-medium text-ink-secondary">{label}</td>
                <td className="px-3 py-2 text-ink-muted">{data.pending}</td>
                <td className="px-3 py-2 text-emerald-400">{data.hit}</td>
                <td className="px-3 py-2 text-red-400">{data.missed}</td>
                <td className={`px-3 py-2 font-mono ${data.accuracy != null && data.accuracy > 0.5 ? 'text-emerald-400' : 'text-ink-muted'}`}>
                  {data.accuracy != null ? `${(data.accuracy * 100).toFixed(1)}%` : 'N/A'}
                </td>
                <td className={`px-3 py-2 font-mono ${data.rankIC != null && data.rankIC > 0 ? 'text-emerald-400' : data.rankIC != null ? 'text-red-400' : 'text-ink-muted'}`}>
                  {data.rankIC != null ? data.rankIC.toFixed(2) : 'N/A'}
                </td>
                <td className={`px-3 py-2 font-mono ${data.meanBias != null && Math.abs(data.meanBias) < 0.02 ? 'text-emerald-400' : data.meanBias != null ? 'text-amber-400' : 'text-ink-muted'}`}>
                  {data.meanBias != null ? `${data.meanBias >= 0 ? '+' : ''}${(data.meanBias * 100).toFixed(1)}%` : 'N/A'}
                </td>
                <td className={`px-3 py-2 font-mono ${data.hitRate != null && data.hitRate > 0.5 ? 'text-emerald-400' : data.hitRate != null ? 'text-red-400' : 'text-ink-muted'}`}>
                  {data.hitRate != null ? `${(data.hitRate * 100).toFixed(1)}%` : 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-border-default bg-surface-inset px-3 py-2 text-[10px] leading-relaxed text-ink-muted">
          Rank IC measures how well predicted order matches realized order (Spearman). Mean Bias is median predicted − actual; negative means the model is now conservative. Hit Rate = direction correct AND error &lt; 50% of the actual move.
        </div>
      </div>

      {status.byCategory && status.byCategory.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-ink-secondary">Accuracy by Category</h3>
          <div className="overflow-x-auto rounded-xl border border-border-default">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border-default bg-surface-inset">
                  <th className="px-3 py-2 font-medium text-ink-muted">Category</th>
                  <th className="px-3 py-2 font-medium text-ink-muted">Total</th>
                  <th className="px-3 py-2 font-medium text-ink-muted">Hit</th>
                  <th className="px-3 py-2 font-medium text-ink-muted">Missed</th>
                  <th className="px-3 py-2 font-medium text-ink-muted">Accuracy</th>
                  <th className="px-3 py-2 font-medium text-ink-muted">Avg Error</th>
                </tr>
              </thead>
              <tbody>
                {status.byCategory.map((cat) => (
                  <tr key={cat.category} className="border-b border-border-subtle last:border-0">
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[cat.category as PredictionCategory] || ''}`}>
                        {CATEGORY_LABELS[cat.category as PredictionCategory] || cat.category}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{cat.total}</td>
                    <td className="px-3 py-2 text-emerald-400">{cat.hit}</td>
                    <td className="px-3 py-2 text-red-400">{cat.missed}</td>
                    <td className={`px-3 py-2 font-mono ${cat.accuracy != null && cat.accuracy > 0.5 ? 'text-emerald-400' : 'text-ink-muted'}`}>
                      {cat.accuracy != null ? `${(cat.accuracy * 100).toFixed(1)}%` : 'N/A'}
                    </td>
                    <td className="px-3 py-2 font-mono text-ink-muted">
                      {cat.avgError != null ? `${(cat.avgError * 100).toFixed(1)}%` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {status.byPriceRange && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink-secondary">Accuracy by Price Range</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border-default bg-surface-raised p-3">
              <div className="text-xs text-ink-muted">Under $5</div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">
                {status.byPriceRange.under5.accuracy != null ? `${(status.byPriceRange.under5.accuracy * 100).toFixed(1)}%` : 'N/A'}
              </div>
              <div className="text-xs text-ink-muted">{status.byPriceRange.under5.total} cards</div>
            </div>
            <div className="rounded-xl border border-border-default bg-surface-raised p-3">
              <div className="text-xs text-ink-muted">$5 - $50</div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">
                {status.byPriceRange.fiveToFifty.accuracy != null ? `${(status.byPriceRange.fiveToFifty.accuracy * 100).toFixed(1)}%` : 'N/A'}
              </div>
              <div className="text-xs text-ink-muted">{status.byPriceRange.fiveToFifty.total} cards</div>
            </div>
            <div className="rounded-xl border border-border-default bg-surface-raised p-3">
              <div className="text-xs text-ink-muted">Over $50</div>
              <div className="mt-1 font-mono text-lg font-semibold text-white">
                {status.byPriceRange.overFifty.accuracy != null ? `${(status.byPriceRange.overFifty.accuracy * 100).toFixed(1)}%` : 'N/A'}
              </div>
              <div className="text-xs text-ink-muted">{status.byPriceRange.overFifty.total} cards</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
