import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CardArt, type CardArtSource } from './CardArt';
import { cn } from '@/lib/utils';

export type CardTileDensity = 'tile' | 'compact' | 'row';

/**
 * One card, three densities:
 * - `tile`: art first, then name, set line and figures (catalog, movers).
 * - `compact`: smaller art with the figure under it (strips, briefs).
 * - `row`: a ledger row with a thumbnail, identity on the left and
 *   figures right-aligned (lists, tables on phones).
 *
 * Badges never sit on top of the name: they go in `aside`, which renders in
 * its own line (tile/compact) or column (row).
 */
export function CardTile({
  card,
  to,
  onSelect,
  density = 'tile',
  meta,
  figure,
  aside,
  className,
  priority,
}: {
  card: CardArtSource;
  to?: string;
  onSelect?: () => void;
  density?: CardTileDensity;
  /** Secondary identity line. Defaults to set name and number. */
  meta?: ReactNode;
  /** Main figure (usually a <Price/>), right-aligned in rows. */
  figure?: ReactNode;
  /** Change, score or status shown beside the figure. */
  aside?: ReactNode;
  className?: string;
  priority?: boolean;
}) {
  const metaLine =
    meta ?? [card.set?.name, card.number ? `#${card.number}` : null].filter(Boolean).join(' · ');
  const label = `${card.name}${card.set?.name ? `, ${card.set.name}` : ''}`;

  const body =
    density === 'row' ? (
      <>
        <span className="w-9 shrink-0 sm:w-10">
          <CardArt card={card} flat alt="" priority={priority} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink-primary group-hover:underline">
            {card.name}
          </span>
          {metaLine ? (
            <span className="block truncate text-meta text-ink-muted">{metaLine}</span>
          ) : null}
        </span>
        {figure || aside ? (
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
            {figure}
            {aside}
          </span>
        ) : null}
      </>
    ) : (
      <>
        <CardArt card={card} alt="" priority={priority} />
        <span className={cn('block min-w-0', density === 'compact' ? 'mt-1.5' : 'mt-2.5')}>
          <span
            className={cn(
              'block truncate font-medium text-ink-primary group-hover:underline',
              density === 'compact' ? 'text-[12.5px]' : 'text-[13.5px]'
            )}
            title={card.name}
          >
            {card.name}
          </span>
          {density === 'tile' && metaLine ? (
            <span className="block truncate text-meta text-ink-muted">{metaLine}</span>
          ) : null}
          {figure || aside ? (
            <span className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              {figure}
              {aside}
            </span>
          ) : null}
        </span>
      </>
    );

  const cls = cn(
    'group min-w-0 text-left',
    density === 'row' ? 'flex items-center gap-3 py-2' : 'block',
    className
  );
  if (to)
    return (
      <Link to={to} className={cls} aria-label={label}>
        {body}
      </Link>
    );
  if (onSelect)
    return (
      <button type="button" onClick={onSelect} className={cn(cls, 'w-full')} aria-label={label}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}
