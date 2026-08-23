import { useEffect, useState } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { pokemonApi } from '../../../services/pokemonApi';
import type { PokemonCard } from '../../../types/pokemon';
import type { SlabLot } from '../../../services/slabBookService';
import type { CompClass, SimilarSlabComp, SimilarSlabsResult } from '../types';
import {
  CardThumb,
  ChangeBadge,
  EmptyState,
  formatUsd,
  LiquidityBadge,
  PanelLoading,
} from './shared';

const CLASS_LABELS: Record<CompClass, string> = {
  alt_grade: 'Alt grades (same card)',
  set_mate: 'Set-mates (same set + rarity)',
  character_mate: 'Character-mates (across sets)',
};

function CompCard({ comp }: { comp: SimilarSlabComp }) {
  return (
    <div className="rounded-lg border border-border-default bg-surface-inset p-3">
      <div className="flex items-start gap-2.5">
        <CardThumb imageSmall={comp.imageSmall} name={comp.cardName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink-primary">
            {comp.cardName ?? comp.cardId}
          </p>
          <p className="truncate text-[11px] text-ink-muted">
            {comp.setName} · {comp.grader} {comp.grade}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-ink-primary">
              {formatUsd(comp.currentPrice)}
            </span>
            <LiquidityBadge tier={comp.liquidityTier} score={comp.liquidityScore} />
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-ink-muted">7d</span>
        <ChangeBadge pct={comp.change7dPct} />
        <span className="ml-1 text-ink-muted">30d</span>
        <ChangeBadge pct={comp.change30dPct} />
      </div>
      {comp.avgMovePer5Pct != null && (
        <p
          className="mt-1.5 text-[10px] text-ink-muted"
          title={`Correlation ${comp.correlation?.toFixed(2) ?? '—'} on aligned daily returns`}
        >
          When anchor moved +5%, this moved {comp.avgMovePer5Pct > 0 ? '+' : ''}
          {comp.avgMovePer5Pct}% on average
        </p>
      )}
    </div>
  );
}

interface Props {
  data: SimilarSlabsResult | null;
  loading: boolean;
  anchorIds: string[];
  onAnchorIdsChange: (ids: string[]) => void;
  slabLots: SlabLot[];
}

/** Anchor picker (owned slabs + card search) with grouped comps per anchor. */
export function SimilarSlabsPanel({
  data,
  loading,
  anchorIds,
  onAnchorIdsChange,
  slabLots,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PokemonCard[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = window.setTimeout(async () => {
      try {
        const cards = await pokemonApi.searchCards(query.trim(), undefined, 6);
        setResults(cards.slice(0, 5));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [query]);

  const toggleAnchor = (cardId: string) => {
    if (anchorIds.includes(cardId)) {
      onAnchorIdsChange(anchorIds.filter((id) => id !== cardId));
    } else {
      onAnchorIdsChange([...anchorIds, cardId].slice(0, 8));
    }
  };

  const ownedIds = [...new Set(slabLots.map((l) => l.cardId))];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border-default bg-surface-raised p-4">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
          Anchors (up to 8)
        </p>

        {ownedIds.length > 0 && (
          <div className="mb-3">
            <p className="mb-1.5 text-[11px] text-ink-muted">From your slab book:</p>
            <div className="flex flex-wrap gap-1.5">
              {ownedIds.map((cardId) => {
                const lot = slabLots.find((l) => l.cardId === cardId);
                const active = anchorIds.includes(cardId);
                return (
                  <button
                    key={cardId}
                    type="button"
                    onClick={() => toggleAnchor(cardId)}
                    className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'border-accent/40 bg-accent/15 text-accent'
                        : 'border-border-default bg-surface-inset text-ink-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {lot?.cardName ?? cardId}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="relative">
          <div className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-inset px-3 py-2">
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            ) : (
              <Search className="h-3.5 w-3.5 text-ink-muted" />
            )}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add an anchor card by name…"
              className="flex-1 bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
            />
          </div>
          {results.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border-default bg-surface-overlay shadow-popover">
              {results.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => {
                      toggleAnchor(card.id);
                      setQuery('');
                      setResults([]);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-hover"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-accent" />
                    <span className="truncate">{card.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-ink-muted">{card.set.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {anchorIds.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {anchorIds.map((id) => {
              const group = data?.groups.find((g) => g.anchor.cardId === id);
              const label =
                group?.anchor.cardName ?? slabLots.find((l) => l.cardId === id)?.cardName ?? id;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs text-accent"
                >
                  {label}
                  <button
                    type="button"
                    onClick={() => toggleAnchor(id)}
                    className="cursor-pointer rounded-full hover:text-ink-primary"
                    aria-label={`Remove anchor ${label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {loading ? (
        <PanelLoading />
      ) : anchorIds.length === 0 ? (
        <EmptyState message="Pick anchors from your slab book or search for a card to see similar slabs, set-mates, and character-mates." />
      ) : !data || data.groups.length === 0 ? (
        <EmptyState message="No comps found for these anchors. Anchors need graded price coverage in the database." />
      ) : (
        <div className="space-y-6">
          {data.groups.map((group) => (
            <div
              key={group.anchor.cardId}
              className="rounded-xl border border-border-default bg-surface-raised p-4"
            >
              <div className="mb-3 flex items-center gap-3">
                <CardThumb imageSmall={group.anchor.imageSmall} name={group.anchor.cardName} />
                <div>
                  <p className="font-medium text-ink-primary">
                    {group.anchor.cardName ?? group.anchor.cardId}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {group.anchor.setName}
                    {group.anchor.rarity ? ` · ${group.anchor.rarity}` : ''}
                    {group.anchor.psa10Price != null
                      ? ` · PSA 10 ${formatUsd(group.anchor.psa10Price)}`
                      : ''}
                  </p>
                </div>
              </div>

              {(['alt_grade', 'set_mate', 'character_mate'] as CompClass[]).map((cls) => {
                const comps =
                  cls === 'alt_grade'
                    ? group.altGrades
                    : cls === 'set_mate'
                      ? group.setMates
                      : group.characterMates;
                if (comps.length === 0) return null;
                return (
                  <div key={cls} className="mb-4 last:mb-0">
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                      {CLASS_LABELS[cls]}
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {comps.map((comp) => (
                        <CompCard key={`${comp.cardId}-${comp.grader}-${comp.grade}`} comp={comp} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
