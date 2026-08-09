import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw, Play, Filter, ChevronDown, ChevronUp,
  BarChart3, LayoutGrid, Clock, Activity, HeartPulse,
} from 'lucide-react';
import {
  CardPrediction,
  PREDICTION_WINDOWS,
  PREDICTION_WINDOW_LABELS,
  PredictionFilters,
  AVAILABLE_RARITIES,
  AVAILABLE_OP_RARITIES,
  AVAILABLE_ERAS,
} from '../types';
import { useMarketInsights } from '../hooks/useMarketInsights';
import { useResolvedPredictionCards } from '../hooks/useResolvedPredictionCards';
import { MarketOverview } from './MarketOverview';
import { PredictionCardsView } from './PredictionCardsView';
import { PredictionDetailPanel } from './PredictionDetailPanel';
import { BacktestPanel } from './BacktestPanel';
import { ForwardTestPanel } from './ForwardTestPanel';
import { ModelHealthPanel } from './ModelHealthPanel';

const TABS = [
  { id: 'overview' as const, label: 'Overview', icon: <Activity className="h-4 w-4" /> },
  { id: 'cards' as const, label: 'Cards', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'backtest' as const, label: 'Backtest', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'forward' as const, label: 'Forward Test', icon: <Clock className="h-4 w-4" /> },
  { id: 'health' as const, label: 'Model health', icon: <HeartPulse className="h-4 w-4" /> },
];

