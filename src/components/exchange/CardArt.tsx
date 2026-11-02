import { useState } from 'react';
import { cardImageCandidates } from '../../utils/cardImage';

import { cn } from '@/lib/utils';

export interface CardArtSource {
  /** Catalog id. For Pokémon TCG ids it lets us find the exact card's art when a URL fails. */
  id?: string | null;
  name: string;
  images?: { small?: string; large?: string } | null;
  number?: string | null;
  set?: { name?: string | null } | null;
  tcgplayer?: { productId?: string | number } | null;
}

/**
 * Physical-card art frame. Real 63×88 proportions and corner radius.
 * It walks the card's own image URLs (proxied, then direct) and the path
 * derived from its exact id before giving up. When no artwork loads it
 * shows a labelled slip, never a similar card's art.
 */
export function CardArt({
  card,
  size = 'small',
  className,
  imgClassName,
  priority = false,
  alt,
  flat = false,
}: {
  card: CardArtSource;
  size?: 'small' | 'large';
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  alt?: string;
  /** Drop the physical shadow (dense lists). */
  flat?: boolean;
}) {
  const key = `${card.id ?? ''}|${card.images?.small ?? ''}|${card.images?.large ?? ''}|${size}`;
  const [state, setState] = useState({ key, tries: 0, loaded: false });
  const candidates = cardImageCandidates(card, size);
  if (state.key !== key) setState({ key, tries: 0, loaded: false });
  const tries = state.key === key ? state.tries : 0;
  const src = candidates[tries];
  const showSlip = !src;

  return (
    <div
      className={cn(
        'card-art relative aspect-[63/88] w-full overflow-hidden',
        flat && 'shadow-none',
        className
      )}
    >
      {!showSlip ? (
        <img
          key={src}
          src={src}
          alt={
            alt ??
            `${card.name}${card.set?.name ? `, ${card.set.name}` : ''}${card.number ? ` #${card.number}` : ''}`
          }
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          width={size === 'large' ? 734 : 245}
          height={size === 'large' ? 1024 : 342}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            state.loaded ? 'opacity-100' : 'opacity-0',
            imgClassName
          )}
          onLoad={() => setState((p) => (p.key === key ? { ...p, loaded: true } : p))}
          onError={() =>
            setState((p) => (p.key === key ? { ...p, tries: p.tries + 1, loaded: false } : p))
          }
        />
      ) : (
        <ArtSlip card={card} />
      )}
      {!showSlip && !state.loaded ? (
        <span aria-hidden className="skeleton absolute inset-0 -z-0" />
      ) : null}
    </div>
  );
}

/**
 * What a card shows when no artwork exists: a catalog slip with the card's
 * identity on a quiet card-stock pattern, labelled so it is never mistaken
 * for the card's real face.
 */
function ArtSlip({ card }: { card: CardArtSource }) {
  return (
    <div
      className="art-slip flex h-full w-full flex-col justify-between p-[9%] text-left"
      role="img"
      aria-label={`${card.name}: no artwork on file`}
    >
      <span className="flex items-center justify-between font-mono text-[10px] text-ink-muted">
        <span>{card.number ? `#${card.number}` : ''}</span>
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 opacity-60" aria-hidden>
          <rect
            x="2.5"
            y="1.5"
            width="9"
            height="12.5"
            rx="1.6"
            fill="none"
            stroke="currentColor"
          />
          <rect
            x="4.5"
            y="3.5"
            width="9"
            height="11"
            rx="1.6"
            fill="none"
            stroke="currentColor"
            opacity=".5"
          />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[clamp(11px,1.05vw,15px)] font-semibold leading-tight text-ink-primary">
          {card.name}
        </span>
        {card.set?.name ? (
          <span className="mt-0.5 block truncate text-[10px] leading-tight text-ink-muted">
            {card.set.name}
          </span>
        ) : null}
      </span>
      <span className="self-start rounded-full border border-rule-strong px-1.5 py-px text-[9.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">
        No artwork
      </span>
    </div>
  );
}
