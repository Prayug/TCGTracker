import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Shield,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  Play,
  Target,
  Clock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowDown,
} from 'lucide-react';
import { marketInsightsApi } from '../../../services/marketInsightsApi';
import {
  CardPrediction,
  BacktestResult,
  ForwardTestStatus,
  PredictionCategory,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  PREDICTION_THRESHOLDS,
} from '../types';
import { PokemonCard } from '../../../types/pokemon';
import { PredictionCard } from './PredictionCard';
import { useResolvedPredictionCards } from '../hooks/useResolvedPredictionCards';
import { useAuth } from '../../../hooks/useAuth';
import { useGame } from '../../../contexts/GameContext';
import { Package, Brain } from 'lucide-react';

type SectionType = 'gainers' | 'recovery' | 'momentum' | 'stagnant' | 'overheated' | 'downtrend' | 'backtest' | 'forward';

const SECTION_ICONS: Record<SectionType, React.ReactNode> = {
  gainers: <TrendingUp className="h-4 w-4 text-emerald-400" />,
  recovery: <Activity className="h-4 w-4 text-blue-400" />,
  momentum: <TrendingUp className="h-4 w-4 text-purple-400" />,
  stagnant: <Target className="h-4 w-4 text-ink-muted" />,
  overheated: <AlertTriangle className="h-4 w-4 text-red-400" />,
  downtrend: <ArrowDown className="h-4 w-4 text-orange-400" />,
  backtest: <BarChart3 className="h-4 w-4 text-cyan-400" />,
  forward: <Clock className="h-4 w-4 text-amber-400" />,
};

const SECTION_LABELS: Record<SectionType, string> = {
  gainers: 'Top Predicted Card Gainers',
  recovery: 'Best Card Recovery Plays',
  momentum: 'Momentum Cards',
  stagnant: 'Stagnant / Low Priority',
  overheated: 'Overheated / Manipulation Risk Cards',
  downtrend: 'Downtrend Cards',
  backtest: 'Backtesting Results',
  forward: 'Forward Testing Tracker',
};

const CATEGORY_MAP: Record<SectionType, PredictionCategory | 'all'> = {
  gainers: 'all',
  recovery: 'recovery',
  momentum: 'momentum',
  stagnant: 'stagnant',
  overheated: 'avoid',
  downtrend: 'downtrend',
  backtest: 'all',
  forward: 'all',
};