export function MarketInsightsPage() {
  const {
    activeTab, setActiveTab,
    predictions, predictionsLoading, predictionsError,
    overview, overviewLoading, overviewError,
    backtestResults, forwardStatus,
    calibration, dataQuality, healthLoading, healthError, loadModelHealth,
    horizonSupport, windowExperimental, windowStatus,
    runningPrediction, runningBacktest, refreshingForward,
    predictionWindow, setPredictionWindow,
    filters, searchQuery, setSearchQuery,
    sortBy, setSortBy, sortOrder, setSortOrder,
    categoryFilter, setCategoryFilter,
    backtestDate, setBacktestDate,
    message,
    handleApplyFilters, handleResetFilters,
    handleRunPredictions, handleRunBacktest, handleRefreshForwardTest,
    loadPredictions, loadOverview,
    DEFAULT_FILTERS,
    isOnePiece,
  } = useMarketInsights();

  const rarityOptions = isOnePiece ? AVAILABLE_OP_RARITIES : AVAILABLE_RARITIES;

  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState<PredictionFilters>(filters);
  const [selectedPrediction, setSelectedPrediction] = useState<CardPrediction | null>(null);

  const { cardsById } = useResolvedPredictionCards(predictions);

  useEffect(() => {
    setDraftFilters(filters);
  }, [filters]);

  const handleApplyFilterClick = () => {
    handleApplyFilters(draftFilters);
    setShowFilters(false);
  };

  const hasActiveFilters =
    filters.minPrice !== DEFAULT_FILTERS.minPrice ||
    filters.maxPrice !== DEFAULT_FILTERS.maxPrice ||
    filters.minConfidence !== DEFAULT_FILTERS.minConfidence ||
    (filters.rarities && filters.rarities.length !== (DEFAULT_FILTERS.rarities?.length ?? 0)) ||
    (!isOnePiece && filters.eras && filters.eras.length !== (DEFAULT_FILTERS.eras?.length ?? 0));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-foil">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow-accent" aria-hidden />
            Market
          </p>
          <h1 className="font-display text-h1 text-ink-primary">Market Insights</h1>
          <p className="text-sm text-ink-secondary sm:text-base">
            AI-powered price predictions and market analysis
            {isOnePiece ? ' for One Piece' : ' for Pokémon'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunPredictions}
            disabled={runningPrediction}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className={`h-3.5 w-3.5 ${runningPrediction ? 'animate-pulse' : ''}`} />
            {runningPrediction ? 'Running...' : 'Run Predictions'}
          </button>
          <button
            onClick={() => {
              loadPredictions();
              loadOverview();
            }}
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

      {isOnePiece && !predictionsLoading && predictions.length === 0 && !predictionsError && (
        <div className="mb-4 rounded-lg border border-border-default bg-surface-raised px-4 py-3 text-sm text-ink-secondary">
          No One Piece predictions yet. Run Predictions to score cards with enough price history.
        </div>
      )}

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-muted">Prediction window:</span>
          <div className="inline-flex rounded-lg border border-border-default bg-surface-inset p-0.5">
            {PREDICTION_WINDOWS.map(w => {
              const status = windowStatus(w);
              const unsupported = status === 'unsupported';
              const experimental = status === 'experimental';
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setPredictionWindow(w)}
                  disabled={unsupported}
                  title={
                    unsupported
                      ? 'Unsupported — not enough price history for this horizon'
                      : experimental
                        ? 'Experimental — limited history; treat estimates cautiously'
                        : undefined
                  }
                  className={`relative cursor-pointer rounded-lg px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    unsupported
                      ? 'opacity-35 text-ink-muted'
                      : predictionWindow === w
                        ? 'bg-accent/15 text-accent'
                        : 'text-ink-muted hover:bg-surface-hover hover:text-ink-secondary'
                  }`}
                >
                  {PREDICTION_WINDOW_LABELS[w]}
                  {experimental && (
                    <span className="ml-1 rounded bg-amber-500/20 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                      exp
                    </span>
                  )}
                  {unsupported && (
                    <span className="ml-1 rounded bg-surface-hover px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
                      n/a
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {windowExperimental && (
            <span className="text-[11px] text-amber-300/90" title="Experimental horizon">
              Active window is experimental
              {horizonSupport ? ` · ${horizonSupport.historyDays}d history` : ''}
            </span>
          )}
        </div>

        <div className="rounded-xl border border-border-default bg-surface-raised">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-ink-secondary hover:bg-surface-hover"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-primary-foreground">
                  !
                </span>
              )}
              <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-ink-muted">
                ${filters.minPrice || 0} - ${filters.maxPrice || '∞'} | {filters.rarities?.length || 0} rarities
              </span>
            </div>
            {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showFilters && (
            <div className="border-t border-border-default px-4 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Min Price ($)</label>
                  <input
                    type="number" min="0" step="0.5"
                    value={draftFilters.minPrice || ''}
                    onChange={e => setDraftFilters(prev => ({ ...prev, minPrice: e.target.value ? parseFloat(e.target.value) : undefined }))}
                    className="w-full rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-sm text-ink-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Max Price ($)</label>
                  <input
                    type="number" min="0" step="10"
                    value={draftFilters.maxPrice || ''}
                    onChange={e => setDraftFilters(prev => ({ ...prev, maxPrice: e.target.value ? parseFloat(e.target.value) : undefined }))}
                    className="w-full rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-sm text-ink-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Min Confidence</label>
                  <input
                    type="range" min="0" max="100"
                    value={draftFilters.minConfidence || 0}
                    onChange={e => setDraftFilters(prev => ({ ...prev, minConfidence: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="text-xs text-ink-muted">{draftFilters.minConfidence || 0}%</div>
                </div>
                {!isOnePiece && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-muted">Era</label>
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-border-default bg-surface-inset p-2">
                      {AVAILABLE_ERAS.map(era => (
                        <label key={era.id} className="flex items-center gap-2 py-1">
                          <input
                            type="checkbox"
                            checked={draftFilters.eras?.includes(era.id) || false}
                            onChange={e => {
                              setDraftFilters(prev => {
                                const current = prev.eras || [];
                                const newEras = e.target.checked
                                  ? [...current, era.id]
                                  : current.filter(r => r !== era.id);
                                return { ...prev, eras: newEras };
                              });
                            }}
                            className="h-3 w-3 rounded"
                          />
                          <span className="text-xs text-ink-secondary">{era.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Rarities</label>
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-border-default bg-surface-inset p-2">
                    {rarityOptions.map(rarity => (
                      <label key={rarity} className="flex items-center gap-2 py-1">
                        <input
                          type="checkbox"
                          checked={draftFilters.rarities?.includes(rarity) || false}
                          onChange={e => {
                            setDraftFilters(prev => {
                              const current = prev.rarities || [];
                              const newRarities = e.target.checked
                                ? [...current, rarity]
                                : current.filter(r => r !== rarity);
                              return { ...prev, rarities: newRarities };
                            });
                          }}
                          className="h-3 w-3 rounded"
                        />
                        <span className="text-xs text-ink-secondary">{rarity}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Release Date From</label>
                  <input
                    type="date"
                    value={draftFilters.releaseDateFrom || ''}
                    onChange={e => setDraftFilters(prev => ({ ...prev, releaseDateFrom: e.target.value || undefined }))}
                    className="w-full rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-sm text-ink-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-muted">Release Date To</label>
                  <input
                    type="date"
                    value={draftFilters.releaseDateTo || ''}
                    onChange={e => setDraftFilters(prev => ({ ...prev, releaseDateTo: e.target.value || undefined }))}
                    className="w-full rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-sm text-ink-primary"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => { handleResetFilters(); setDraftFilters(DEFAULT_FILTERS); }}
                  className="rounded-lg border border-border-default bg-surface-inset px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-hover"
                >
                  Reset
                </button>
                <button
                  onClick={handleApplyFilterClick}
                  className="cursor-pointer rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-accent-hover"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 flex gap-1 rounded-xl border border-border-default bg-surface-inset p-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-accent/15 text-accent shadow-sm'
                : 'text-ink-muted hover:bg-surface-hover hover:text-ink-secondary'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === 'overview' && (
          <MarketOverview data={overview} loading={overviewLoading} error={overviewError} />
        )}

        {activeTab === 'cards' && (
          <PredictionCardsView
            predictions={predictions}
            loading={predictionsLoading}
            error={predictionsError}
            window={predictionWindow}
            cardsById={cardsById}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            onPredictionsRefresh={loadPredictions}
            onViewDetail={(p) => setSelectedPrediction(p)}
          />
        )}

        {activeTab === 'backtest' && (
          <BacktestPanel
            results={backtestResults}
            backtestDate={backtestDate}
            onBacktestDateChange={setBacktestDate}
            onRunBacktest={handleRunBacktest}
            runningBacktest={runningBacktest}
          />
        )}

        {activeTab === 'forward' && (
          <ForwardTestPanel
            status={forwardStatus}
            onRefresh={handleRefreshForwardTest}
            refreshing={refreshingForward}
          />
        )}

        {activeTab === 'health' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => loadModelHealth()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-inset px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
                Refresh health
              </button>
            </div>
            <ModelHealthPanel
              calibration={calibration}
              dataQuality={dataQuality}
              loading={healthLoading}
              error={healthError}
            />
          </div>
        )}
      </motion.div>

      {selectedPrediction && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setSelectedPrediction(null)}
          />
          <PredictionDetailPanel
            prediction={selectedPrediction}
            card={cardsById[selectedPrediction.cardId]}
            window={predictionWindow}
            onClose={() => setSelectedPrediction(null)}
          />
        </>
      )}
    </div>
  );
}

export default MarketInsightsPage;
