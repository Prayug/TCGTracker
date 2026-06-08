import { PokemonCard as PokemonCardTile } from '../../cards/components/PokemonCard';
import { useCardModal } from '../../../contexts/CardModalContext';
import { PokemonCard } from '../../../types/pokemon';
import { CardPrediction, CATEGORY_COLORS, CATEGORY_LABELS } from '../types';
import { formatPercent } from '../../../utils/cardDisplay';
import { buildPokemonCardFromPrediction } from '../utils/predictionCard';

interface Props {
  prediction: CardPrediction;
  card?: PokemonCard;
}

export function PredictionCard({ prediction, card }: Props) {
  const { openCard } = useCardModal();

  const displayCard: PokemonCard = {
    ...(card ?? buildPokemonCardFromPrediction(prediction)),
    marketPrice: prediction.currentPrice,
  };

  const expectedReturnPct = prediction.expected90dReturn * 100;
  const isPositive = expectedReturnPct >= 0;

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
          90d {isPositive ? '+' : ''}
          {formatPercent(expectedReturnPct, { signed: false })}
        </span>
      </div>
    </div>
  );
}
