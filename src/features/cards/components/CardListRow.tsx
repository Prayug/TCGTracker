import React from 'react';
import { BookPlus, Eye, LineChart, TrendingDown, TrendingUp } from 'lucide-react';
import { PokemonCard as PokemonCardType } from '../../../types/pokemon';
import { OnePieceCard } from '../../../types/onepiece';
import { pokemonApi } from '../../../services/pokemonApi';
import { onePieceApi } from '../../../services/onepieceApi';
import {
  formatCurrency,
  formatPercent,
  getRarityBadgeClass,
  getSevenDayDeltaPct,
} from '../../../utils/cardDisplay';

type AnyCard = PokemonCardType | OnePieceCard;

function isPokemonCard(card: AnyCard): card is PokemonCardType {
  return 'tcgplayer' in card || 'types' in card;
}

interface CardListRowProps {
  card: AnyCard;
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
  const price = isPokemonCard(card)
    ? card.marketPrice ?? pokemonApi.extractCardPrice(card)
    : onePieceApi.extractCardPrice(card as OnePieceCard);

  const deltaPct = isPokemonCard(card) ? getSevenDayDeltaPct(card) : null;
  const imageUrl = card.images?.small || card.images?.large;

  return (
    <article className="group grid grid-cols-[minmax(0,1fr)_minmax(88px,120px)_minmax(72px,96px)_minmax(88px,112px)_auto] items-center gap-3 rounded-lg border border-border-default bg-surface-raised px-3 py-2.5 shadow-sm transition-colors hover:border-border-strong md:gap-4 md:px-4">
      <button type="button" onClick={onClick} className="flex min-w-0 items-center gap-3 text-left">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-12 w-9 shrink-0 rounded object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded border border-border-default text-[9px] text-ink-muted">
            —
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">{card.name}</h3>
          <p className="truncate text-xs text-ink-muted">{card.set.name}</p>
        </div>
      </button>

      <span className="hidden truncate text-xs text-ink-muted sm:block">
        {card.rarity ? (
          <span
            className={`inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${getRarityBadgeClass(card.rarity)}`}
          >
            {card.rarity}
          </span>
        ) : (
          '—'
        )}
      </span>

      <span className="hidden font-mono text-xs tabular-nums text-ink-muted md:block">
        #{card.number || '—'}
      </span>

      <div className="text-right">
        <p className="text-sm font-bold tabular-nums text-ink-primary">
          {price > 0 ? formatCurrency(price) : '—'}
        </p>
        {deltaPct !== null && Math.abs(deltaPct) >= 0.05 && (
          <p
            className={`inline-flex items-center justify-end gap-0.5 text-[10px] font-semibold tabular-nums ${
              deltaPct > 0 ? 'text-gain' : 'text-loss'
            }`}
          >
            {deltaPct > 0 ? (
              <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-2.5 w-2.5" aria-hidden="true" />
            )}
            {formatPercent(deltaPct, { signed: true })}
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <button
          type="button"
          onClick={onClick}
          className="rounded-lg border border-border-default bg-surface-inset p-2 text-ink-secondary hover:text-ink-primary"
          aria-label={`View ${card.name}`}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => (onAddToCollection ? onAddToCollection() : onClick())}
          className="rounded-lg border border-border-default bg-surface-inset p-2 text-ink-secondary hover:text-ink-primary"
          aria-label={`Add ${card.name} to collection`}
        >
          <BookPlus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => (onViewPriceHistory ? onViewPriceHistory() : onClick())}
          className="rounded-lg border border-border-default bg-surface-inset p-2 text-ink-secondary hover:text-ink-primary"
          aria-label={`Price history for ${card.name}`}
        >
          <LineChart className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
};

/** Column headers for list-as-table browse mode (hidden on narrow viewports). */
export const CardListHeader: React.FC = () => (
  <div
    className="mb-2 hidden grid-cols-[minmax(0,1fr)_minmax(88px,120px)_minmax(72px,96px)_minmax(88px,112px)_auto] gap-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-ink-muted md:grid md:gap-4 md:px-4"
    aria-hidden="true"
  >
    <span>Card</span>
    <span className="hidden sm:block">Rarity</span>
    <span className="hidden md:block">#</span>
    <span className="text-right">Price</span>
    <span className="w-[104px]" />
  </div>
);