export function MarketInsightsDashboard() {
  const { isOnePiece } = useGame();
  const { isAdmin } = useAuth();
  const canRunAdminActions = isAdmin || import.meta.env.DEV;
  const [activeSection, setActiveSection] = useState<SectionType>('gainers');
  const [predictions, setPredictions] = useState<CardPrediction[]>([]);
  const [backtestResults, setBacktestResults] = useState<BacktestResult[]>([]);
  const [forwardStatus, setForwardStatus] = useState<ForwardTestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningPrediction, setRunningPrediction] = useState(false);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [backtestDate, setBacktestDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  });
  const [message, setMessage] = useState<string | null>(null);

  const showMessage = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 5000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [predData, btData, ftStatus] = await Promise.all([
        marketInsightsApi.getPredictions({ limit: 250 }),
        marketInsightsApi.getBacktestResults().catch(() => ({ data: [] })),
        marketInsightsApi.getForwardTestStatus().catch(() => null),
      ]);
      setPredictions(predData.data);
      setBacktestResults(btData.data || []);
      setForwardStatus(ftStatus);
    } catch (err) {
      console.error('Failed to load market insights data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunPredictions = async () => {
    if (!canRunAdminActions) {
      showMessage('Admin access required to run predictions.');
      return;
    }
    setRunningPrediction(true);
    try {
      const result = await marketInsightsApi.triggerPredictionRun();
      showMessage(`Prediction run ${result.runId}: ${result.message}`);
      await loadData();
    } catch (err: any) {
      showMessage(`Failed: ${err.message}`);
    } finally {
      setRunningPrediction(false);
    }
  };

  const handleRunBacktest = async () => {
    if (!canRunAdminActions) {
      showMessage('Admin access required to run backtests.');
      return;
    }
    setRunningBacktest(true);
    try {
      await marketInsightsApi.runBacktest({ backtestDate, windowDays: 90 });
      showMessage('Backtest completed');
      const btData = await marketInsightsApi.getBacktestResults();
      setBacktestResults(btData.data || []);
    } catch (err: any) {
      showMessage(`Backtest failed: ${err.message}`);
    } finally {
      setRunningBacktest(false);
    }
  };

  const sidebarSections: SectionType[] = ['gainers', 'recovery', 'momentum', 'stagnant', 'overheated', 'downtrend', 'backtest', 'forward'];

  const filteredPredictions = (category?: PredictionCategory) => {
    if (!category || category === 'all') return predictions;
    return predictions.filter(p => p.category === category);
  };

  const sortedByReturn = [...predictions].sort((a, b) => b.expected90dReturn - a.expected90dReturn);
  const sortedByDowntrend = [...predictions].sort((a, b) => a.expected90dReturn - b.expected90dReturn);
  const { cardsById } = useResolvedPredictionCards(predictions);

  return (
    <div className="mx-auto max-w-7xl">
      {/* One Piece coming soon */}
      {isOnePiece && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-surface-raised p-12 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-border-default bg-surface-inset">
            <Brain className="h-8 w-8 text-ink-muted" aria-hidden="true" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-ink-primary">Coming Soon</h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-ink-muted">
            One Piece market insights and AI predictions are under development. Browse One Piece cards to see market prices!
          </p>
          <a href="/browse" className="btn-secondary">
            <Package className="h-4 w-4" aria-hidden="true" />
            Browse One Piece Cards
          </a>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Card Market Insights</h1>
          <p className="mt-1 text-sm text-ink-muted">
            AI-powered price predictions for individual TCG cards
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            Backtest date:
            <input
              type="date"
              value={backtestDate}
              onChange={e => setBacktestDate(e.target.value)}
              className="rounded-lg border border-border-default bg-surface-inset px-2 py-1 text-xs text-white"
            />
          </label>
          <button
            onClick={handleRunBacktest}
            disabled={runningBacktest || !canRunAdminActions}
            title={
              canRunAdminActions
                ? 'Run backtest for selected date'
                : 'Admin access required'
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-inset px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${runningBacktest ? 'animate-spin' : ''}`} />
            Backtest
          </button>
          <button
            onClick={handleRunPredictions}
            disabled={runningPrediction || !canRunAdminActions}
            title={
              canRunAdminActions
                ? 'Run a new prediction batch'
                : 'Admin access required'
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className={`h-3.5 w-3.5 ${runningPrediction ? 'animate-pulse' : ''}`} />
            {runningPrediction ? 'Running...' : 'Run Predictions'}
          </button>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-inset px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-sm text-accent"
        >
          {message}
        </motion.div>
      )}

      <div className="flex gap-6">
        <nav className="hidden w-48 shrink-0 space-y-1 lg:block">
          {sidebarSections.map(section => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                activeSection === section
                  ? 'bg-surface-hover text-white'
                  : 'text-ink-muted hover:bg-surface-inset hover:text-ink-secondary'
              }`}
            >
              {SECTION_ICONS[section]}
              {SECTION_LABELS[section]}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {activeSection === 'backtest' ? (
                <BacktestSection results={backtestResults} onRunBacktest={handleRunBacktest} />
              ) : activeSection === 'forward' ? (
                <ForwardSection status={forwardStatus} />
              ) : activeSection === 'gainers' ? (
                <CardGridSection
                  title={SECTION_LABELS[activeSection]}
                  icon={SECTION_ICONS[activeSection]}
                  predictions={sortedByReturn.filter(p => p.expected90dReturn >= PREDICTION_THRESHOLDS.GAINERS_MIN_RETURN).slice(0, 20)}
                  emptyMessage="No cards match this category yet. Run predictions to see results."
                  cardsById={cardsById}
                />
              ) : activeSection === 'downtrend' ? (
                <CardGridSection
                  title={SECTION_LABELS[activeSection]}
                  icon={SECTION_ICONS[activeSection]}
                  predictions={sortedByDowntrend.filter(p => p.expected90dReturn < PREDICTION_THRESHOLDS.DOWNTREND_MAX_RETURN).slice(0, 20)}
                  emptyMessage="No cards in downtrend. Run predictions to see results."
                  cardsById={cardsById}
                />
              ) : (
                <CardGridSection
                  title={SECTION_LABELS[activeSection]}
                  icon={SECTION_ICONS[activeSection]}
                  predictions={filteredPredictions(CATEGORY_MAP[activeSection] as PredictionCategory)}
                  emptyMessage="No cards match this category yet. Run predictions to see results."
                  cardsById={cardsById}
                />
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function CardGridSection({
  title,
  icon,
  predictions,
  emptyMessage,
  cardsById,
}: {
  title: string;
  icon: React.ReactNode;
  predictions: CardPrediction[];
  emptyMessage: string;
  cardsById: Record<string, PokemonCard>;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-ink-muted">
          {predictions.length}
        </span>
      </div>
      {predictions.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border-default">
          <p className="text-sm text-ink-muted">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {predictions.map((p) => (
            <PredictionCard
              key={p.id}
              prediction={p}
              card={cardsById[p.cardId]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BacktestSection({
  results,
  onRunBacktest,
}: {
  results: BacktestResult[];
  onRunBacktest: () => void;
}) {
  const latest = results[0];

  if (!latest && results.length === 0) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Backtesting Results</h2>
        </div>
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border-default">
          <p className="text-sm text-ink-muted">
            No backtest results yet. Run a backtest to see historical accuracy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-cyan-400" />
        <h2 className="text-lg font-semibold text-white">Backtesting Results</h2>
      </div>

      {latest && (
        <div className="mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard label="Test Date" value={latest.backtest_date} />
            <MetricCard label="Cards Tested" value={latest.cards_tested.toString()} />
            <MetricCard
              label="Directional Accuracy"
              value={latest.directional_accuracy != null ? `${(latest.directional_accuracy * 100).toFixed(1)}%` : 'N/A'}
              positive={latest.directional_accuracy != null && latest.directional_accuracy > 0.5}
            />
            <MetricCard
              label="MAPE"
              value={latest.mape != null ? `${(latest.mape * 100).toFixed(1)}%` : 'N/A'}
              positive={latest.mape != null && latest.mape < 0.2}
            />
            <MetricCard
              label="Top 10 Gainers Avg"
              value={latest.top10_avg_return != null ? `${(latest.top10_avg_return * 100).toFixed(1)}%` : 'N/A'}
              positive={latest.top10_avg_return != null && latest.top10_avg_return > 0}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <MetricCard
              label="Market Avg Return"
              value={latest.market_avg_return != null ? `${(latest.market_avg_return * 100).toFixed(1)}%` : 'N/A'}
              positive={latest.market_avg_return != null && latest.market_avg_return > 0}
            />
            <MetricCard
              label="Strong Buy FP Rate"
              value={latest.strong_buy_false_positive_rate != null ? `${(latest.strong_buy_false_positive_rate * 100).toFixed(1)}%` : 'N/A'}
              positive={latest.strong_buy_false_positive_rate != null && latest.strong_buy_false_positive_rate < 0.2}
            />
            <MetricCard
              label="Avoid Avg Return"
              value={latest.avoid_avg_return != null ? `${(latest.avoid_avg_return * 100).toFixed(1)}%` : 'N/A'}
              positive={latest.avoid_avg_return != null && latest.avoid_avg_return < 0}
            />
            <MetricCard label="Window" value={`${latest.window_days}d`} />
          </div>

          {latest.category_performance && latest.category_performance.length > 0 && (
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
                    {latest.category_performance.map((cp: any) => (
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
                <span className="text-ink-muted">{r.backtest_date}</span>
                <span className="text-ink-secondary">{r.cards_tested} cards</span>
                <span className={r.directional_accuracy != null && r.directional_accuracy >= 0.5 ? 'text-emerald-400' : 'text-red-400'}>
                  Acc: {r.directional_accuracy != null ? `${(r.directional_accuracy * 100).toFixed(1)}%` : 'N/A'}
                </span>
                <span className="text-ink-muted">MAPE: {r.mape != null ? `${(r.mape * 100).toFixed(1)}%` : 'N/A'}</span>
                <span className={r.market_avg_return != null && r.market_avg_return >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  Avg: {r.market_avg_return != null ? `${(r.market_avg_return * 100).toFixed(1)}%` : 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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

function ForwardSection({ status }: { status: ForwardTestStatus | null }) {
  if (!status) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-white">Forward Testing Tracker</h2>
        </div>
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border-default">
          <p className="text-sm text-ink-muted">No forward test data available yet.</p>
        </div>
      </div>
    );
  }

  const totalResolved = status.hit + status.missed + status.partiallyCorrect;
  const accuracy = totalResolved > 0 ? (status.hit + status.partiallyCorrect * 0.5) / totalResolved : 0;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-5 w-5 text-amber-400" />
        <h2 className="text-lg font-semibold text-white">Forward Testing Tracker</h2>
        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-ink-muted">
          {status.totalPredictions} predictions
        </span>
      </div>

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
          value={`${(accuracy * 100).toFixed(1)}%`}
          positive={accuracy > 0.5}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-default">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border-default bg-surface-inset">
              <th className="px-3 py-2 font-medium text-ink-muted">Window</th>
              <th className="px-3 py-2 font-medium text-ink-muted">Pending</th>
              <th className="px-3 py-2 font-medium text-ink-muted">Hit</th>
              <th className="px-3 py-2 font-medium text-ink-muted">Missed</th>
              <th className="px-3 py-2 font-medium text-ink-muted">Directional Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: '7-Day', data: status.byWindow._7d },
              { label: '30-Day', data: status.byWindow._30d },
              { label: '90-Day', data: status.byWindow._90d },
            ].map(({ label, data }) => (
              <tr key={label} className="border-b border-border-subtle last:border-0">
                <td className="px-3 py-2 font-medium text-ink-secondary">{label}</td>
                <td className="px-3 py-2 text-ink-muted">{data.pending}</td>
                <td className="px-3 py-2 text-emerald-400">{data.hit}</td>
                <td className="px-3 py-2 text-red-400">{data.missed}</td>
                <td className={`px-3 py-2 font-mono ${data.accuracy != null && data.accuracy > 0.5 ? 'text-emerald-400' : 'text-ink-muted'}`}>
                  {data.accuracy != null ? `${(data.accuracy * 100).toFixed(1)}%` : 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default MarketInsightsDashboard;
