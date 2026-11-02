import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Download, PackageCheck, Search, Trash2 } from 'lucide-react';
import {
  cardWishlistService,
  type WishlistItem,
  type WishlistPriority,
} from '../../../services/cardWishlistService';
import type { PokemonCard } from '../../../types/pokemon';
import { useGame } from '../../../contexts/GameContext';
import { useCardModal } from '../../../contexts/CardModalContext';
import { useToast } from '../../../components/common/Toast';
import { getCardPrice } from '../../../utils/cardPrice';
import { formatCurrency } from '../../../utils/cardDisplay';
import { PageHeader, PageShell, FilterChip } from '../../../components/layout/PageShell';
import { CardArt } from '../../../components/exchange/CardArt';
import { Price, Unavailable } from '../../../components/exchange/Price';
import { AddToVaultModal } from '../../vault/components/AddToVaultModal';
import { useLivePrices } from '../useLivePrices';
import {
  PRIORITY_LABEL,
  WISH_SORTS,
  buildRows,
  filterRows,
  knownPrice,
  parseTargetInput,
  sortRows,
  summarize,
  type WishRow,
  type WishShow,
  type WishSort,
} from '../wishlistModel';
import { cn } from '@/lib/utils';

const SHOWS: { id: WishShow; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'at-target', label: 'At target' },
  { id: 'no-target', label: 'No target yet' },
  { id: 'high', label: 'High priority' },
];

function shortDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

/** Where the market figure came from, in a few words. */
function basisLabel(row: WishRow, checking: boolean): string {
  if (row.basis === 'live') {
    const d = shortDate(row.asOf);
    return d ? `Market · ${d}` : 'Market today';
  }
  if (checking) return 'Checking today’s price…';
  const d = shortDate(row.asOf);
  return d ? `Saved when added, ${d}` : 'Saved when added';
}

/** What the target means right now. */
function StatusText({ row, onSetTarget }: { row: WishRow; onSetTarget: () => void }) {
  switch (row.status) {
    case 'at-target':
      return (
        <span className="font-medium text-gain">
          <Check className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
          At target
          {row.gap != null && row.gap < 0 ? (
            <span className="font-normal"> · {formatCurrency(-row.gap)} under</span>
          ) : null}
        </span>
      );
    case 'above':
      return (
        <span className="text-ink-secondary">
          <span className="font-mono tabular-nums">{formatCurrency(row.gap ?? 0)}</span> above
        </span>
      );
    case 'no-price':
      return <span className="text-ink-muted">No price to compare</span>;
    default:
      return (
        <button type="button" onClick={onSetTarget} className="text-accent hover:underline">
          Set a target
        </button>
      );
  }
}

/** Inline target editor. Blank clears the target; zero or negative is refused. */
function TargetInput({
  item,
  game,
  inputRef,
}: {
  item: WishlistItem;
  game: 'pokemon' | 'onepiece';
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  const current = knownPrice(item.targetPrice);
  const [value, setValue] = useState(current != null ? current.toFixed(2) : '');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setValue(current != null ? current.toFixed(2) : '');
    setInvalid(false);
  }, [current]);

  const commit = () => {
    const parsed = parseTargetInput(value);
    if (parsed === undefined) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (parsed === current) return;
    cardWishlistService.update(item.id, { targetPrice: parsed ?? undefined }, game);
  };

  return (
    <span className="relative inline-block">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[12.5px] text-ink-muted">
        $
      </span>
      <input
        ref={inputRef}
        inputMode="decimal"
        value={value}
        placeholder="None"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setValue(current != null ? current.toFixed(2) : '');
            setInvalid(false);
          }
        }}
        aria-label={`Target price for ${item.card.name}`}
        aria-invalid={invalid || undefined}
        title={invalid ? 'Enter a price above zero, or leave blank for no target' : undefined}
        className={cn(
          'input h-8 w-[6.5rem] pl-5 text-right font-mono text-[13px] tabular-nums',
          invalid && 'border-loss'
        )}
      />
    </span>
  );
}

