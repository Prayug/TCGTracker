import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Trash2 } from 'lucide-react';
import { PullCard, SavedPull } from '../types';
import { onePiecePackService, sortPullsBestFirst } from '../services/onePiecePackService';
import { PullCardView } from './PullCardView';
import { opRarityStyle, OP_RARITY_LABELS } from './opRarityStyles';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { cn } from '../../../lib/utils';

interface PullsCollectionProps {
  /** Bump to force a refresh (after saves). */
  refreshKey?: number;
}

interface Group {
  code: string;
  setName: string;
  pulls: SavedPull[];
}

interface GroupedPull {
  card: PullCard;
  count: number;
}

export const PullsCollection: React.FC<PullsCollectionProps> = ({ refreshKey = 0 }) => {
  const [pulls, setPulls] = useState<SavedPull[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(() => {
    setPulls(onePiecePackService.getSavedPulls());
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const pull of sortPullsBestFirst(pulls)) {
      const key = pull.code;
      if (!map.has(key)) {
        map.set(key, { code: pull.code, setName: pull.setName, pulls: [] });
      }
      map.get(key)!.pulls.push(pull);
    }
    return [...map.values()];
  }, [pulls]);

  const groupUnique = useMemo(() => {
    return groups.map((group) => {
      const counts = new Map<string, GroupedPull>();
      for (const pull of group.pulls) {
        const entry = counts.get(pull.card.id);
        if (entry) entry.count += 1;
        else counts.set(pull.card.id, { card: pull.card, count: 1 });
      }
      return { ...group, unique: [...counts.values()] };
    });
  }, [groups]);

  const rarityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const pull of pulls) {
      counts[pull.card.rarity] = (counts[pull.card.rarity] ?? 0) + 1;
    }
    return counts;
  }, [pulls]);

  const removePull = (pullId: string) => {
    onePiecePackService.removePull(pullId);
    load();
  };

  const clearAll = () => {
    onePiecePackService.clearPulls();
    setConfirmClear(false);
    load();
  };

  if (pulls.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface-inset px-6 py-12 text-center">
        <BookOpen className="h-8 w-8 text-ink-muted" />
        <div>
          <p className="text-sm font-semibold text-ink-primary">No saved pulls yet</p>
          <p className="mt-1 max-w-sm text-xs text-ink-muted">
            Open a pack or booster box, then save your pulls — they'll be kept in
            your browser and grouped by set here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(rarityCounts)
            .sort((a, b) => rank(a[0]) - rank(b[0]))
            .map(([rarity, count]) => (
              <span
                key={rarity}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold',
                  opRarityStyle(rarity as PullCard['rarity']).badge
                )}
              >
                {OP_RARITY_LABELS[rarity as PullCard['rarity']]}
                <span className="tabular-nums opacity-80">{count}</span>
              </span>
            ))}
        </div>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-hover px-3 py-1.5 text-xs font-semibold text-loss transition-colors hover:border-loss/40 hover:bg-loss/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear all
        </button>
      </div>

      {groupUnique.map((group) => (
        <div key={group.code}>
          <div className="mb-3 flex items-baseline gap-2">
            <h4 className="font-display text-base font-bold text-ink-primary">{group.code}</h4>
            <span className="truncate text-xs text-ink-muted">{group.setName}</span>
            <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-muted">
              {group.unique.length} unique · {group.pulls.length} cards
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {group.unique.map(({ card, count }) => (
              <div key={card.id} className="group relative">
                <PullCardView card={card} count={count} />
                <button
                  type="button"
                  aria-label={`Remove ${card.name}`}
                  onClick={() => removePull(card.id)}
                  className="absolute right-1 top-1 z-10 rounded-md border border-border-subtle bg-surface-overlay/90 p-1 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-loss"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <ConfirmDialog
        isOpen={confirmClear}
        onConfirm={clearAll}
        onCancel={() => setConfirmClear(false)}
        title="Clear saved collection?"
        message={`Remove all ${pulls.length} saved pulls from this browser. This cannot be undone.`}
        confirmLabel="Clear collection"
      />
    </div>
  );
};

function rank(rarity: string): number {
  const order: Record<string, number> = {
    MANGA: 0,
    TR: 1,
    SP: 2,
    SEC: 3,
    AA: 4,
    SR: 5,
    L: 6,
    R: 7,
    UC: 8,
    C: 9,
    DON: 10,
  };
  return order[rarity] ?? 99;
}
