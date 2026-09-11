import React from 'react';
import { BookPlus, Eye, LineChart } from 'lucide-react';
import { PokemonCard as PokemonCardType } from '../../../types/pokemon';
import { OnePieceCard } from '../../../types/onepiece';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { getBrowsePriceMove, getCardPrice } from '../../../utils/cardPrice';

export type AnyCard = PokemonCardType | OnePieceCard;

interface CardTileProps {
  card: AnyCard;
  onClick: () => void;
  onAddToCollection?: () => void;
  onViewPriceHistory?: () => void;
}

const CARD_IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='245' height='342' viewBox='0 0 245 342'%3E%3Crect width='245' height='342' fill='%23e7e1d4' rx='4'/%3E%3Ctext x='50%25' y='50%25' font-family='IBM Plex Sans,sans-serif' font-size='12' fill='%237a7468' text-anchor='middle' dominant-baseline='middle'%3ENo image%3C/text%3E%3C/svg%3E";

export const CardTile: React.FC<CardTileProps> = ({
  card,
  onClick,
  onAddToCollection,
  onViewPriceHistory,
}) => {
  const price = getCardPrice(card);
  const move = getBrowsePriceMove(card);

  const imageUrl = card.images?.small || card.images?.large;

  return (
    <article className="group relative flex flex-col overflow-hidden animate-sleeve-slide">
      <div
        role="button"
        tabIndex={-1}
        className="sleeve-window relative aspect-[63/88] cursor-pointer"
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={card.name}
            className="relative z-0 h-full w-full object-cover object-top"
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
      </div>

      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left"
        aria-label={`Open details for ${card.name}`}
      >
        <div className="space-y-1 px-0.5 pt-2.5 pb-1">
          <h3
            className="line-clamp-2 min-h-[2em] text-[13px] font-semibold leading-tight text-ink-primary"
            title={card.name}
          >
            {card.name || 'Unknown Card'}
          </h3>
          <p className="truncate font-mono text-[11px] text-ink-muted" title={card.set.name}>
            {card.set.name || 'Unknown set'}
            {card.number ? ` · #${card.number}` : ''}
            {'language' in card && card.language === 'ja' ? ' · JP' : ''}
          </p>

          <div className="pt-0.5">
            <p
              className={`stamp-price text-sm tabular-nums ${price > 0 ? 'text-ink-primary' : 'text-ink-muted'}`}
            >
              {price > 0 ? formatCurrency(price) : 'Unpriced'}
            </p>
            {move && (
              <p
                className={`mt-0.5 text-[11px] font-medium tabular-nums ${
                  move.percent >= 0 ? 'text-gain' : 'text-loss'
                }`}
              >
                {move.percent >= 0 ? '▲' : '▼'} {formatPercent(move.percent)} {move.window}
              </p>
            )}
          </div>
        </div>
      </button>

      <div className="action-tray mt-1 flex items-center gap-1 px-1 py-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="inline-flex flex-1 items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
          style={{ borderRadius: 'var(--radius-ui)' }}
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
          className="inline-flex flex-1 items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
          style={{ borderRadius: 'var(--radius-ui)' }}
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
          className="inline-flex flex-1 items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
          style={{ borderRadius: 'var(--radius-ui)' }}
        >
          <LineChart className="h-3.5 w-3.5" />
          History
        </button>
      </div>
    </article>
  );
};
