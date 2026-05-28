import React from 'react';
import { BookPlus, Eye, LineChart } from 'lucide-react';
import { PokemonCard as PokemonCardType } from '../../../types/pokemon';
import { pokemonApi } from '../../../services/pokemonApi';
import { formatCurrency, getRarityBadgeClass } from '../../../utils/cardDisplay';

interface CardListRowProps {
  card: PokemonCardType;
  onClick: () => void;
  onAddToCollection?: () => void;
  onViewPriceHistory?: () => void;
}

export const CardListRow: React.FC<CardListRowProps> = ({
  card,
  onClick,
  onAddToCollection,
  onViewPriceHistory,
}) => {
  const price = card.marketPrice ?? pokemonApi.extractCardPrice(card);

  return (
    <article className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 transition-transform duration-300 hover:-translate-y-0.5 hover:bg-white/[0.06]">
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <img
          src={card.images.small}
          alt={card.name}
          className="h-16 w-11 shrink-0 rounded object-contain"
          loading="lazy"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-white">{card.name}</h3>
          <p className="truncate text-xs text-slate-400">{card.set.name}</p>
          {card.rarity && (
            <span
              className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${getRarityBadgeClass(card.rarity)}`}
            >
              {card.rarity}
            </span>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Market</p>
          <p className="text-lg font-bold tabular-nums text-emerald-300">
            {price > 0 ? formatCurrency(price) : '—'}
          </p>
        </div>
      </button>

      <div className="flex shrink-0 gap-1.5 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <button
          type="button"
          onClick={onClick}
          className="rounded-lg border border-white/15 bg-black/50 p-2 text-slate-200 hover:bg-white/10"
          aria-label="View"
        >
          <Eye className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => (onAddToCollection ? onAddToCollection() : onClick())}
          className="rounded-lg border border-white/15 bg-black/50 p-2 text-slate-200 hover:bg-white/10"
          aria-label="Add"
        >
          <BookPlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => (onViewPriceHistory ? onViewPriceHistory() : onClick())}
          className="rounded-lg border border-white/15 bg-black/50 p-2 text-slate-200 hover:bg-white/10"
          aria-label="History"
        >
          <LineChart className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
};
