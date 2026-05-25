import React from 'react';
import { PokemonCard } from '../../types/pokemon';
import { pokemonApi } from '../../services/pokemonApi';
import { formatCurrency } from '../../utils/cardDisplay';

interface MarketTickerProps {
  cards: PokemonCard[];
  onCardClick: (card: PokemonCard) => void;
}

function TickerItem({
  card,
  price,
  onCardClick,
}: {
  card: PokemonCard;
  price: number;
  onCardClick: (card: PokemonCard) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCardClick(card)}
      className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-left transition-colors hover:border-emerald-500/25 hover:bg-white/[0.08]"
    >
      <img
        src={card.images.small}
        alt=""
        className="h-9 w-6 rounded object-cover object-top"
        loading="lazy"
      />
      <span className="max-w-[120px] truncate text-xs font-semibold text-slate-100">{card.name}</span>
      <span className="text-xs font-bold tabular-nums text-emerald-300">{formatCurrency(price)}</span>
    </button>
  );
}

export const MarketTicker: React.FC<MarketTickerProps> = ({ cards, onCardClick }) => {
  const rows = cards
    .map((card) => ({
      card,
      price: card.marketPrice ?? pokemonApi.extractCardPrice(card),
    }))
    .filter((entry) => entry.price > 0)
    .slice(0, 14);

  if (rows.length === 0) {
    return (
      <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
        Market ticker loads after live card results are available.
      </section>
    );
  }

  const loop = [...rows, ...rows];

  return (
    <section className="relative mt-6 overflow-hidden rounded-xl border border-white/10 bg-black/30">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#0a0f17] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#0a0f17] to-transparent" />
      <div className="flex overflow-hidden py-2.5">
        <div className="ticker-track flex min-w-max gap-2 px-3">
          {loop.map(({ card, price }, i) => (
            <TickerItem key={`${card.id}-${i}`} card={card} price={price} onCardClick={onCardClick} />
          ))}
        </div>
      </div>
    </section>
  );
};
