import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Star } from 'lucide-react';
import type { PokemonSet } from '../../../types/pokemon';
import type { OnePieceSet } from '../../../types/onepiece';
import { setTrackerService } from '../../../services/setTrackerService';
import { setWishlistService } from '../../../services/setWishlistService';
import { onePieceApi } from '../../../services/onepieceApi';
import { useGame } from '../../../contexts/GameContext';
import { useVault } from '../../../hooks/useVault';
import { PageHeader, FilterChip } from '../../../components/layout/PageShell';
import { Unavailable } from '../../../components/exchange/Price';
import { groupSetsByEra, formatReleaseYear } from '../../../utils/setEra';
import { SetLogo } from './SetLogo';
import { cn } from '@/lib/utils';

interface SetIndexProps {
  onSelectSet: (setId: string) => void;
}

type AnySet = PokemonSet | OnePieceSet;

function isPokemonSet(s: AnySet): s is PokemonSet {
  return 'releaseDate' in s || 'images' in s;
}

/** Owned count and share. Owned = distinct card numbers in the vault for this set. */
function Progress({ owned, total }: { owned: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (owned / total) * 100) : 0;
  return (
    <span className="flex items-center justify-end gap-2.5">
      <span className="font-mono text-[12.5px] tabular-nums text-ink-secondary">
        {owned > 0 ? `${owned} / ${total}` : '—'}
      </span>
      <span
        className="relative hidden h-1.5 w-20 overflow-hidden rounded-sm bg-surface-hover sm:block"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={`${Math.round(pct)}% of the set owned`}
      >
        <span
          className={cn('absolute inset-y-0 left-0', pct >= 100 ? 'bg-gold' : 'bg-ink-primary')}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

function SetRow({
  set,
  owned,
  pinned,
  isPokemon,
  onSelect,
  onTogglePin,
}: {
  set: AnySet;
  owned: number;
  pinned: boolean;
  isPokemon: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const total = set.total ?? 0;
  const year = isPokemonSet(set) ? formatReleaseYear(set.releaseDate) : undefined;
  return (
    <tr>
      <td className="w-14 pr-0">
        {isPokemonSet(set) ? (
          <SetLogo set={set} size="sm" className="rounded-md border-0 bg-transparent" />
        ) : (
          <span className="font-mono text-[11.5px] text-ink-muted">{set.id}</span>
        )}
      </td>
      <th scope="row" className="text-left font-normal">
        <button
          type="button"
          onClick={onSelect}
          className="block max-w-[52vw] truncate text-left font-medium hover:underline sm:max-w-none"
        >
          {set.name}
        </button>
        <span className="block font-mono text-[11.5px] uppercase text-ink-muted">
          {set.id}
          <span className="font-sans normal-case sm:hidden">{year ? ` · ${year}` : ''}</span>
        </span>
      </th>
      <td className="num hidden text-ink-secondary sm:table-cell">{year ?? '—'}</td>
      <td className="num hidden text-ink-secondary md:table-cell">{total || '—'}</td>
      <td className="num">{total > 0 ? <Progress owned={owned} total={total} /> : '—'}</td>
      <td className="w-10 pl-0 text-right">
        {isPokemon ? (
          <button
            type="button"
            onClick={onTogglePin}
            aria-pressed={pinned}
            aria-label={pinned ? `Unpin ${set.name}` : `Pin ${set.name}`}
            className={cn(
              'grid h-8 w-8 place-items-center rounded-md hover:bg-surface-hover',
              pinned ? 'text-gold' : 'text-ink-muted'
            )}
          >
            <Star className="h-4 w-4" fill={pinned ? 'currentColor' : 'none'} aria-hidden />
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function SetTable({ children, caption }: { children: React.ReactNode; caption: string }) {
  // Fixed layout so every era's table lines up column for column.
  return (
    <table className="ledger ledger-tight table-fixed">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="w-14">
            <span className="sr-only">Symbol</span>
          </th>
          <th scope="col">Set</th>
          <th scope="col" className="num hidden w-24 sm:table-cell">
            Released
          </th>
          <th scope="col" className="num hidden w-20 md:table-cell">
            Cards
          </th>
          <th scope="col" className="num w-28 sm:w-48">
            You own
          </th>
          <th scope="col" className="w-10">
            <span className="sr-only">Pin</span>
          </th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

/**
 * Set archive: an index you can scan, grouped by era, newest first. Owned
 * counts come from your vault (distinct card numbers), not estimates.
 */
export const SetIndex: React.FC<SetIndexProps> = ({ onSelectSet }) => {
  const { isPokemon, isOnePiece } = useGame();
  const { cards: vault } = useVault();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const view = params.get('show') ?? 'all';
  const [sets, setSets] = useState<AnySet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setPinTick] = useState(0);

  const setParam = (k: string, v: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v && v !== 'all') next.set(k, v);
        else next.delete(k);
        return next;
      },
      { replace: true }
    );

  const loadSets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setSets(isPokemon ? await setTrackerService.getSets() : await onePieceApi.getSets());
    } catch (e) {
      const msg = (e as Error).message || '';
      setError(
        /50[234]/.test(msg)
          ? 'The set catalog is temporarily unavailable.'
          : /fetch|network/i.test(msg)
            ? 'Could not reach the server. Check your connection.'
            : msg || 'The set catalog did not load.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [isPokemon]);

  useEffect(() => {
    void loadSets();
  }, [loadSets, isOnePiece]);

  const ownedBySet = useMemo(() => {
    const map = new Map<string, number>();
    if (!isPokemon) return map;
    for (const s of sets) {
      if (!isPokemonSet(s) || !s.total) continue;
      const pct = setTrackerService.getCompletionForSet(s.id, s.name, s.total);
      if (pct > 0) map.set(s.id, Math.round((pct / 100) * s.total));
    }
    return map;
    // vault in deps: recompute when holdings change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets, vault, isPokemon]);

  const pinnedIds = isPokemon ? new Set(setWishlistService.getPinnedSets()) : new Set<string>();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sets.filter((s) => {
      if (q) {
        const hay =
          `${s.name} ${s.id} ${isPokemonSet(s) ? `${s.series ?? ''} ${s.eraLabel ?? ''}` : ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (view === 'pinned' && !setWishlistService.isPinned(s.id)) return false;
      if (view === 'started' && !(ownedBySet.get(s.id) ?? 0)) return false;
      return true;
    });
  }, [sets, search, view, ownedBySet]);

  const groups = useMemo(
    () =>
      isPokemon
        ? groupSetsByEra(filtered as PokemonSet[])
        : [{ era: 'all', label: 'All sets', sets: filtered as PokemonSet[] }],
    [filtered, isPokemon]
  );

  const togglePin = (id: string) => {
    setWishlistService.togglePinnedSet(id);
    setPinTick((t) => t + 1);
  };

  const startedCount = ownedBySet.size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sets"
        meta={
          sets.length
            ? `${sets.length} ${isPokemon ? 'Pokémon' : 'One Piece'} sets${startedCount ? ` · ${startedCount} started` : ''}`
            : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <label htmlFor="set-q" className="sr-only">
            Search sets
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
          <input
            id="set-q"
            type="search"
            value={search}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="Search by set name, code or series"
            className="input h-10 w-full pl-9"
          />
        </div>
        {isPokemon ? (
          <>
            <FilterChip
              active={view === 'started'}
              onClick={() => setParam('show', view === 'started' ? 'all' : 'started')}
            >
              Sets I’ve started
            </FilterChip>
            <FilterChip
              active={view === 'pinned'}
              onClick={() => setParam('show', view === 'pinned' ? 'all' : 'pinned')}
            >
              Pinned
              {pinnedIds.size ? (
                <span className="ml-1.5 font-mono text-[12px]">{pinnedIds.size}</span>
              ) : null}
            </FilterChip>
          </>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-12 rounded" />
          ))}
        </div>
      ) : error ? (
        <Unavailable title="Sets did not load">
          {error}{' '}
          <button
            type="button"
            onClick={() => void loadSets()}
            className="text-accent hover:underline"
          >
            Try again
          </button>
        </Unavailable>
      ) : filtered.length === 0 ? (
        <Unavailable title={sets.length ? 'No sets match' : 'The set catalog is empty'}>
          {sets.length
            ? view === 'started'
              ? 'You don’t own a card from any set yet. Add cards to your vault to track progress.'
              : 'Try another name or clear the filter.'
            : 'The backend has not synced any sets yet.'}
        </Unavailable>
      ) : (
        <div className="space-y-10">
          {groups.map((g) => (
            <section key={g.era} aria-labelledby={`era-${g.era}`}>
              <div className="sticky top-[96px] z-10 flex items-baseline justify-between gap-2 border-b border-rule-strong bg-surface-base pb-2 pt-2 md:top-[var(--header-h)]">
                <h2
                  id={`era-${g.era}`}
                  className="font-display text-[22px] font-medium leading-tight"
                >
                  {g.label}
                </h2>
                <span className="font-mono text-[12px] text-ink-muted">
                  {g.sets.length} set{g.sets.length === 1 ? '' : 's'}
                </span>
              </div>
              <SetTable caption={`${g.label} sets`}>
                {g.sets.map((s) => (
                  <SetRow
                    key={`${s.id}::${s.name}`}
                    set={s}
                    owned={ownedBySet.get(s.id) ?? 0}
                    pinned={pinnedIds.has(s.id)}
                    isPokemon={isPokemon}
                    onSelect={() => onSelectSet(s.id)}
                    onTogglePin={() => togglePin(s.id)}
                  />
                ))}
              </SetTable>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
