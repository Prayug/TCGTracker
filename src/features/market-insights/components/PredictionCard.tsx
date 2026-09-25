import { useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal, Radio, X } from 'lucide-react';
import { PokemonCard as PokemonCardTile } from '../../cards/components/PokemonCard';
import { useCardModal } from '../../../contexts/CardModalContext';
import { PokemonCard } from '../../../types/pokemon';
import {
  CardPrediction,
  CATEGORY_COLORS,
  CATEGORY_DEFINITIONS,
  CATEGORY_SHORT_LABELS,
  expectedReturnForWindow,
  PREDICTION_WINDOW_LABELS,
  PredictionWindow,
} from '../types';
import { formatPercent } from '../../../utils/cardDisplay';
import { formatInsightScore } from '../utils/formatInsightNumbers';
import { buildPokemonCardFromPrediction } from '../utils/predictionCard';
import { ExternalSignalsPanel } from './ExternalSignalsPanel';
import { parseExternalSignalsJson } from '../utils/parseExternalSignals';
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
  const categoryLabel = CATEGORY_SHORT_LABELS[prediction.category];
  const categoryDefinition = CATEGORY_DEFINITIONS[prediction.category];
  const confidenceText = formatInsightScore(prediction.confidenceScore);
  const preloadedSignals = useMemo(
    () => parseExternalSignalsJson(prediction.externalSignals),
    [prediction.externalSignals]
  );

  const signalCount = useMemo(
    () => parseSignalCount(prediction.externalSignals),
    [prediction.externalSignals]
  );

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
      const msg = err instanceof Error ? err.message : 'Analysis unavailable';
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

  return (
    <div className="prediction-card relative flex flex-col gap-2">
      <div className="relative">
        <PokemonCardTile card={displayCard} onClick={handleOpen} onViewPriceHistory={handleOpen} />
      </div>

      <div className="space-y-1.5 px-0.5">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            title={categoryDefinition}
            className={`inline-flex max-w-[65%] truncate rounded border px-1.5 py-0.5 text-[11px] font-medium leading-tight ${CATEGORY_COLORS[prediction.category]}`}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {categoryLabel}
          </button>
          <div className="text-right">
            <div
              className={`font-mono text-xs font-semibold tabular-nums ${
                isPositive ? 'text-emerald-400' : 'text-red-400'
              }`}
              title={`Expected return over the ${windowLabel} forecast window`}
            >
              {returnText}
            </div>
            <div className="text-[10px] text-ink-muted">{windowLabel} expected</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px] text-ink-muted">
          <span title="Model confidence 0–100">Conf {confidenceText}/100</span>
          {prediction.reliability && prediction.reliability !== 'high' && (
            <span
              className={
                prediction.reliability === 'insufficient' || prediction.reliability === 'low'
                  ? 'text-orange-400'
                  : 'text-amber-300'
              }
              title={prediction.reliabilityReason || 'Forecast reliability'}
            >
              {prediction.reliability}
            </span>
          )}
          <div className="flex items-center gap-1">
            {signalCount > 0 && (
              <button
                type="button"
                onClick={handleToggleSignals}
                title="External market signals for this card"
                className="inline-flex items-center gap-0.5 rounded border border-border-default px-1.5 py-0.5 text-ink-secondary hover:bg-surface-hover"
              >
                <Radio className="h-2.5 w-2.5" />
                {signalCount}
              </button>
            )}
            {onViewDetail && (
              <button
                type="button"
                onClick={handleViewDetail}
                className="rounded border border-border-default px-1.5 py-0.5 font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
              >
                Details
              </button>
            )}
            <div ref={menuRef} className="relative" data-open={menuOpen ? 'true' : 'false'}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                title="More actions"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="inline-flex items-center rounded border border-border-default p-0.5 text-ink-muted hover:bg-surface-hover hover:text-ink-secondary"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full right-0 z-50 mb-1 min-w-[8.5rem] overflow-hidden rounded-lg border border-border-strong bg-surface-overlay py-1 shadow-lg"
                >
                  {onViewDetail && (
                    <button
                      role="menuitem"
                      onClick={handleViewDetail}
                      className="w-full px-3 py-1.5 text-left text-xs text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
                    >
                      Details
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={handleExplain}
                    className="w-full px-3 py-1.5 text-left text-xs text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
                  >
                    Explain forecast
                  </button>
                  {signalCount > 0 && (
                    <button
                      role="menuitem"
                      onClick={handleToggleSignals}
                      className="w-full px-3 py-1.5 text-left text-xs text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
                    >
                      {signalCount} signal{signalCount === 1 ? '' : 's'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showSignals && (
        <div className="absolute inset-x-0 bottom-0 top-8 z-40 flex flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-raised shadow-xl">
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
            <ExternalSignalsPanel
              cardId={prediction.cardId}
              signals={preloadedSignals.length > 0 ? preloadedSignals : undefined}
            />
          </div>
        </div>
      )}

      {showExplanation && (
        <div className="absolute inset-x-0 bottom-0 top-8 z-40 flex flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-raised shadow-xl">
          <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
            <span className="text-xs font-semibold text-ink-primary">Forecast notes</span>
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
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                <span className="ml-2 text-xs text-ink-muted">Loading…</span>
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
