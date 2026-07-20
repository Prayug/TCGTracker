import { useMemo, useState } from 'react';
import { Radio, X } from 'lucide-react';
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
        <span
          className={`rounded-full border border-black/40 bg-black/75 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums  ${
            isPositive ? 'text-emerald-300' : 'text-red-300'
          }`}
        >
          {windowLabel} {isPositive ? '+' : ''}
          {formatPercent(expectedReturnPct, { signed: false })}
        </span>
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
    </div>
  );
}
