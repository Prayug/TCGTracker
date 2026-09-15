import {
  Search,
  ArrowUpDown,
  TrendingUp,
  Activity,
  AlertTriangle,
  Target,
  ArrowDown,
} from 'lucide-react';
import {
  CardPrediction,
  PredictionWindow,
  PredictionCategory,
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS,
  CATEGORY_DEFINITIONS,
  SortField,
  SortDirection,
  PREDICTION_WINDOW_LABELS,
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
  allLabel?: string;
}

const CATEGORY_OPTIONS: {
  value: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'all',
    label: 'All Cards',
    shortLabel: 'All',
    icon: <Activity className="h-3.5 w-3.5" />,
  },
  {
    value: 'strong_buy',
    label: CATEGORY_SHORT_LABELS.strong_buy,
    shortLabel: CATEGORY_SHORT_LABELS.strong_buy,
    icon: <TrendingUp className="h-3.5 w-3.5 text-green-400" />,
  },
  {
    value: 'watch_dip',
    label: CATEGORY_SHORT_LABELS.watch_dip,
    shortLabel: CATEGORY_SHORT_LABELS.watch_dip,
    icon: <Target className="h-3.5 w-3.5 text-emerald-400" />,
  },
  {
    value: 'recovery',
    label: CATEGORY_SHORT_LABELS.recovery,
    shortLabel: CATEGORY_SHORT_LABELS.recovery,
    icon: <Activity className="h-3.5 w-3.5 text-blue-400" />,
  },
  {
    value: 'momentum',
    label: CATEGORY_SHORT_LABELS.momentum,
    shortLabel: CATEGORY_SHORT_LABELS.momentum,
    icon: <TrendingUp className="h-3.5 w-3.5 text-purple-400" />,
  },
  {
    value: 'stagnant',
    label: CATEGORY_SHORT_LABELS.stagnant,
    shortLabel: CATEGORY_SHORT_LABELS.stagnant,
    icon: <Target className="h-3.5 w-3.5 text-ink-muted" />,
  },
  {
    value: 'avoid',
    label: CATEGORY_SHORT_LABELS.avoid,
    shortLabel: CATEGORY_SHORT_LABELS.avoid,
    icon: <AlertTriangle className="h-3.5 w-3.5 text-red-400" />,
  },
  {
    value: 'downtrend',
    label: CATEGORY_SHORT_LABELS.downtrend,
    shortLabel: CATEGORY_SHORT_LABELS.downtrend,
    icon: <ArrowDown className="h-3.5 w-3.5 text-orange-400" />,
  },
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
  allLabel = 'All Cards',
}: Props) {
  const activeDefinition =
    categoryFilter !== 'all'
      ? CATEGORY_DEFINITIONS[categoryFilter as PredictionCategory]
      : 'Browse forecasts by classification. Hover a chip for what each label means.';

  return (
    <div className="space-y-[var(--insights-space-2,0.75rem)]">
      <div className="insights-controls-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name..."
            className="w-full rounded-lg border border-border-default bg-surface-inset py-[clamp(0.375rem,0.8vw,0.5rem)] pl-10 pr-3 text-[var(--insights-text-sm,0.875rem)] text-ink-primary placeholder-ink-muted outline-none focus:border-accent"
          />
        </div>

        <div className="insights-sort-group">
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as SortField)}
            aria-label="Sort predictions"
            className="min-w-0 rounded-lg border border-border-default bg-surface-inset px-3 py-[clamp(0.375rem,0.8vw,0.5rem)] text-[var(--insights-text-sm,0.875rem)] text-ink-primary outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => onSortOrderChange(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-border-default bg-surface-inset px-3 py-[clamp(0.375rem,0.8vw,0.5rem)] text-[var(--insights-text-sm,0.875rem)] text-ink-muted hover:text-ink-secondary"
            title={sortOrder === 'desc' ? 'Descending' : 'Ascending'}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{sortOrder === 'desc' ? 'Desc' : 'Asc'}</span>
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Classification
          </span>
        </div>
        <div className="scroll-rail scroll-rail-chips -mx-1 px-1 pb-0.5">
          {CATEGORY_OPTIONS.map((opt) => {
            const definition =
              opt.value === 'all'
                ? 'Show every scored card for this window'
                : CATEGORY_DEFINITIONS[opt.value as PredictionCategory];
            return (
              <button
                key={opt.value}
                type="button"
                title={definition}
                onClick={() => onCategoryFilterChange(opt.value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-[clamp(0.625rem,0.8vw,0.75rem)] py-[clamp(0.3125rem,0.6vw,0.375rem)] text-[var(--insights-text-sm,0.875rem)] font-medium transition-colors ${
                  categoryFilter === opt.value
                    ? 'bg-accent text-primary-foreground'
                    : 'border border-border-default bg-surface-inset text-ink-muted hover:bg-surface-hover hover:text-ink-secondary'
                }`}
              >
                {opt.icon}
                {opt.value === 'all' ? allLabel : opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-muted">{activeDefinition}</p>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : error ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-default px-6">
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => onPredictionsRefresh()}
            className="btn-secondary text-xs"
          >
            Retry
          </button>
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
            <button
              type="button"
              onClick={() => onPredictionsRefresh()}
              className="btn-secondary text-xs"
            >
              Refresh Predictions
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[var(--insights-text-sm,0.875rem)] text-ink-muted">
            <span>
              {predictions.length} card{predictions.length !== 1 ? 's' : ''}
            </span>
            <span className="text-border-subtle">|</span>
            <span>{PREDICTION_WINDOW_LABELS[predictionWindow]} forecast window</span>
          </div>
          <div className="insights-card-grid">
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
