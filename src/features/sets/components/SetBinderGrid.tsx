import React from 'react';
import { Heart, Plus, Check } from 'lucide-react';
import { SetTrackerCard } from '../../../services/setTrackerService';
import { formatCurrency } from '../../../utils/cardDisplay';

type FilterMode = 'all' | 'owned' | 'missing' | 'wishlist';

interface SetBinderGridProps {
  cards: SetTrackerCard[];
  wishlistIds: Set<string>;
  filter: FilterMode;
  onToggleWishlist: (cardId: string) => void;
  onAddToVault: (card: SetTrackerCard) => void;
  onCardClick: (card: SetTrackerCard) => void;
}

export const SetBinderGrid: React.FC<SetBinderGridProps> = ({
  cards,
  wishlistIds,
  filter,
  onToggleWishlist,
  onAddToVault,
  onCardClick,
}) => {
  const visible = cards.filter((c) => {
    if (filter === 'owned') return c.owned;
    if (filter === 'missing') return !c.owned;
    if (filter === 'wishlist') return wishlistIds.has(c.id);
    return true;
  });

  if (visible.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">No cards in this view.</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {visible.map((card) => {
        const wish = wishlistIds.has(card.id);
        return (
          <article
            key={card.id}
            onClick={() => onCardClick(card)}
            className={`group relative flex cursor-pointer flex-col rounded-xl border p-2 transition-all hover:border-border-strong ${
              card.owned
                ? 'border-gain/30 bg-gain/[0.06]'
                : wish
                  ? 'border-amber-500/30 bg-amber-500/[0.06]'
                  : 'border-border-default bg-surface-raised'
            }`}
          >
            {card.owned && (
              <span
                className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-gain/90 text-surface-base"
                aria-label="Owned"
              >
                <Check className="h-3.5 w-3.5" />
              </span>
            )}
            <div
              className="aspect-[245/342] w-full overflow-hidden rounded-lg bg-surface-inset"
            >
              {card.images?.small || card.images?.large ? (
                <img
                  src={card.images.small || card.images.large}
                  alt={card.name}
                  className={`h-full w-full object-contain transition-all duration-300 group-hover:scale-[1.03] ${
                    card.owned ? '' : 'opacity-50 saturate-[0.35] group-hover:opacity-90 group-hover:saturate-100'
                  }`}
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-2 text-center text-xs text-ink-muted">
                  {card.name}
                </div>
              )}
            </div>
            <p className="mt-2 truncate text-xs font-medium text-white">
              #{card.number} {card.name}
            </p>
            <div className="mt-0.5 flex items-center justify-between gap-1">
              {card.hasPriceData ? (
                <p className="text-xs font-semibold tabular-nums text-ink-secondary">
                  {formatCurrency(card.marketPrice ?? 0)}
                </p>
              ) : (
                <p className="text-xs text-ink-muted">No price</p>
              )}
              {card.priceSource === 'market_sync' && (
                <span className="text-[10px] text-ink-muted" title={card.priceDate ? `As of ${card.priceDate}` : 'Synced market price'}>
                  Live
                </span>
              )}
              {card.priceSource === 'tcgplayer_catalog' && (
                <span className="text-[10px] text-ink-muted" title="From catalog TCGPlayer data">
                  Est.
                </span>
              )}
            </div>
            <div className="mt-2 flex gap-1">
              {!card.owned && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleWishlist(card.id);
                    }}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs ${
                      wish
                        ? 'border-amber-500/40 text-amber-300'
                        : 'border-border-subtle text-ink-muted hover:text-amber-300'
                    }`}
                    title="Wishlist"
                  >
                    <Heart className={`h-3 w-3 ${wish ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToVault(card);
                    }}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border-default py-1.5 text-xs text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent"
                    title="Add to collection"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
};
