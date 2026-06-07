import React, { useEffect, useMemo, useState } from 'react';
import { Search, Star, Layers } from 'lucide-react';
import { PokemonSet } from '../../../types/pokemon';
import { setTrackerService } from '../../../services/setTrackerService';
import { setWishlistService } from '../../../services/setWishlistService';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { ErrorMessage } from '../../../components/common/ErrorMessage';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { groupSetsByEra, formatReleaseYear } from '../../../utils/setEra';
import { SetLogo } from './SetLogo';
import { CompletionRing } from './CompletionRing';

interface SetIndexProps {
  onSelectSet: (setId: string) => void;
}

function SetCard({
  set,
  onSelect,
  onTogglePin,
  pinned,
}: {
  set: PokemonSet;
  onSelect: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
  pinned: boolean;
}) {
  const completion = setTrackerService.getCompletionForSet(set.id, set.name, set.total);
  const year = formatReleaseYear(set.releaseDate);

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
      className="group relative flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border-default bg-surface-raised p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong"
    >
      <SetLogo set={set} size="md" />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onTogglePin}
          className="absolute right-2 top-2 rounded-lg p-1.5 text-ink-muted hover:bg-white/10 hover:text-amber-300"
          aria-label={pinned ? 'Unpin set' : 'Pin set'}
        >
          <Star className={`h-4 w-4 ${pinned ? 'fill-amber-400 text-amber-400' : ''}`} />
        </button>
        <p className="pr-8 font-semibold text-white">{set.name}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {set.total} cards{year ? ` · ${year}` : ''}
        </p>
      </div>
      <CompletionRing percent={completion} className="mr-1" />
    </div>
  );
}

export const SetIndex: React.FC<SetIndexProps> = ({ onSelectSet }) => {
  const [sets, setSets] = useState<PokemonSet[]>([]);
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
        const data = await setTrackerService.getSets();
        if (!cancelled) setSets(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = sets;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (s.eraLabel || '').toLowerCase().includes(q) ||
          (s.series || '').toLowerCase().includes(q)
      );
    }
    if (pinnedOnly) {
      const pinned = new Set(setWishlistService.getPinnedSets());
      list = list.filter((s) => pinned.has(s.id));
    }
    return list;
  }, [sets, search, pinnedOnly]);

  const grouped = useMemo(() => groupSetsByEra(filtered), [filtered]);
  const showGrouped = !search.trim() && !pinnedOnly;

  const handleTogglePin = (e: React.MouseEvent, setId: string) => {
    e.stopPropagation();
    setWishlistService.togglePinnedSet(setId);
    setPinTick((t) => t + 1);
  };

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
        message="Run catalog sync on the backend to populate set checklists."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border-default bg-surface-raised p-4 text-white shadow-sm">
        <SectionLabel className="text-accent/90">Set Tracker</SectionLabel>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Browse sets</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Newest releases first, grouped by generation — Mega, SV, SWSH, and more.
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
            className="w-full rounded-lg border border-border-subtle bg-surface-hover py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-ink-muted focus:border-violet-500/50 focus:outline-none"
          />
        </div>
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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.sets.map((set) => (
                  <SetCard
                    key={set.id}
                    set={set}
                    onSelect={() => onSelectSet(set.id)}
                    onTogglePin={(e) => handleTogglePin(e, set.id)}
                    pinned={setWishlistService.isPinned(set.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((set) => (
            <SetCard
              key={set.id}
              set={set}
              onSelect={() => onSelectSet(set.id)}
              onTogglePin={(e) => handleTogglePin(e, set.id)}
              pinned={setWishlistService.isPinned(set.id)}
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
