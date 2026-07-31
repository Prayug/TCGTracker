import React, { useEffect, useMemo, useState } from 'react';
import { Search, Star, Layers } from 'lucide-react';
import { PokemonSet } from '../../../types/pokemon';
import { OnePieceSet } from '../../../types/onepiece';
import { setTrackerService } from '../../../services/setTrackerService';
import { setWishlistService } from '../../../services/setWishlistService';
import { onePieceApi } from '../../../services/onepieceApi';
import { useGame } from '../../../contexts/GameContext';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { ErrorMessage } from '../../../components/common/ErrorMessage';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { groupSetsByEra, formatReleaseYear } from '../../../utils/setEra';
import { SetLogo } from './SetLogo';
import { CompletionRing } from './CompletionRing';

interface SetIndexProps {
  onSelectSet: (setId: string) => void;
}

type AnySet = PokemonSet | OnePieceSet;

function isPokemonSet(s: AnySet): s is PokemonSet {
  return 'releaseDate' in s || 'images' in s;
}

function SetCard({
  set,
  onSelect,
  onTogglePin,
  pinned,
  isPokemon,
}: {
  set: AnySet;
  onSelect: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
  pinned: boolean;
  isPokemon: boolean;
}) {
  let completion = 0;
  let year: string | undefined;

  if (isPokemon) {
    const pokemonSet = set as PokemonSet;
    completion = setTrackerService.getCompletionForSet(pokemonSet.id, pokemonSet.name, pokemonSet.total);
    year = formatReleaseYear(pokemonSet.releaseDate);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className="group relative flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border-default bg-gradient-chrome p-3.5 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-glow-accent"
    >
      {isPokemon && <SetLogo set={set as PokemonSet} size="md" />}
      {!isPokemon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-muted text-accent">
          <Layers className="h-6 w-6" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onTogglePin}
          className="absolute right-2 top-2 cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors duration-200 hover:bg-surface-hover hover:text-accent"
          aria-label={pinned ? 'Unpin set' : 'Pin set'}
        >
          <Star className={`h-4 w-4 ${pinned ? 'fill-accent text-accent' : ''}`} />
        </button>
        <p className="pr-8 font-semibold text-ink-primary">{set.name}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {isPokemon && `${(set as PokemonSet).total} cards`}
          {!isPokemon && `Set ID: ${set.id}`}
          {year ? ` · ${year}` : ''}
        </p>
      </div>
      {isPokemon && <CompletionRing percent={completion} className="mr-1" />}
    </div>
  );
}

export const SetIndex: React.FC<SetIndexProps> = ({ onSelectSet }) => {
  const { isPokemon, isOnePiece } = useGame();
  const [sets, setSets] = useState<AnySet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [, setPinTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        if (isPokemon) {
          const data = await setTrackerService.getSets();
          if (!cancelled) setSets(data);
        } else if (isOnePiece) {
          const data = await onePieceApi.getSets();
          if (!cancelled) setSets(data);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPokemon, isOnePiece]);

  const filtered = useMemo(() => {
    let list = sets;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (isPokemonSet(s) && ((s as PokemonSet).eraLabel || '').toLowerCase().includes(q)) ||
          (isPokemonSet(s) && ((s as PokemonSet).series || '').toLowerCase().includes(q))
      );
    }
    if (pinnedOnly && isPokemon) {
      const pinned = new Set(setWishlistService.getPinnedSets());
      list = list.filter((s) => pinned.has(s.id));
    }
    return list;
  }, [sets, search, pinnedOnly, isPokemon]);

  const grouped = useMemo(() => {
    if (!isPokemon) return [{ era: 'All Sets', label: 'All Sets', sets: filtered }];
    return groupSetsByEra(filtered as PokemonSet[]);
  }, [filtered, isPokemon]);
  const showGrouped = !search.trim() && !pinnedOnly && isPokemon;

  const handleTogglePin = (e: React.MouseEvent, setId: string) => {
    e.stopPropagation();
    setWishlistService.togglePinnedSet(setId);
    setPinTick((t) => t + 1);
  };

  const gameLabel = isPokemon ? 'Pokemon' : 'One Piece';

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={() => window.location.reload()} />;
  }

  if (sets.length === 0) {
    return (
      <PageEmptyState
        icon={Layers}
        title="No sets in catalog"
        message={isPokemon ? 'Run catalog sync on the backend to populate set checklists.' : 'Loading One Piece sets...'}
      />
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-foil">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow-accent" aria-hidden />
          Set tracker
        </p>
        <h1 className="font-display text-h1 text-ink-primary">Browse {gameLabel} sets</h1>
        <p className="max-w-2xl text-sm text-ink-secondary">
          {isPokemon
            ? 'Newest releases first, grouped by generation — Mega, SV, SWSH, and more.'
            : 'All One Piece TCG sets with card images and market prices.'}
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sets..."
            className="input input-with-icon"
          />
        </div>
        {isPokemon && (
          <button
            type="button"
            onClick={() => setPinnedOnly((p) => !p)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
              pinnedOnly
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                : 'border-border-subtle bg-surface-hover text-ink-secondary hover:text-ink-primary'
            }`}
          >
            <Star className={`h-4 w-4 ${pinnedOnly ? 'fill-amber-400' : ''}`} />
            Pinned only
          </button>
        )}
      </div>

      {showGrouped ? (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.era} className="relative space-y-3 border-l-2 border-border-default pl-5">
              <div className="sticky top-[4.25rem] z-10 -ml-5 flex items-center gap-3 bg-surface-base/95 py-2 pl-5 ">
                <span
                  className="absolute -left-[5px] h-2 w-2 rounded-full bg-accent"
                  aria-hidden="true"
                />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-secondary">
                  {group.label}
                </h2>
                <span className="text-xs tabular-nums text-ink-muted">{group.sets.length} sets</span>
              </div>
              <div className="stagger-children grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.sets.map((set) => (
                  <SetCard
                    key={set.id}
                    set={set}
                    onSelect={() => onSelectSet(set.id)}
                    onTogglePin={(e) => handleTogglePin(e, set.id)}
                    pinned={isPokemon ? setWishlistService.isPinned(set.id) : false}
                    isPokemon={isPokemon}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="stagger-children grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((set) => (
            <SetCard
              key={set.id}
              set={set}
              onSelect={() => onSelectSet(set.id)}
              onTogglePin={(e) => handleTogglePin(e, set.id)}
              pinned={isPokemon ? setWishlistService.isPinned(set.id) : false}
              isPokemon={isPokemon}
            />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-sm text-ink-muted">No sets match your search.</p>
      )}
    </div>
  );
};
