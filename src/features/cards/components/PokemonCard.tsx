import React from 'react';
import { BookPlus, Eye, LineChart } from 'lucide-react';
import { PokemonCard as PokemonCardType } from '../../../types/pokemon';
import { pokemonApi } from '../../../services/pokemonApi';
import {
  formatCurrency,
  getPremiumBorderClass,
  getRarityBadgeClass,
  isPremiumRarity,
} from '../../../utils/cardDisplay';

interface PokemonCardProps {
  card: PokemonCardType;
  onClick: () => void;
  onAddToCollection?: () => void;
  onViewPriceHistory?: () => void;
}

export const PokemonCard: React.FC<PokemonCardProps> = ({
  card,
  onClick,
  onAddToCollection,
  onViewPriceHistory,
}) => {
  const price = card.marketPrice ?? pokemonApi.extractCardPrice(card);
  const fallbackAlt = `${card.name} card image`;
  const status = price > 0 ? 'Market' : 'No price';
  const statusClass = price > 0 ? 'text-emerald-300' : 'text-amber-300';
  const premium = isPremiumRarity(card.rarity);

  return (
    <article
      className={[
        'group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur',
        'transition-transform duration-300 ease-out hover:-translate-y-1',
        getPremiumBorderClass(card.rarity),
        premium ? 'card-foil' : '',
      ].join(' ')}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left"
        aria-label={`Open details for ${card.name}`}
      >
        <div className="relative aspect-[63/88] overflow-hidden bg-gradient-to-b from-[#131c2e] to-[#0b111e]">
          <img
            src={card.images.small}
            alt={card.name || fallbackAlt}
            className="relative z-0 h-full w-full object-contain p-2.5 transition-transform duration-500 ease-out group-hover:scale-[1.05]"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (card.images.large && target.src !== card.images.large) {
                target.src = card.images.large;
              } else {
                target.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='245' height='342' viewBox='0 0 245 342'%3E%3Crect width='245' height='342' fill='%23f1f5f9' rx='8'/%3E%3Ctext x='50%25' y='50%25' font-family='Inter,sans-serif' font-size='13' fill='%2394a3b8' text-anchor='middle' dominant-baseline='middle'%3E${encodeURIComponent(card.name)}%3C/text%3E%3C/svg%3E`;
              }
            }}
          />

          {premium && (
            <>
              <div
                className="card-foil-shine pointer-events-none absolute inset-0 z-10 opacity-0 mix-blend-color-dodge transition-opacity duration-300 group-hover:opacity-100"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-tr from-violet-500/0 via-white/0 to-emerald-400/0 opacity-0 transition-opacity duration-300 group-hover:opacity-30"
                aria-hidden="true"
              />
            </>
          )}

          {price > 0 && (
            <div className="absolute right-2 top-2 z-20 rounded-lg border border-emerald-400/35 bg-slate-950/80 px-2.5 py-1 shadow-[0_0_16px_rgba(16,185,129,0.2)] backdrop-blur-md">
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-emerald-400/90">
                Market
              </span>
              <span className="block text-sm font-bold tabular-nums text-emerald-200">
                {formatCurrency(price)}
              </span>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-[#070b13]/90 via-transparent to-transparent opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100" />

          <div className="absolute bottom-2 left-2 right-2 z-20 grid grid-cols-3 gap-1.5 opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-white/15 bg-black/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm hover:bg-black/85"
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onAddToCollection) {
                  onAddToCollection();
                  return;
                }
                onClick();
              }}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-white/15 bg-black/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm hover:bg-black/85"
            >
              <BookPlus className="h-3.5 w-3.5" />
              Add
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onViewPriceHistory) {
                  onViewPriceHistory();
                  return;
                }
                onClick();
              }}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-white/15 bg-black/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm hover:bg-black/85"
            >
              <LineChart className="h-3.5 w-3.5" />
              History
            </button>
          </div>
        </div>

        <div className="space-y-2 px-3.5 py-3">
          <h3 className="truncate text-sm font-semibold leading-tight text-slate-100" title={card.name}>
            {card.name || 'Unknown Card'}
          </h3>
          <p className="truncate text-xs text-slate-400" title={card.set.name}>
            {card.set.name || 'Unknown set'}
          </p>

          <div className="flex items-center justify-between gap-2">
            {card.rarity ? (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${getRarityBadgeClass(card.rarity)}`}
              >
                {card.rarity}
              </span>
            ) : (
              <span className="text-[10px] text-slate-500">Unspecified rarity</span>
            )}
            <span className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              #{card.number || 'N/A'}
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-2">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${statusClass}`}>
              {status}
            </span>
            <span
              className={`text-sm font-bold tabular-nums ${price > 0 ? 'text-emerald-300' : 'text-slate-500'}`}
            >
              {price > 0 ? formatCurrency(price) : 'Unpriced'}
            </span>
          </div>
        </div>
      </button>
    </article>
  );
};
