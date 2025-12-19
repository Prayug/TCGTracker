import React from 'react';
import { BookPlus, Eye, LineChart } from 'lucide-react';
import { PokemonCard as PokemonCardType } from '../../../types/pokemon';
import { OnePieceCard } from '../../../types/onepiece';
import { pokemonApi } from '../../../services/pokemonApi';
import { onePieceApi } from '../../../services/onepieceApi';
import {
  formatCurrency,
  getPremiumBorderClass,
  getRarityBadgeClass,
} from '../../../utils/cardDisplay';

export type AnyCard = PokemonCardType | OnePieceCard;

function isPokemonCard(card: AnyCard): card is PokemonCardType {
  return 'tcgplayer' in card || 'types' in card;
}

interface CardTileProps {
  card: AnyCard;
  onClick: () => void;
  onAddToCollection?: () => void;
  onViewPriceHistory?: () => void;
}

const CARD_IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='245' height='342' viewBox='0 0 245 342'%3E%3Crect width='245' height='342' fill='%231e293b' rx='8'/%3E%3Ctext x='50%25' y='50%25' font-family='Inter,sans-serif' font-size='12' fill='%2394a3b8' text-anchor='middle' dominant-baseline='middle'%3ENo image%3C/text%3E%3C/svg%3E";

export const CardTile: React.FC<CardTileProps> = ({
  card,
  onClick,
  onAddToCollection,
  onViewPriceHistory,
}) => {
  const price = isPokemonCard(card)
    ? card.marketPrice ?? pokemonApi.extractCardPrice(card)
    : onePieceApi.extractCardPrice(card as OnePieceCard);

  const imageUrl = card.images?.small || card.images?.large;

  return (
    <article
      className={[
        'group relative overflow-hidden rounded-lg border border-border-default bg-surface-raised shadow-sm',
        'transition-colors duration-150 hover:border-border-strong',
        getPremiumBorderClass(card.rarity),
      ].join(' ')}
    >
      <div className="relative aspect-[63/88] overflow-hidden bg-surface-inset cursor-pointer" onClick={onClick}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`${card.name} card image`}
              className="relative z-0 h-full w-full object-contain p-2.5 transition-transform duration-300 ease-out group-hover:scale-[1.03]"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (card.images?.large && target.src !== card.images.large) {
                  target.src = card.images.large;
                } else if (target.src !== CARD_IMAGE_PLACEHOLDER) {
                  target.src = CARD_IMAGE_PLACEHOLDER;
                }
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-ink-muted">
              No image available
            </div>
          )}

          <div className="absolute bottom-2 left-2 right-2 z-20 grid grid-cols-3 gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-border-default bg-surface-overlay px-2 py-1 text-[11px] font-medium text-ink-primary hover:bg-surface-hover"
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
              className="inline-flex items-center justify-center gap-1 rounded-md border border-border-default bg-surface-overlay px-2 py-1 text-[11px] font-medium text-ink-primary hover:bg-surface-hover"
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
              className="inline-flex items-center justify-center gap-1 rounded-md border border-border-default bg-surface-overlay px-2 py-1 text-[11px] font-medium text-ink-primary hover:bg-surface-hover"
            >
              <LineChart className="h-3.5 w-3.5" />
              History
            </button>
          </div>
        </div>

      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left"
        aria-label={`Open details for ${card.name}`}
      >
        <div className="space-y-1.5 px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3
              className="truncate text-[13px] font-semibold leading-tight text-ink-primary"
              title={card.name}
            >
              {card.name || 'Unknown Card'}
            </h3>
            <span className="shrink-0 font-mono text-[10px] text-ink-muted">
              #{card.number || '—'}
            </span>
          </div>
          <p className="truncate text-xs text-ink-muted" title={card.set.name}>
            {card.set.name || 'Unknown set'}
          </p>

          <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
            {card.rarity ? (
              <span
                className={`inline-flex max-w-[55%] items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${getRarityBadgeClass(card.rarity)}`}
                title={card.rarity}
              >
                {card.rarity}
              </span>
            ) : (
              <span className="text-[10px] text-ink-muted">—</span>
            )}
            <span className="flex items-center gap-1.5">
              <span
                className={`font-mono text-sm font-bold tabular-nums ${price > 0 ? 'text-ink-primary' : 'text-ink-muted'}`}
              >
                {price > 0 ? formatCurrency(price) : 'Unpriced'}
              </span>
            </span>
          </div>
        </div>
      </button>
    </article>
  );
};
