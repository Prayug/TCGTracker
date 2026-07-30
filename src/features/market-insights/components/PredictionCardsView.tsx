import { Search, ArrowUpDown, TrendingUp, TrendingDown, Activity, AlertTriangle, Target, ArrowDown } from 'lucide-react';
import {
  CardPrediction,
  PredictionWindow,
  PredictionCategory,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  SortField,
  SortDirection,
  PREDICTION_WINDOW_LABELS,
  expectedReturnForWindow,
} from '../types';
import { PokemonCard } from '../../../types/pokemon';
import { PredictionCard } from './PredictionCard';

interface Props {
  predictions: CardPrediction[];
  loading: boolean;
  error: string | null;
  window: PredictionWindow;
  cardsById: Record<string, PokemonCard>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: SortField;
  onSortByChange: (s: SortField) => void;
  sortOrder: SortDirection;
  onSortOrderChange: (s: SortDirection) => void;
  categoryFilter: string;
  onCategoryFilterChange: (c: string) => void;
  onPredictionsRefresh: () => void;
  onViewDetail?: (prediction: CardPrediction) => void;
}

const CATEGORY_OPTIONS: { value: string; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All Cards', icon: <Activity className="h-3.5 w-3.5" /> },
  { value: 'strong_buy', label: CATEGORY_LABELS.strong_buy, icon: <TrendingUp className="h-3.5 w-3.5 text-green-400" /> },
  { value: 'watch_dip', label: CATEGORY_LABELS.watch_dip, icon: <Target className="h-3.5 w-3.5 text-emerald-400" /> },
  { value: 'recovery', label: CATEGORY_LABELS.recovery, icon: <Activity className="h-3.5 w-3.5 text-blue-400" /> },
  { value: 'momentum', label: CATEGORY_LABELS.momentum, icon: <TrendingUp className="h-3.5 w-3.5 text-purple-400" /> },
  { value: 'stagnant', label: CATEGORY_LABELS.stagnant, icon: <Target className="h-3.5 w-3.5 text-ink-muted" /> },
  { value: 'avoid', label: CATEGORY_LABELS.avoid, icon: <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> },
  { value: 'downtrend', label: CATEGORY_LABELS.downtrend, icon: <ArrowDown className="h-3.5 w-3.5 text-orange-400" /> },
];

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'return', label: 'Expected Return' },
  { value: 'confidence', label: 'Confidence' },
  { value: 'price', label: 'Current Price' },
  { value: 'name', label: 'Card Name' },
  { value: 'risk', label: 'Risk Score' },
];

export function PredictionCardsView({
  predictions,
  loading,
  error,
  window: predictionWindow,
  cardsById,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
  categoryFilter,
  onCategoryFilterChange,
  onPredictionsRefresh,
  onViewDetail,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search cards by name..."
            className="w-full rounded-lg border border-border-default bg-surface-inset py-2 pl-10 pr-3 text-sm text-white placeholder-ink-muted outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as SortField)}
            className="rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-xs text-white outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => onSortOrderChange(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-1 rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-xs text-ink-muted hover:text-ink-secondary"
            title={sortOrder === 'desc' ? 'Descending' : 'Ascending'}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortOrder === 'desc' ? 'Desc' : 'Asc'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onCategoryFilterChange(opt.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              categoryFilter === opt.value
                ? 'bg-accent text-white'
                : 'border border-border-default bg-surface-inset text-ink-muted hover:bg-surface-hover hover:text-ink-secondary'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : error ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border-default">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : predictions.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-default px-6">
          <p className="text-sm text-ink-muted">
            {searchQuery
              ? `No cards match "${searchQuery}". Try a different search.`
              : categoryFilter !== 'all'
                ? `No ${CATEGORY_LABELS[categoryFilter as PredictionCategory]?.toLowerCase() || categoryFilter} cards found.`
                : 'No predictions available. Run a prediction batch first.'}
          </p>
          {!searchQuery && (
            <button onClick={onPredictionsRefresh} className="btn-secondary text-xs">
              Refresh Predictions
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <span>{predictions.length} card{predictions.length !== 1 ? 's' : ''}</span>
            <span className="text-border-subtle">|</span>
            <span>{PREDICTION_WINDOW_LABELS[predictionWindow]} window</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {predictions.map((p) => (
              <PredictionCard
                key={p.id}
                prediction={p}
                card={cardsById[p.cardId]}
                window={predictionWindow}
                onViewDetail={onViewDetail}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
