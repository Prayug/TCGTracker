import { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, MoreHorizontal, Radio, X } from 'lucide-react';
import { PokemonCard as PokemonCardTile } from '../../cards/components/PokemonCard';
import { useCardModal } from '../../../contexts/CardModalContext';
import { PokemonCard } from '../../../types/pokemon';
import {
  CardPrediction,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS,
  expectedReturnForWindow,
  PREDICTION_WINDOW_LABELS,
  PredictionWindow,
} from '../types';
import { formatPercent } from '../../../utils/cardDisplay';
import { buildPokemonCardFromPrediction } from '../utils/predictionCard';
import { ExternalSignalsPanel } from './ExternalSignalsPanel';
import { useInsightsApi } from '../hooks/insightsApiContext';

interface Props {
  prediction: CardPrediction;
  card?: PokemonCard;
  window?: PredictionWindow;
  onViewDetail?: (prediction: CardPrediction) => void;
}

function parseSignalCount(externalSignals: string): number {
  if (!externalSignals || externalSignals === '[]') return 0;
  try {
    const parsed = JSON.parse(externalSignals);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function PredictionCard({
  prediction,
  card,
  window: predictionWindow = '90d',
  onViewDetail,
}: Props) {
  const { openCard } = useCardModal();
  const insightsApi = useInsightsApi();
  const [showSignals, setShowSignals] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanationText, setExplanationText] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayCard: PokemonCard = {
    ...(card ?? buildPokemonCardFromPrediction(prediction)),
    marketPrice: prediction.currentPrice,
  };

  const expectedReturnPct = expectedReturnForWindow(prediction, predictionWindow) * 100;
  const isPositive = expectedReturnPct >= 0;
  const windowLabel = PREDICTION_WINDOW_LABELS[predictionWindow];
  const returnText = `${isPositive ? '+' : ''}${formatPercent(expectedReturnPct, { signed: false })}`;

  const signalCount = useMemo(
    () => parseSignalCount(prediction.externalSignals),
    [prediction.externalSignals]
  );

  const showGradeBadge =
    prediction.gradingPremiumPotential != null && prediction.gradingPremiumPotential >= 0.25;

  const gradeTitle =
    prediction.gradingScore != null
      ? `Grade-worthiness score ${Math.round(prediction.gradingScore)}/100 (AI grade quality + PSA-10 scarcity)`
      : 'High grading premium potential (AI grade quality + low PSA-10 pop)';

  const gradeText =
    prediction.gradingScore != null
      ? `Grade ${Math.round(prediction.gradingScore)} +${Math.round(prediction.gradingPremiumPotential! * 100)}%`
      : `Grade +${Math.round(prediction.gradingPremiumPotential! * 100)}%`;

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleOpen = () => {
    openCard(displayCard);
  };

  const handleExplain = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (showExplanation) {
      setShowExplanation(false);
      return;
    }
    if (explanationText) {
      setShowExplanation(true);
      return;
    }
    setLoadingExplanation(true);
    setShowExplanation(true);
    try {
      const result = await insightsApi.getAiExplanation(prediction.cardId);
      setExplanationText(result.explanation);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI analysis unavailable';
      setExplanationText(`Error: ${msg}`);
    } finally {
      setLoadingExplanation(false);
    }
  };

  const handleViewDetail = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onViewDetail?.(prediction);
  };

  const handleToggleSignals = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setShowSignals((v) => !v);
  };

  const badgeBase = `inline-flex max-w-full items-center border font-medium leading-tight shadow-sm ${CATEGORY_COLORS[prediction.category]}`;
  const returnBadgeClass = `prediction-badge inline-flex items-center rounded-full border border-black/40 bg-black/75 font-mono font-semibold tabular-nums ${
    isPositive ? 'text-emerald-300' : 'text-red-300'
  }`;
  const actionBtnClass =
    'pointer-events-auto inline-flex items-center gap-1 rounded-full border font-medium shadow-sm transition-colors hover:bg-black/90';

  return (
    <div className="prediction-card relative">
      <PokemonCardTile card={displayCard} onClick={handleOpen} onViewPriceHistory={handleOpen} />

      <div className="pointer-events-none absolute left-[clamp(0.375rem,0.8vw,0.5rem)] right-[clamp(0.375rem,0.8vw,0.5rem)] top-[clamp(0.375rem,0.8vw,0.5rem)] z-30 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-1">
          <span className={`prediction-badge ${badgeBase}`}>
            <span className="prediction-density-full">{CATEGORY_LABELS[prediction.category]}</span>
            <span className="prediction-density-compact">
              {CATEGORY_SHORT_LABELS[prediction.category]}
            </span>
            <span className="prediction-density-minimal">
              {CATEGORY_SHORT_LABELS[prediction.category]}
            </span>
          </span>
          <span className={returnBadgeClass}>
            <span className="prediction-density-full">
              {windowLabel} {returnText}
            </span>
            <span className="prediction-density-compact">
              {windowLabel} {returnText}
            </span>
            <span className="prediction-density-minimal">{returnText}</span>
          </span>
        </div>
        {showGradeBadge && (
          <span
            title={gradeTitle}
            className="prediction-grade-badge prediction-badge w-fit rounded-full border border-amber-400/40 bg-black/75 font-mono font-semibold tabular-nums text-amber-200"
          >
            {gradeText}
          </span>
        )}
      </div>

      {signalCount > 0 && (
        <div className="prediction-signals-btn pointer-events-none absolute bottom-2 left-2 z-30">
          <button
            onClick={handleToggleSignals}
            title="External market signals detected for this card (news, Reddit, YouTube, set releases). Click to view."
            className={`${actionBtnClass} prediction-action-btn border-cyan-500/40 bg-black/75 text-cyan-300`}
          >
            <Radio className="h-3 w-3" />
            {signalCount} signal{signalCount === 1 ? '' : 's'}
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 right-2 z-30 flex items-center gap-1">
        {onViewDetail && (
          <button
            onClick={handleViewDetail}
            title="View detailed prediction"
            className={`prediction-primary-action ${actionBtnClass} prediction-action-btn border-indigo-500/40 bg-black/75 text-indigo-300`}
          >
            Details
          </button>
        )}
        <button
          onClick={handleExplain}
          title="AI-generated market analysis for this card"
          className={`prediction-secondary-actions ${actionBtnClass} prediction-action-btn ${
            showExplanation
              ? 'border-violet-500/60 bg-violet-600/90 text-violet-100'
              : 'border-violet-500/40 bg-black/75 text-violet-300'
          }`}
        >
          <Brain className="h-3 w-3" />
          AI
        </button>

        <div
          ref={menuRef}
          className="prediction-overflow-menu relative"
          data-open={menuOpen ? 'true' : 'false'}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            title="More actions"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={`prediction-overflow-trigger ${actionBtnClass} prediction-action-btn border-border-strong bg-black/75 text-ink-secondary`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          <div
            role="menu"
            className="prediction-overflow-panel pointer-events-auto absolute bottom-full right-0 z-50 mb-1 min-w-[8.5rem] flex-col overflow-hidden rounded-lg border border-border-strong bg-surface-overlay py-1 shadow-lg"
          >
            {onViewDetail && (
              <button
                role="menuitem"
                onClick={handleViewDetail}
                className="px-3 py-1.5 text-left text-xs text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
              >
                Details
              </button>
            )}
            <button
              role="menuitem"
              onClick={handleExplain}
              className="px-3 py-1.5 text-left text-xs text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
            >
              AI analysis
            </button>
            {signalCount > 0 && (
              <button
                role="menuitem"
                onClick={handleToggleSignals}
                className="px-3 py-1.5 text-left text-xs text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
              >
                {signalCount} signal{signalCount === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </div>
      </div>

      {showSignals && (
        <div className="absolute inset-x-1 bottom-1 top-10 z-40 flex flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-raised shadow-xl">
          <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
            <span className="text-xs font-semibold text-ink-primary">External Signals</span>
            <button
              onClick={() => setShowSignals(false)}
              className="rounded p-0.5 text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
              aria-label="Close signals panel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ExternalSignalsPanel cardId={prediction.cardId} />
          </div>
        </div>
      )}

      {showExplanation && (
        <div className="absolute inset-x-1 bottom-1 top-10 z-40 flex flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-raised shadow-xl">
          <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
            <span className="text-xs font-semibold text-ink-primary">AI Analysis</span>
            <button
              onClick={() => setShowExplanation(false)}
              className="rounded p-0.5 text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
              aria-label="Close explanation panel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loadingExplanation ? (
              <div className="flex items-center justify-center py-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                <span className="ml-2 text-xs text-ink-muted">Generating analysis...</span>
              </div>
            ) : explanationText?.startsWith('Error:') ? (
              <p className="text-xs leading-relaxed text-red-400">{explanationText}</p>
            ) : (
              <p className="text-xs leading-relaxed text-ink-secondary">{explanationText}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
