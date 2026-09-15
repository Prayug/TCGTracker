import { useMemo, useState } from 'react';
import { Activity, LayoutGrid } from 'lucide-react';
import { InsightsApiContext } from '../hooks/insightsApiContext';
import { marketInsightsApi } from '../../../services/marketInsightsApi';
import { CardPrediction, PredictionWindow, PREDICTION_WINDOW_LABELS } from '../types';
import { PredictionCardsView } from '../components/PredictionCardsView';
import { PredictionDetailPanel } from '../components/PredictionDetailPanel';
import { CLARITY_DEMO_PREDICTIONS } from '../__fixtures__/clarityDemoPredictions';

/**
 * Local-only demo surface for Market Insights clarity screenshots.
 * Mounted only under import.meta.env.DEV.
 */
export function InsightsClarityDemoPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'return' | 'confidence' | 'price' | 'name' | 'risk'>(
    'return'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [categoryFilter, setCategoryFilter] = useState('strong_buy');
  const [window, setWindow] = useState<PredictionWindow>('90d');
  const [selected, setSelected] = useState<CardPrediction | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'cards'>('cards');

  const filtered = useMemo(() => {
    let list = [...CLARITY_DEMO_PREDICTIONS];
    if (categoryFilter !== 'all') {
      list = list.filter((p) => p.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => p.cardName.toLowerCase().includes(q));
    }
    return list;
  }, [categoryFilter, searchQuery]);

  return (
    <InsightsApiContext.Provider value={marketInsightsApi}>
      <div className="insights-page mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 space-y-1">
          <h1 className="font-display text-h1 text-ink-primary">Market Insights</h1>
          <p className="text-sm text-ink-secondary">
            Forecasts, classifications, and model checks for Pokémon
          </p>
        </div>

        <div className="scroll-rail scroll-rail-tabs mb-4 -mx-1 rounded-xl border border-border-default bg-surface-inset p-1 px-1">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
              activeTab === 'overview'
                ? 'bg-accent/15 text-accent'
                : 'text-ink-muted hover:bg-surface-hover'
            }`}
          >
            <Activity className="h-4 w-4" />
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cards')}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
              activeTab === 'cards'
                ? 'bg-accent/15 text-accent'
                : 'text-ink-muted hover:bg-surface-hover'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Cards
          </button>
        </div>

        {activeTab === 'cards' && (
          <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="min-w-0">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                Forecast window
              </span>
              <p className="text-[11px] text-ink-muted">
                Horizon used for expected return and card ranking
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-border-default bg-surface-inset p-0.5">
              {(['7d', '30d', '90d'] as PredictionWindow[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWindow(w)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium ${
                    window === w
                      ? 'bg-accent/15 text-accent'
                      : 'text-ink-muted hover:bg-surface-hover'
                  }`}
                >
                  {PREDICTION_WINDOW_LABELS[w]}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'overview' ? (
          <p className="rounded-xl border border-dashed border-border-default px-4 py-8 text-center text-sm text-ink-muted">
            Overview charts use live prediction runs. Open Cards for the clarity demo grid.
          </p>
        ) : (
          <PredictionCardsView
            predictions={filtered}
            loading={false}
            error={null}
            window={window}
            cardsById={{}}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            onPredictionsRefresh={() => undefined}
            onViewDetail={setSelected}
          />
        )}

        {selected && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/40"
              aria-label="Close prediction details"
              onClick={() => setSelected(null)}
            />
            <PredictionDetailPanel
              prediction={selected}
              card={undefined}
              window={window}
              onClose={() => setSelected(null)}
            />
          </>
        )}
      </div>
    </InsightsApiContext.Provider>
  );
}

export default InsightsClarityDemoPage;
