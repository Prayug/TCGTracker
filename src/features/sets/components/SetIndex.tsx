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
import { ERA_TONE, ERA_ALIASES, tone } from '../eraTone';
import { FilterChip } from '../../../components/layout/PageShell';
import { motion } from 'motion/react';
import { Unavailable } from '../../../components/exchange/Price';
import { groupSetsByEra } from '../../../utils/setEra';
import { cn } from '@/lib/utils';

interface SetIndexProps {
  onSelectSet: (setId: string) => void;
}

type AnySet = PokemonSet | OnePieceSet;

function isPokemonSet(s: AnySet): s is PokemonSet {
  return 'releaseDate' in s || 'images' in s;
}

function yearOf(s: AnySet): number | null {
  if (!isPokemonSet(s)) return null;
  const y = Number(String(s.releaseDate ?? '').slice(0, 4));
  return Number.isFinite(y) && y > 1990 ? y : null;
}

/** A set as a designed cover: era colour field, the real logo, year, and how much of it you own. */
function SetCover({
  set,
  era,
  owned,
  pinned,
  isPokemon,
  onSelect,
  onTogglePin,
}: {
  set: AnySet;
  era: string;
  owned: number;
  pinned: boolean;
  isPokemon: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const total = set.total ?? 0;
  const pct = total > 0 ? Math.min(100, (owned / total) * 100) : 0;
  const t = tone(era);
  const year = yearOf(set);
  const logo = isPokemonSet(set) ? set.images?.logo || set.images?.symbol : undefined;
  return (
    <article className="group relative">
      <button
        type="button"
        onClick={onSelect}
        className="relative flex aspect-[4/3] w-full flex-col justify-between overflow-hidden rounded-2xl p-4 text-left text-white transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-1 active:scale-[0.99]"
        style={{ background: `radial-gradient(120% 90% at 80% 0%, ${t.from}, ${t.to})` }}
        aria-label={`${set.name}${year ? `, ${year}` : ''}${total ? `, ${owned} of ${total} owned` : ''}`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.035)_0_2px,transparent_2px_9px)]"
        />
        <span className="relative flex items-start justify-between gap-2 font-mono text-[11px] text-white/65">
          <span>{year ?? set.id}</span>
          <span>{total ? `${total} cards` : ''}</span>
        </span>
        <span className="relative grid flex-1 place-items-center py-2">
          {logo ? (
            <img
              src={logo}
              alt=""
              loading="lazy"
              className="max-h-[4.5rem] w-auto max-w-[82%] object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.45)] transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.06]"
              onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
            />
          ) : (
            <span className="font-display text-[22px] font-semibold leading-tight text-white/90">
              {set.name}
            </span>
          )}
        </span>
        <span className="relative">
          <span className="block truncate text-[14.5px] font-semibold">{set.name}</span>
          {total > 0 ? (
            <span className="mt-1.5 flex items-center gap-2">
              <span
                className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"
                aria-hidden
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--holo)' : t.accent }}
                />
              </span>
              <span className="font-mono text-[11.5px] tabular-nums text-white/75">
                {owned > 0 ? `${owned}/${total}` : 'none yet'}
              </span>
            </span>
          ) : null}
        </span>
      </button>
      {isPokemon ? (
        <button
          type="button"
          onClick={onTogglePin}
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${set.name}` : `Pin ${set.name}`}
          className={cn(
            'absolute right-2.5 top-8 grid h-8 w-8 place-items-center rounded-full bg-black/30 backdrop-blur transition-opacity hover:bg-black/50',
            pinned
              ? 'text-[#f0bd55]'
              : 'text-white/80 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100'
          )}
        >
          <Star className="h-4 w-4" fill={pinned ? 'currentColor' : 'none'} aria-hidden />
        </button>
      ) : null}
    </article>
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
  const eraParam = params.get('era') ?? 'all';
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

  const eraSet = ERA_ALIASES[eraParam] ?? (eraParam !== 'all' ? [eraParam] : null);
  const shownGroups = eraSet ? groups.filter((g) => eraSet.includes(g.era)) : groups;
  const timeline = useMemo(() => {
    const all = isPokemon ? groupSetsByEra(sets as PokemonSet[]) : [];
    return all
      .map((g) => {
        const years = g.sets.map(yearOf).filter((y): y is number => y != null);
        return {
          era: g.era,
          label: g.label,
          count: g.sets.length,
          from: years.length ? Math.min(...years) : null,
          to: years.length ? Math.max(...years) : null,
          started: g.sets.filter((x) => (ownedBySet.get(x.id) ?? 0) > 0).length,
        };
      })
      .sort((a, b) => (a.from ?? 9999) - (b.from ?? 9999));
  }, [sets, isPokemon, ownedBySet]);

  const togglePin = (id: string) => {
    setWishlistService.togglePinnedSet(id);
    setPinTick((t) => t + 1);
  };

  const startedCount = ownedBySet.size;

  const activeTone = tone(
    eraSet && eraSet.length === 1 ? eraSet[0] : eraParam === 'all' ? 'all' : (eraSet?.[0] ?? 'all')
  );

  return (
    <div className="space-y-8">
      <section
        data-theme="dark"
        aria-labelledby="sets-h"
        className="relative overflow-hidden rounded-3xl p-5 text-white transition-[background] duration-500 sm:p-8"
        style={{
          background: `radial-gradient(90% 120% at 85% 0%, ${activeTone.from}, #0b0e14 70%)`,
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1
              id="sets-h"
              className="font-display text-[clamp(2.2rem,4.6vw,3.8rem)] font-semibold leading-[0.95] tracking-[-0.03em]"
            >
              {isPokemon ? 'Every set, every era' : 'One Piece sets'}
            </h1>
            <p className="mt-2 text-[15px] text-white/70">
              {sets.length ? `${sets.length} sets` : 'Loading the archive'}
              {startedCount ? ` · you have started ${startedCount}` : ''}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
            <div className="relative min-w-[12rem] flex-1 lg:w-72 lg:flex-none">
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
                className="input h-11 w-full rounded-xl pl-9"
              />
            </div>
            {isPokemon ? (
              <>
                <FilterChip
                  active={view === 'started'}
                  onClick={() => setParam('show', view === 'started' ? 'all' : 'started')}
                >
                  Started
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
        </div>

        {isPokemon && timeline.length ? (
          <nav aria-label="Eras" className="relative mt-8">
            <div aria-hidden className="absolute inset-x-0 top-[1.15rem] h-px bg-white/20" />
            <ol className="scrollbar-none relative flex gap-2 overflow-x-auto pb-2">
              <li className="shrink-0">
                <EraStop
                  label="All eras"
                  years={null}
                  count={sets.length}
                  active={eraParam === 'all'}
                  color={ERA_TONE.all.accent}
                  onClick={() => setParam('era', 'all')}
                />
              </li>
              {timeline.map((t) => (
                <li key={t.era} className="shrink-0">
                  <EraStop
                    label={t.label}
                    years={
                      t.from
                        ? t.from === t.to
                          ? `${t.from}`
                          : `${t.from}–${String(t.to).slice(2)}`
                        : null
                    }
                    count={t.count}
                    started={t.started}
                    active={eraSet?.includes(t.era) ?? false}
                    color={tone(t.era).accent}
                    onClick={() => setParam('era', t.era)}
                  />
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
      </section>

      {isLoading ? (
        <div
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
          aria-busy="true"
        >
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[4/3] rounded-2xl" />
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
      ) : filtered.length === 0 || shownGroups.length === 0 ? (
        <Unavailable title={sets.length ? 'No sets match' : 'The set catalog is empty'}>
          {sets.length
            ? view === 'started'
              ? 'You don’t own a card from any set yet. Add cards to your vault to track progress.'
              : 'Try another name, era or clear the filter.'
            : 'The backend has not synced any sets yet.'}
        </Unavailable>
      ) : (
        <div className="space-y-12">
          {shownGroups.map((g) => {
            const t = tone(g.era);
            return (
              <section key={g.era} aria-labelledby={`era-${g.era}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2
                    id={`era-${g.era}`}
                    className="flex items-center gap-3 font-display text-[clamp(1.4rem,2.4vw,1.9rem)] font-semibold tracking-[-0.02em]"
                  >
                    <span
                      aria-hidden
                      className="h-3 w-3 rounded-full"
                      style={{ background: t.accent, boxShadow: `0 0 0 4px ${t.from}55` }}
                    />
                    {g.label}
                  </h2>
                  <span className="font-mono text-[12.5px] text-ink-muted">
                    {g.sets.length} set{g.sets.length === 1 ? '' : 's'}
                  </span>
                </div>
                <motion.ul
                  layout
                  className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
                >
                  {g.sets.map((st) => (
                    <motion.li
                      key={`${st.id}::${st.name}`}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <SetCover
                        set={st}
                        era={g.era}
                        owned={ownedBySet.get(st.id) ?? 0}
                        pinned={pinnedIds.has(st.id)}
                        isPokemon={isPokemon}
                        onSelect={() => onSelectSet(st.id)}
                        onTogglePin={() => togglePin(st.id)}
                      />
                    </motion.li>
                  ))}
                </motion.ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

function EraStop({
  label,
  years,
  count,
  started = 0,
  active,
  color,
  onClick,
}: {
  label: string;
  years: string | null;
  count: number;
  started?: number;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group relative flex min-w-[7.5rem] flex-col items-start rounded-xl px-3 pb-2.5 pt-8 text-left transition-colors',
        active ? 'bg-white/12' : 'hover:bg-white/5'
      )}
    >
      <span aria-hidden className="absolute left-3 top-3 grid h-3 w-3 place-items-center">
        <span
          className="h-3 w-3 rounded-full ring-4 ring-[#0b0e14] transition-transform group-hover:scale-125"
          style={{ background: color }}
        />
      </span>
      {active ? (
        <motion.span
          layoutId="era-active"
          aria-hidden
          className="absolute inset-0 rounded-xl border border-white/30"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      ) : null}
      <span className="whitespace-nowrap text-[13.5px] font-semibold">{label}</span>
      <span className="whitespace-nowrap font-mono text-[11px] text-white/60">
        {years ? `${years} · ` : ''}
        {count} set{count === 1 ? '' : 's'}
        {started ? ` · ${started} started` : ''}
      </span>
    </button>
  );
}
