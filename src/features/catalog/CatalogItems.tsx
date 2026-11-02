import { useEffect, useState } from 'react';
import { Heart, Plus } from 'lucide-react';
import type { PokemonCard } from '../../types/pokemon';
import { type AnyCard, getCardDeltaPct, isPokemonCard } from '../../utils/cardPrice';
import { cardWishlistService } from '../../services/cardWishlistService';
import { CardArt } from '../../components/exchange/CardArt';
import { HolographicCard } from '../../components/collectible/HolographicCard';
import { finishOf } from '../../components/collectible/finish';
import { Delta, Price } from '../../components/exchange/Price';
import { knownPrice } from './catalogFilters';
import { cn } from '@/lib/utils';

type Game = 'pokemon' | 'onepiece';

export interface CatalogItemActions {
  onOpen: (card: AnyCard) => void;
  onAdd: (card: AnyCard) => void;
  /** Quick preview that grows out of the tile (shared layout id). Falls back to onOpen. */
  onPreview?: (card: AnyCard, layoutId: string) => void;
}

function useWishlisted(card: AnyCard, game: Game) {
  const [on, setOn] = useState(() => cardWishlistService.isWishlisted(card.id, game));
  useEffect(() => {
    const sync = () => setOn(cardWishlistService.isWishlisted(card.id, game));
    sync();
    window.addEventListener('tcg:wishlist-updated', sync);
    return () => window.removeEventListener('tcg:wishlist-updated', sync);
  }, [card.id, game]);
  return [on, () => setOn(cardWishlistService.toggle(card as PokemonCard, game))] as const;
}

function weekMove(card: AnyCard): number | null {
  return isPokemonCard(card) ? getCardDeltaPct(card, '7d') : null;
}

function subtitle(card: AnyCard): string {
  return [card.set?.name, card.number ? `No. ${card.number}` : null].filter(Boolean).join(' · ');
}

/**
 * Collector grid tile: artwork first, then identity, then a mono price.
 * Actions sit under the price. On pointer devices they appear on hover or
 * focus; on touch they are always visible, since there is no hover.
 */
export function CatalogTile({
  card,
  game,
  onOpen,
  onAdd,
  onPreview,
  layoutId,
}: { card: AnyCard; game: Game; layoutId: string } & CatalogItemActions) {
  const [wished, toggleWish] = useWishlisted(card, game);
  const price = knownPrice(card);
  const move = weekMove(card);
  return (
    <article className="group relative min-w-0">
      <HolographicCard
        card={card as PokemonCard}
        layoutId={layoutId}
        level={finishOf(card as PokemonCard) === 'none' ? 'standard' : 'featured'}
        label={`${card.name}, ${subtitle(card)}`}
        onSelect={() => (onPreview ? onPreview(card, layoutId) : onOpen(card))}
      />
      <div className="mt-2.5 min-w-0">
        <p className="truncate text-[13.5px] font-medium leading-snug" title={card.name}>
          {card.name}
        </p>
        <p className="truncate text-meta text-ink-muted" title={subtitle(card)}>
          {subtitle(card)}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <Price value={price} size="sm" />
            {move != null ? <Delta pct={move} /> : null}
          </div>
          <div className="flex shrink-0 gap-0.5 transition-opacity duration-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
            <button
              type="button"
              onClick={toggleWish}
              aria-pressed={wished}
              aria-label={wished ? `Remove ${card.name} from wishlist` : `Wishlist ${card.name}`}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-md hover:bg-surface-hover',
                wished ? 'text-loss' : 'text-ink-secondary'
              )}
            >
              <Heart className="h-4 w-4" fill={wished ? 'currentColor' : 'none'} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onAdd(card)}
              aria-label={`Add ${card.name} to collection`}
              className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function CatalogGrid({
  cards,
  game,
  ...actions
}: { cards: AnyCard[]; game: Game } & CatalogItemActions) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 md:gap-x-7 lg:grid-cols-4 2xl:grid-cols-5">
      {cards.map((card, i) => (
        <li key={`${card.id}-${i}`} className="min-w-0">
          <CatalogTile card={card} game={game} layoutId={`cat-${card.id}-${i}`} {...actions} />
        </li>
      ))}
    </ul>
  );
}

function TableRow({
  card,
  game,
  onOpen,
  onAdd,
}: { card: AnyCard; game: Game } & CatalogItemActions) {
  const [wished, toggleWish] = useWishlisted(card, game);
  const d7 = weekMove(card);
  const d30 = isPokemonCard(card) ? getCardDeltaPct(card, '30d') : null;
  return (
    <tr className="group">
      <td className="w-12 pr-0">
        <span className="block w-9">
          <CardArt card={card} flat />
        </span>
      </td>
      <td className="max-w-[18rem]">
        <button
          type="button"
          onClick={() => onOpen(card)}
          className="block max-w-[34vw] truncate text-left font-medium hover:underline sm:max-w-[18rem]"
        >
          {card.name}
        </button>
        <span className="block max-w-[34vw] truncate text-meta text-ink-muted md:hidden">
          {subtitle(card)}
        </span>
      </td>
      <td className="hidden max-w-[14rem] truncate text-ink-secondary md:table-cell">
        {card.set?.name}
      </td>
      <td className="num hidden text-ink-secondary lg:table-cell">{card.number || '—'}</td>
      <td className="hidden max-w-[10rem] truncate text-ink-secondary xl:table-cell">
        {card.rarity || '—'}
      </td>
      <td className="num">
        <Price value={knownPrice(card)} size="sm" />
      </td>
      <td className="num hidden sm:table-cell">
        <Delta pct={d7} />
      </td>
      <td className="num hidden lg:table-cell">
        <Delta pct={d30} />
      </td>
      <td className="w-[4.5rem] text-right">
        <span className="inline-flex">
          <button
            type="button"
            onClick={toggleWish}
            aria-pressed={wished}
            aria-label={wished ? `Remove ${card.name} from wishlist` : `Wishlist ${card.name}`}
            className={cn(
              'grid h-8 w-8 place-items-center rounded-md hover:bg-surface-hover',
              wished ? 'text-loss' : 'text-ink-muted'
            )}
          >
            <Heart className="h-4 w-4" fill={wished ? 'currentColor' : 'none'} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onAdd(card)}
            aria-label={`Add ${card.name} to collection`}
            className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </span>
      </td>
    </tr>
  );
}

/** Research list: a real table, so columns align and can be scanned. */
export function CatalogTable({
  cards,
  game,
  ...actions
}: { cards: AnyCard[]; game: Game } & CatalogItemActions) {
  const movement = game === 'pokemon';
  return (
    <div className="overflow-x-auto">
      <table className="ledger ledger-tight w-full">
        <caption className="sr-only">
          Catalog results. Market is the TCGplayer Near Mint market estimate; changes compare the
          Cardmarket trend with its own 7- and 30-day averages.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Artwork</span>
            </th>
            <th scope="col">Card</th>
            <th scope="col" className="hidden md:table-cell">
              Set
            </th>
            <th scope="col" className="num hidden lg:table-cell">
              No.
            </th>
            <th scope="col" className="hidden xl:table-cell">
              Rarity
            </th>
            <th scope="col" className="num">
              Market
            </th>
            <th scope="col" className="num hidden sm:table-cell">
              {movement ? 'vs 7d avg' : '7d'}
            </th>
            <th scope="col" className="num hidden lg:table-cell">
              {movement ? 'vs 30d avg' : '30d'}
            </th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card, i) => (
            <TableRow key={`${card.id}-${i}`} card={card} game={game} {...actions} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