function PrioritySelect({ item, game }: { item: WishlistItem; game: 'pokemon' | 'onepiece' }) {
  return (
    <select
      value={item.priority}
      onChange={(e) =>
        cardWishlistService.update(item.id, { priority: e.target.value as WishlistPriority }, game)
      }
      aria-label={`Priority for ${item.card.name}`}
      className="input h-8 w-[6.5rem] py-0 text-[13px]"
    >
      {(['high', 'medium', 'low'] as const).map((p) => (
        <option key={p} value={p}>
          {PRIORITY_LABEL[p]}
        </option>
      ))}
    </select>
  );
}

export const WishlistView: React.FC = () => {
  const { game, isPokemon } = useGame();
  const { openCard } = useCardModal();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const show = (SHOWS.find((s) => s.id === params.get('show'))?.id ?? 'all') as WishShow;
  const sort = (WISH_SORTS.find((s) => s.id === params.get('sort'))?.id ?? 'priority') as WishSort;
  const view = params.get('view') === 'wall' ? 'wall' : 'list';
  const q = params.get('q') ?? '';
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [buying, setBuying] = useState<WishlistItem | null>(null);
  const targetRefs = useRef(new Map<string, HTMLInputElement | null>());

  const setParam = (k: string, v: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v) next.set(k, v);
        else next.delete(k);
        return next;
      },
      { replace: true }
    );

  const load = useCallback(() => setItems(cardWishlistService.getItems(game)), [game]);
  useEffect(() => {
    load();
    window.addEventListener('tcg:wishlist-updated', load);
    return () => window.removeEventListener('tcg:wishlist-updated', load);
  }, [load]);

  const { prices, loading } = useLivePrices(items, game);
  const rows = useMemo(
    () => buildRows(items, prices, (i) => knownPrice(getCardPrice(i.card))),
    [items, prices]
  );
  const summary = useMemo(() => summarize(rows), [rows]);
  const visible = useMemo(() => sortRows(filterRows(rows, show, q), sort), [rows, show, q, sort]);
  const liveCount = rows.filter((r) => r.basis === 'live').length;

  const focusTarget = (id: string) => {
    if (view === 'wall') setParam('view', null);
    requestAnimationFrame(() => {
      const wide = targetRefs.current.get(id);
      (wide && wide.offsetParent ? wide : targetRefs.current.get(`m:${id}`))?.focus();
    });
  };

  const handleExport = () => {
    const csv = cardWishlistService.exportCsv(game);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tcg-wishlist-${game}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = (item: WishlistItem) => {
    cardWishlistService.remove(item.card.id, game);
    showToast(`Removed ${item.card.name} from your wishlist`, 'info');
  };

  return (
    <PageShell>
      <PageHeader
        title="Wishlist"
        meta={
          items.length
            ? `${items.length} ${isPokemon ? 'Pokémon' : 'One Piece'} card${items.length === 1 ? '' : 's'}`
            : undefined
        }
        actions={
          <button
            type="button"
            onClick={handleExport}
            disabled={items.length === 0}
            className="btn-secondary"
          >
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </button>
        }
      />

      {items.length === 0 ? (
        <Unavailable
          title="Your wishlist is empty"
          action={
            <Link to="/browse" className="btn-primary">
              <Search className="h-4 w-4" aria-hidden />
              Browse the catalog
            </Link>
          }
        >
          Add cards from the catalog or any card page. Give each one a target price and it will show
          up on Home when the market reaches it.
        </Unavailable>
      ) : (
        <>
          <dl className="grid gap-x-8 gap-y-4 border-b border-rule pb-5 sm:grid-cols-3">
            <div>
              <dt className="text-meta text-ink-muted">To buy everything now</dt>
              <dd className="mt-1">
                <Price value={summary.priced ? summary.costAll : null} size="lg" />
                <p className="mt-1 text-[12px] text-ink-muted">
                  {summary.priced === summary.total
                    ? `All ${summary.total} cards priced`
                    : `${summary.priced} of ${summary.total} cards priced; unpriced cards are not counted`}
                </p>
              </dd>
            </div>
            <div>
              <dt className="text-meta text-ink-muted">At or under your target</dt>
              <dd className="mt-1">
                <span className="font-mono text-[28px] leading-none tracking-[-0.025em] tabular-nums">
                  {summary.atTarget}
                </span>
                <span className="ml-1.5 text-[13px] text-ink-muted">
                  of {summary.withTarget} with a target
                </span>
                <p className="mt-1 text-[12px] text-ink-muted">
                  {summary.atTarget
                    ? `${formatCurrency(summary.costAtTarget)} to buy them all`
                    : summary.withTarget
                      ? 'None have reached their target yet'
                      : 'Set targets to be told when a card is in reach'}
                </p>
              </dd>
            </div>
            <div>
              <dt className="text-meta text-ink-muted">Prices</dt>
              <dd className="mt-1 text-[13px] text-ink-secondary">
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
                      aria-hidden
                    />
                    Checking today’s prices…
                  </span>
                ) : liveCount === rows.length ? (
                  'Checked against today’s market for every card.'
                ) : (
                  `Checked today for ${liveCount} of ${rows.length}. The rest show the price saved when you added them.`
                )}
              </dd>
            </div>
          </dl>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1">
                <label htmlFor="wish-q" className="sr-only">
                  Search wishlist
                </label>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                  aria-hidden
                />
                <input
                  id="wish-q"
                  type="search"
                  value={q}
                  onChange={(e) => setParam('q', e.target.value || null)}
                  placeholder="Search by card or set"
                  className="input h-10 w-full pl-9"
                />
              </div>
              <label className="sr-only" htmlFor="wish-sort">
                Sort
              </label>
              <select
                id="wish-sort"
                value={sort}
                onChange={(e) =>
                  setParam('sort', e.target.value === 'priority' ? null : e.target.value)
                }
                className="input h-10 w-auto"
              >
                {WISH_SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div className="segmented" role="group" aria-label="Layout">
                <button
                  type="button"
                  aria-pressed={view === 'list'}
                  onClick={() => setParam('view', null)}
                >
                  List
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'wall'}
                  onClick={() => setParam('view', 'wall')}
                >
                  Wall
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SHOWS.map((s) => (
                <FilterChip
                  key={s.id}
                  active={show === s.id}
                  onClick={() => setParam('show', s.id === 'all' || show === s.id ? null : s.id)}
                >
                  {s.label}
                  {s.id === 'at-target' && summary.atTarget ? (
                    <span className="ml-1.5 font-mono text-[12px]">{summary.atTarget}</span>
                  ) : null}
                </FilterChip>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <Unavailable title="Nothing matches">
              {show === 'at-target'
                ? 'No card is at or under its target right now.'
                : 'Try another search or clear the filter.'}
            </Unavailable>
          ) : view === 'wall' ? (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {visible.map((row) => (
                <li key={row.item.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openCard(row.item.card)}
                    className="block w-full rounded-[4.6%/3.3%] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={`Open ${row.item.card.name}`}
                  >
                    <CardArt
                      card={row.item.card}
                      className={cn(
                        row.status === 'at-target' &&
                          'ring-2 ring-gain ring-offset-2 ring-offset-surface-base'
                      )}
                    />
                  </button>
                  <p className="mt-2 truncate text-[13.5px] font-medium" title={row.item.card.name}>
                    {row.item.card.name}
                  </p>
                  <p className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <Price value={row.market} size="sm" />
                    <span className="text-ink-muted">
                      {knownPrice(row.item.targetPrice) != null
                        ? `target ${formatCurrency(row.item.targetPrice ?? 0)}`
                        : PRIORITY_LABEL[row.item.priority].toLowerCase()}
                    </span>
                  </p>
                  <p className="text-[12.5px]">
                    <StatusText row={row} onSetTarget={() => focusTarget(row.item.id)} />
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <table className="ledger ledger-tight">
              <caption className="sr-only">Wishlist cards</caption>
              <thead>
                <tr>
                  <th scope="col">Card</th>
                  <th scope="col" className="hidden md:table-cell">
                    Priority
                  </th>
                  <th scope="col" className="num">
                    Market
                  </th>
                  <th scope="col" className="num hidden sm:table-cell">
                    Target
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Status
                  </th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <Fragment key={row.item.id}>
                    <tr className="group max-sm:[&>*]:border-b-0">
                      <th scope="row" className="text-left font-normal">
                        <span className="flex items-center gap-3">
                          <span className="w-9 shrink-0">
                            <CardArt card={row.item.card} flat />
                          </span>
                          <span className="min-w-0">
                            <button
                              type="button"
                              onClick={() => openCard(row.item.card)}
                              className="block max-w-[38vw] truncate text-left font-medium hover:underline sm:max-w-[22rem]"
                            >
                              {row.item.card.name}
                            </button>
                            <span className="block max-w-[38vw] truncate text-[12px] text-ink-muted sm:max-w-[22rem]">
                              {row.item.card.set?.name}
                              {row.item.card.number ? ` · ${row.item.card.number}` : ''}
                            </span>
                            {/* Compact status where the column is hidden. */}
                            <span className="block text-[12px] lg:hidden">
                              <StatusText row={row} onSetTarget={() => focusTarget(row.item.id)} />
                            </span>
                          </span>
                        </span>
                      </th>
                      <td className="hidden md:table-cell">
                        <PrioritySelect item={row.item} game={game} />
                      </td>
                      <td className="num">
                        <Price value={row.market} size="sm" />
                        <span
                          className={cn(
                            'block text-[11.5px] font-sans',
                            row.basis === 'saved' && !loading ? 'text-warn' : 'text-ink-muted'
                          )}
                        >
                          {basisLabel(row, loading)}
                        </span>
                      </td>
                      <td className="num hidden sm:table-cell">
                        <TargetInput
                          item={row.item}
                          game={game}
                          inputRef={(el) => targetRefs.current.set(row.item.id, el)}
                        />
                      </td>
                      <td className="hidden text-[13px] lg:table-cell">
                        <StatusText row={row} onSetTarget={() => focusTarget(row.item.id)} />
                      </td>
                      <td className="hidden w-px whitespace-nowrap pl-0 text-right sm:table-cell">
                        <span className="inline-flex gap-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => setBuying(row.item)}
                            className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
                            aria-label={`I bought ${row.item.card.name}: move it to the vault`}
                            title="Bought it: move to vault"
                          >
                            <PackageCheck className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(row.item)}
                            className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-loss-muted hover:text-loss"
                            aria-label={`Remove ${row.item.card.name} from wishlist`}
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </span>
                      </td>
                    </tr>
                    {/* Phones: edit priority and target on a row of their own. */}
                    <tr className="sm:hidden">
                      <td colSpan={6} className="pt-0">
                        <span className="flex items-center gap-1.5 pl-12">
                          <PrioritySelect item={row.item} game={game} />
                          <TargetInput
                            item={row.item}
                            game={game}
                            inputRef={(el) => targetRefs.current.set(`m:${row.item.id}`, el)}
                          />
                          <span className="inline-flex gap-1 ml-auto">
                            <button
                              type="button"
                              onClick={() => setBuying(row.item)}
                              className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
                              aria-label={`I bought ${row.item.card.name}: move it to the vault`}
                              title="Bought it: move to vault"
                            >
                              <PackageCheck className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(row.item)}
                              className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-loss-muted hover:text-loss"
                              aria-label={`Remove ${row.item.card.name} from wishlist`}
                              title="Remove"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </span>
                        </span>
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <AddToVaultModal
        card={(buying?.card as PokemonCard | undefined) ?? null}
        isOpen={buying != null}
        onClose={() => setBuying(null)}
        onSuccess={() => {
          if (buying) {
            cardWishlistService.remove(buying.card.id, game);
            showToast(`${buying.card.name} moved from your wishlist to the vault`, 'success');
          }
          setBuying(null);
        }}
        game={game}
      />
    </PageShell>
  );
};
