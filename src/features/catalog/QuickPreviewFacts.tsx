import { ArrowRight, Plus } from 'lucide-react';
import { type AnyCard, getCardDeltaPct, isPokemonCard } from '../../utils/cardPrice';
import { Delta, Price } from '../../components/exchange/Price';
import { knownPrice } from './catalogFilters';

/** The facts beside a catalog quick preview: price, its basis, weekly move, and next steps. */
export function QuickPreviewFacts({
  card,
  onDetails,
  onAdd,
}: {
  card: AnyCard;
  onDetails: () => void;
  onAdd: () => void;
}) {
  const price = knownPrice(card);
  const d7 = isPokemonCard(card) ? getCardDeltaPct(card, '7d') : null;
  const d30 = isPokemonCard(card) ? getCardDeltaPct(card, '30d') : null;
  return (
    <div>
      <div className="rounded-xl bg-white/5 p-4">
        <p className="text-[12px] text-white/55">Market estimate, one copy</p>
        <Price
          value={price}
          size="xl"
          className="mt-1 block text-white"
          unavailableLabel="No market price"
        />
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-white/65">
          <span>
            7 days <Delta pct={d7} />
          </span>
          <span>
            30 days <Delta pct={d30} />
          </span>
        </p>
        <p className="mt-2 text-[11.5px] text-white/45">
          {price
            ? 'TCGplayer market price for the listed finish.'
            : 'The catalog has no market price for this print.'}
        </p>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn-tactile" onClick={onDetails}>
          Full details
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" className="btn-glass text-white" onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden />
          Add to collection
        </button>
      </div>
    </div>
  );
}
