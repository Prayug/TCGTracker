import { useState } from 'react';
import { proxyImageUrl } from '../../utils/cardDisplay';
import { cn } from '@/lib/utils';

/** Known placeholder/back images that must never be shown as a card front. */
const CARD_BACK_PATTERNS = [
  /card-?back/i,
  /cardback/i,
  /op-leader-back/i,
  /\/back\.(png|jpe?g|webp)/i,
];

export function isCardBackImage(url: string | null | undefined): boolean {
  if (!url) return false;
  return CARD_BACK_PATTERNS.some((re) => re.test(url));
}

export interface CardArtSource {
  name: string;
  images?: { small?: string; large?: string } | null;
  number?: string | null;
  set?: { name?: string | null } | null;
}

/**
 * Physical-card art frame. Real 63×88 proportions and corner radius.
 * When artwork is unavailable (no URL, a load error, or the URL is a card
 * back) it renders a labelled catalog slip instead of a misleading image.
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
  const primary =
    size === 'large'
      ? card.images?.large || card.images?.small
      : card.images?.small || card.images?.large;
  const fallback = size === 'large' ? card.images?.small : card.images?.large;
  const [src, setSrc] = useState<string | undefined>(() =>
    isCardBackImage(primary) ? undefined : proxyImageUrl(primary)
  );
  const [failed, setFailed] = useState(false);
  const [seen, setSeen] = useState(primary);
  if (seen !== primary) {
    // A different card (or enriched images) arrived: start over.
    setSeen(primary);
    setSrc(isCardBackImage(primary) ? undefined : proxyImageUrl(primary));
    setFailed(false);
  }

  const showSlip = !src || failed;

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
          src={src}
          alt={
            alt ??
            `${card.name}${card.set?.name ? `, ${card.set.name}` : ''}${card.number ? ` #${card.number}` : ''}`
          }
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className={cn('h-full w-full object-cover', imgClassName)}
          onError={() => {
            const next = proxyImageUrl(fallback);
            if (next && next !== src && !isCardBackImage(fallback)) setSrc(next);
            else setFailed(true);
          }}
        />
      ) : (
        <div
          className="flex h-full w-full flex-col justify-between border border-dashed border-border-strong bg-surface-inset p-[8%] text-left"
          role="img"
          aria-label={`${card.name}: artwork unavailable`}
        >
          <span className="font-mono text-[10px] text-ink-muted">
            {card.number ? `No. ${card.number}` : 'No number'}
          </span>
          <span>
            <span className="block font-display text-[clamp(11px,1.1vw,15px)] leading-tight text-ink-secondary">
              {card.name}
            </span>
            {card.set?.name ? (
              <span className="mt-0.5 block text-[10px] leading-tight text-ink-muted">
                {card.set.name}
              </span>
            ) : null}
          </span>
          <span className="text-[10px] italic text-ink-muted">Artwork unavailable</span>
        </div>
      )}
    </div>
  );
}
