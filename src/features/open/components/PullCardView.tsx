import React from 'react';
import { PullCard } from '../types';
import { formatCurrency } from '../../../utils/cardDisplay';
import { OP_RARITY_LABELS, opRarityStyle } from './opRarityStyles';
import { cn } from '../../../lib/utils';

interface PullCardViewProps {
  card: PullCard;
  /** When true, renders as a card back only (no name/price/rarity spoilers). */
  hidden?: boolean;
  showPrice?: boolean;
  /**
   * When true (default), shows the name/price/rarity footer used in collection
   * grids and box summaries. When false, full-bleed art with a light overlay —
   * used by the pack fan so face-down stacks never leak metadata.
   */
  showMeta?: boolean;
  /** Duplicate count — renders a (N) badge when > 1. */
  count?: number;
  className?: string;
}

export const PullCardView: React.FC<PullCardViewProps> = ({
  card,
  hidden = false,
  showPrice = true,
  showMeta = true,
  count,
  className,
}) => {
  const style = opRarityStyle(card.rarity);
  const price = card.marketPrice ?? 0;

  if (hidden) {
    return (
      <div
        className={cn('h-full w-full overflow-hidden rounded-xl shadow-card', className)}
        aria-label="Card back"
      >
        <img
          src={card.rarity === 'L' ? '/images/op-leader-back.png' : '/images/op-card-back.webp'}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  /* Full-bleed face for pack fan — art fills the card; rarity/price as overlay. */
  if (!showMeta) {
    return (
      <div
        className={cn(
          'relative h-full w-full overflow-hidden rounded-xl border shadow-card',
          style.border,
          style.glow,
          className
        )}
      >
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-surface-inset px-2 text-center text-[10px] text-ink-muted">
            {card.name}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2 pb-2 pt-8">
          <div className="flex items-center justify-between gap-1.5">
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold tracking-wide',
                style.badge
              )}
              title={OP_RARITY_LABELS[card.rarity]}
            >
              {card.rarity === 'AA' ? '★ AA' : card.rarity === 'LAA' ? '★ LAA' : card.rarity}
            </span>
            {showPrice && (
              <span className="truncate text-[10px] font-semibold tabular-nums text-white/90">
                {price > 0 ? formatCurrency(price) : '—'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-xl border bg-surface-raised shadow-card',
        style.border,
        style.glow,
        className
      )}
    >
      <div className="relative aspect-[63/88] overflow-hidden bg-surface-inset">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain p-1.5"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-ink-muted">
            No image
          </div>
        )}
        {count && count > 1 && (
          <div
            className="absolute right-1.5 top-1.5 z-10 rounded-md border border-border-subtle bg-black/80 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white shadow-sm"
            aria-label={`${count} copies`}
          >
            ×{count}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2">
        <p
          className="line-clamp-2 min-h-[2em] text-[11px] font-semibold leading-tight text-ink-primary"
          title={card.name}
        >
          {card.name}
        </p>
        <div className="mt-auto flex items-center justify-between gap-1.5">
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold tracking-wide',
              style.badge
            )}
            title={OP_RARITY_LABELS[card.rarity]}
          >
            {card.rarity === 'AA' ? '★ AA' : card.rarity === 'LAA' ? '★ LAA' : card.rarity}
          </span>
          {showPrice && (
            <span className="truncate text-[10px] font-semibold tabular-nums text-ink-secondary">
              {price > 0 ? formatCurrency(price) : '—'}
            </span>
          )}
        </div>
        <p className="truncate font-mono text-[9px] text-ink-muted">{card.number}</p>
      </div>
    </div>
  );
};
