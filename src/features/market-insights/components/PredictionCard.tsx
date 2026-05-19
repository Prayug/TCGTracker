import { useMemo, useState } from 'react';
import { Brain, Radio, X } from 'lucide-react';
import { PokemonCard as PokemonCardTile } from '../../cards/components/PokemonCard';
import { useCardModal } from '../../../contexts/CardModalContext';
import { PokemonCard } from '../../../types/pokemon';
import {
  CardPrediction,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  expectedReturnForWindow,
  PREDICTION_WINDOW_LABELS,
  PredictionWindow,
} from '../types';
import { formatPercent } from '../../../utils/cardDisplay';
import { buildPokemonCardFromPrediction } from '../utils/predictionCard';
import { ExternalSignalsPanel } from './ExternalSignalsPanel';
import { marketInsightsApi } from '../../../services/marketInsightsApi';

interface Props {
  prediction: CardPrediction;
  card?: PokemonCard;
  window?: PredictionWindow;
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

export function PredictionCard({ prediction, card, window: predictionWindow = '90d' }: Props) {
  const { openCard } = useCardModal();
  const [showSignals, setShowSignals] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanationText, setExplanationText] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  const displayCard: PokemonCard = {
    ...(card ?? buildPokemonCardFromPrediction(prediction)),
    marketPrice: prediction.currentPrice,
  };

  const expectedReturnPct = expectedReturnForWindow(prediction, predictionWindow) * 100;
  const isPositive = expectedReturnPct >= 0;
  const windowLabel = PREDICTION_WINDOW_LABELS[predictionWindow];

  const signalCount = useMemo(
    () => parseSignalCount(prediction.externalSignals),
    [prediction.externalSignals]
  );

  const handleOpen = () => {
    openCard(displayCard);
  };

  const handleExplain = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
      const result = await marketInsightsApi.getAiExplanation(prediction.cardId);
      setExplanationText(result.explanation);
    } catch (err: any) {
      const msg = err?.message || 'AI analysis unavailable';
      setExplanationText(`Error: ${msg}`);
    } finally {
      setLoadingExplanation(false);
    }
  };

  return (
    <div className="relative">
      <PokemonCardTile
        card={displayCard}
        onClick={handleOpen}
        onViewPriceHistory={handleOpen}
      />

      <div className="pointer-events-none absolute left-2 right-2 top-2 z-30 flex flex-wrap items-start justify-between gap-1.5">
        <span
          className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight shadow-sm ${CATEGORY_COLORS[prediction.category]}`}
        >
          {CATEGORY_LABELS[prediction.category]}
        </span>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`rounded-full border border-black/40 bg-black/75 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums  ${
              isPositive ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            {windowLabel} {isPositive ? '+' : ''}
            {formatPercent(expectedReturnPct, { signed: false })}
          </span>
          {prediction.gradingPremiumPotential != null &&
            prediction.gradingPremiumPotential >= 0.25 && (
              <span
                title="High grading premium potential (AI grade quality + low PSA-10 pop)"
                className="rounded-full border border-amber-400/40 bg-black/75 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-amber-200"
              >
                Grade +{Math.round(prediction.gradingPremiumPotential * 100)}%
              </span>
            )}
        </div>
      </div>

      {signalCount > 0 && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-30">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSignals((v) => !v);
            }}
            title="External market signals detected for this card (news, Reddit, YouTube, set releases). Click to view."
            className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-black/75 px-2 py-0.5 text-[10px] font-medium text-cyan-300 shadow-sm transition-colors hover:bg-black/90"
          >
            <Radio className="h-3 w-3" />
            {signalCount} signal{signalCount === 1 ? '' : 's'}
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 right-2 z-30">
        <button
          onClick={handleExplain}
          title="AI-generated market analysis for this card"
          className={`pointer-events-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium shadow-sm transition-colors ${
            showExplanation
              ? 'border-violet-500/60 bg-violet-600/90 text-violet-100'
              : 'border-violet-500/40 bg-black/75 text-violet-300 hover:bg-black/90'
          }`}
        >
          <Brain className="h-3 w-3" />
          AI
        </button>
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
              <p className="text-xs leading-relaxed text-red-400">
                {explanationText}
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-ink-secondary">
                {explanationText}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
