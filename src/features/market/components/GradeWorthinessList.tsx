import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronsUpDown, Loader2, Search, Sparkles, X } from 'lucide-react';
import {
  fetchGradeWorthiness,
  GradeWorthinessEraFacet,
  GradeWorthinessRow,
  GradeWorthinessSetFacet,
  GradeWorthinessSort,
} from '../../../services/gradedPricesApi';
import { formatCurrency, formatPercent, proxyImageUrl } from '../../../utils/cardDisplay';
import { FilterChip } from '../../../components/layout/PageShell';
import { useCardModal } from '../../../contexts/CardModalContext';
import type { PokemonCard } from '../../../types/pokemon';

function rowToPokemonCard(row: GradeWorthinessRow): PokemonCard {
  const image = row.imageSmall || '';
  return {
    id: row.cardId,
    name: row.cardName || row.cardId,
    images: { small: image, large: image },
    set: {
      id: row.setId || '',
      name: row.setName || 'Unknown set',
      releaseDate: '',
      total: 0,
    },
    number: '',
    marketPrice: row.rawPrice,
  };
}

/** Keep in sync with backend ERA_GROUPS order (newest first). */
const ERA_LABELS: Record<string, string> = {
  mega: 'Mega Evolution',
  sv: 'Scarlet & Violet',
  swsh: 'Sword & Shield',
  sm: 'Sun & Moon',
  xy: 'XY',
  bw: 'Black & White',
  col: 'Call of Legends',
  hgss: 'HeartGold & SoulSilver',
  dp: 'Diamond & Pearl',
  ex: 'EX Series',
  ecard: 'e-Card',
  neo: 'Neo',
  gym: 'Gym',
  base: 'Base',
  promo: 'Promos & Special',
  other: 'Other',
};

const ERA_ORDER = Object.keys(ERA_LABELS);

const SORT_OPTIONS: { id: GradeWorthinessSort; label: string }[] = [
  { id: 'score', label: 'Best overall' },
  { id: 'netProfit', label: 'Highest net $' },
  { id: 'netRoi', label: 'Highest net ROI' },
  { id: 'gemEase', label: 'Easiest gems' },
  { id: 'scarce', label: 'Most scarce' },
];

function TrustCue({
  verified,
  stale,
  ageHours,
}: {
  verified?: boolean;
  stale?: boolean;
  ageHours?: number | null;
}) {
  if (verified === false) {
    return (
      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
        Soft match
      </span>
    );
  }
  if (stale) {
    return (
      <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
        Stale{ageHours != null ? ` · ${ageHours}h` : ''}
      </span>
    );
  }
  if (verified) {
    return (
      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
        Verified
      </span>
    );
  }
  return null;
}

interface GradeWorthinessListProps {
  /** When set, ranks only these catalog ids (vault scope). */
  cardIds?: string[];
  /** External set filter (e.g. from set heatmap click). */
  setIds?: string[];
  limit?: number;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  /** Prefill graded_premium alert for a card */
  onAlertPremium?: (card: {
    cardId: string;
    cardName: string;
    premiumPct: number;
    rawPrice: number;
  }) => void;
}

function SetPicker({
  sets,
  value,
  onChange,
  eraScoped,
}: {
  sets: GradeWorthinessSetFacet[];
  value: string;
  onChange: (setId: string) => void;
  eraScoped: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = sets.find((s) => s.setId === value);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? sets.filter((s) => s.setName.toLowerCase().includes(q))
      : sets;

    const byEra = new Map<string, GradeWorthinessSetFacet[]>();
    for (const set of filtered) {
      const list = byEra.get(set.era) || [];
      list.push(set);
      byEra.set(set.era, list);
    }

    return ERA_ORDER.filter((era) => byEra.has(era)).map((era) => ({
      era,
      label: ERA_LABELS[era] || era,
      sets: (byEra.get(era) || []).sort((a, b) => a.setName.localeCompare(b.setName)),
    }));
  }, [sets, query]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 sm:max-w-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-left text-xs text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 truncate">
          {selected ? (
            <>
              <span className="text-ink-muted">Set · </span>
              <span className="font-medium text-ink-primary">{selected.setName}</span>
            </>
          ) : (
            <span>All sets{eraScoped ? ' in selected eras' : ''}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange('');
                }
              }}
              className="rounded p-0.5 text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
              aria-label="Clear set filter"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 text-ink-muted" />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-border-default bg-surface-overlay shadow-elevated sm:min-w-[20rem]">
          <div className="border-b border-border-subtle p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sets…"
                className="input w-full py-1.5 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1 [scrollbar-width:thin]" role="listbox">
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => {
                onChange('');
                setOpen(false);
                setQuery('');
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs ${
                !value ? 'bg-accent-muted text-accent' : 'text-ink-secondary hover:bg-surface-hover'
              }`}
            >
              All sets{eraScoped ? ' in selected eras' : ''}
            </button>
            {grouped.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-ink-muted">No sets match</p>
            ) : (
              grouped.map((group) => (
                <div key={group.era} className="pt-1">
                  <p className="sticky top-0 bg-surface-overlay/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted backdrop-blur-sm">
                    {group.label}
                  </p>
                  {group.sets.map((set) => {
                    const active = set.setId === value;
                    return (
                      <button
                        key={set.setId}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          onChange(set.setId);
                          setOpen(false);
                          setQuery('');
                        }}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs ${
                          active
                            ? 'bg-accent-muted text-accent'
                            : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
                        }`}
                      >
                        <span className="min-w-0 truncate font-medium">{set.setName}</span>
                        <span className="shrink-0 font-mono tabular-nums text-ink-muted">
                          {set.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CardThumb({ row, size = 'md' }: { row: GradeWorthinessRow; size?: 'md' | 'lg' }) {
  const src = proxyImageUrl(row.imageSmall ?? undefined);
  const box =
    size === 'lg'
      ? 'h-[5.5rem] w-[4rem] sm:h-[6.5rem] sm:w-[4.75rem]'
      : 'h-14 w-10';
  const initials = (row.cardName || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  if (!src) {
    return (
      <div
        className={`${box} flex shrink-0 items-center justify-center rounded-lg border border-border-default bg-surface-inset font-display text-[10px] font-semibold text-ink-muted`}
        aria-hidden
      >
        {initials}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className={`${box} shrink-0 rounded-lg border border-border-default bg-surface-inset object-cover shadow-sm`}
      loading="lazy"
    />
  );
}

export const GradeWorthinessList: React.FC<GradeWorthinessListProps> = ({
  cardIds,
  setIds,
  limit = 10,
  title = 'Best cards to grade',
  subtitle = 'After PSA fees (Value tiers paused) × gem ease',
  emptyMessage = 'Need verified PSA 10 prices and pop reports to rank cards.',
  onAlertPremium,
}) => {
  const { openCard: openCardModal } = useCardModal();
  const [rows, setRows] = useState<GradeWorthinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [feeNote, setFeeNote] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [eraFacets, setEraFacets] = useState<GradeWorthinessEraFacet[]>([]);
  const [setFacets, setSetFacets] = useState<GradeWorthinessSetFacet[]>([]);
  const [selectedEras, setSelectedEras] = useState<string[]>([]);
  const [selectedSetId, setSelectedSetId] = useState('');
  const [sort, setSort] = useState<GradeWorthinessSort>('score');

  const cardIdsKey = cardIds?.join('|') ?? '';
  const erasKey = selectedEras.join(',');

  useEffect(() => {
    if (setIds === undefined) return;
    setSelectedSetId(setIds[0] ?? '');
  }, [setIds?.join('|')]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchGradeWorthiness({
      limit,
      cardIds,
      eras: selectedEras.length ? selectedEras : undefined,
      setIds: selectedSetId ? [selectedSetId] : undefined,
      sort,
    })
      .then((result) => {
        if (cancelled) return;
        const next = result?.rows ?? [];
        setRows(next);
        setCount(result?.count ?? 0);
        setFeeNote(result?.feeContext?.note ?? null);
        if (result?.facets?.eras?.length) setEraFacets(result.facets.eras);
        if (result?.facets?.sets?.length) setSetFacets(result.facets.sets);
        setSelectedId((prev) => {
          if (prev && next.some((r) => r.cardId === prev)) return prev;
          return next[0]?.cardId ?? null;
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit, cardIdsKey, erasKey, selectedSetId, sort]);

  const featured = useMemo(
    () => rows.find((r) => r.cardId === selectedId) ?? rows[0] ?? null,
    [rows, selectedId]
  );

  const setsForSelect = useMemo(() => {
    if (selectedEras.length === 0) return setFacets;
    const eraSet = new Set(selectedEras);
    return setFacets.filter((s) => eraSet.has(s.era));
  }, [setFacets, selectedEras]);

  // Drop set filter if it falls outside the active era selection.
  useEffect(() => {
    if (!selectedSetId) return;
    if (!setsForSelect.some((s) => s.setId === selectedSetId)) {
      setSelectedSetId('');
    }
  }, [setsForSelect, selectedSetId]);

  const toggleEra = (eraId: string) => {
    setSelectedEras((prev) =>
      prev.includes(eraId) ? prev.filter((e) => e !== eraId) : [...prev, eraId]
    );
  };

  const openCard = (row: GradeWorthinessRow) => {
    setSelectedId(row.cardId);
    openCardModal(rowToPokemonCard(row));
  };

  const filtersActive = selectedEras.length > 0 || !!selectedSetId;

  return (
    <div className="card-glass-scene">
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden />
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>
        </div>
        {!loading && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">
            {count.toLocaleString()} ranked
          </span>
        )}
      </div>

      <div className="mb-2 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
        {SORT_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.id}
            active={sort === opt.id}
            onClick={() => setSort(opt.id)}
            className="shrink-0 text-xs"
          >
            {opt.label}
          </FilterChip>
        ))}
      </div>

      {(eraFacets.length > 0 || setFacets.length > 0) && (
        <div className="mb-2.5 space-y-2">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
            <FilterChip
              active={selectedEras.length === 0}
              onClick={() => setSelectedEras([])}
              className="shrink-0 text-xs"
            >
              All eras
            </FilterChip>
            {eraFacets.map((era) => (
              <FilterChip
                key={era.id}
                active={selectedEras.includes(era.id)}
                onClick={() => toggleEra(era.id)}
                className="shrink-0 text-xs"
              >
                {era.label}
                <span className="ml-1 font-mono tabular-nums text-ink-muted">{era.count}</span>
              </FilterChip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SetPicker
              sets={setsForSelect}
              value={selectedSetId}
              onChange={setSelectedSetId}
              eraScoped={selectedEras.length > 0}
            />
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setSelectedEras([]);
                  setSelectedSetId('');
                }}
                className="cursor-pointer text-xs text-ink-muted hover:text-ink-secondary"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : rows.length === 0 || !featured ? (
        <p className="py-4 text-center text-xs text-ink-muted">
          {filtersActive
            ? 'No grade-worthy cards in this era/set — try clearing filters.'
            : emptyMessage}
        </p>
      ) : (
        <div className="space-y-2.5">
          <div
            className="relative overflow-hidden rounded-2xl border border-border-default"
            style={{ background: 'var(--gradient-chrome)' }}
          >
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse 70% 80% at 100% 0%, rgba(110,231,183,0.12), transparent 55%)',
              }}
              aria-hidden
            />
            <div className="relative flex w-full gap-3 p-3 sm:gap-4 sm:p-3.5">
              <button
                type="button"
                onClick={() => openCard(featured)}
                className="contents cursor-pointer text-left"
              >
                <CardThumb row={featured} size="lg" />
              </button>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => openCard(featured)}
                  className="w-full cursor-pointer text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-foil">
                          #{rows.findIndex((r) => r.cardId === featured.cardId) + 1} pick
                        </p>
                        <TrustCue
                          verified={featured.verified}
                          stale={featured.stale}
                          ageHours={featured.ageHours}
                        />
                      </div>
                      <p className="mt-0.5 truncate font-display text-base font-semibold tracking-tight text-ink-primary sm:text-lg">
                        {featured.cardName || featured.cardId}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {featured.setName || 'Unknown set'}
                        {featured.soldListings > 0
                          ? ` · ${featured.soldListings.toLocaleString()} comps`
                          : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-2xl font-bold tabular-nums leading-none text-gain sm:text-3xl">
                        {formatCurrency(featured.netProfit, { signed: true })}
                      </p>
                      <p className="mt-1 font-mono text-[11px] tabular-nums text-ink-muted">
                        {formatPercent(featured.netRoiPct, { signed: true })} ·{' '}
                        {featured.gemRatePct.toFixed(1)}% gem
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg bg-surface-inset/80 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted">PSA 10</p>
                      <p className="font-mono text-xs font-semibold tabular-nums text-ink-primary">
                        {formatCurrency(featured.psa10Price)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-surface-inset/80 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted">Raw</p>
                      <p className="font-mono text-xs font-semibold tabular-nums text-ink-primary">
                        {formatCurrency(featured.rawPrice)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-surface-inset/80 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                        Fee · {featured.gradingTier}
                      </p>
                      <p className="font-mono text-xs font-semibold tabular-nums text-ink-primary">
                        {formatCurrency(featured.gradingFee)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-surface-inset/80 px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted">Gem</p>
                      <p className="font-mono text-xs font-semibold tabular-nums text-ink-primary">
                        {featured.gemRatePct.toFixed(1)}%
                        <span className="ml-1 font-normal text-ink-muted">
                          · {featured.psa10Pop.toLocaleString()} 10s
                        </span>
                      </p>
                    </div>
                  </div>
                </button>

                {onAlertPremium && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAlertPremium({
                        cardId: featured.cardId,
                        cardName: featured.cardName || featured.cardId,
                        premiumPct: featured.premiumPct,
                        rawPrice: featured.rawPrice,
                      });
                    }}
                    className="mt-2.5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default bg-surface-inset px-2.5 py-1.5 text-[11px] font-medium text-ink-secondary transition-colors hover:border-accent/40 hover:text-accent"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    Alert when PSA 10 premium drops
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-0.5">
            {rows.map((row, index) => {
              const active = row.cardId === featured.cardId;
              return (
                <div
                  key={row.cardId}
                  className={`flex w-full items-center gap-1 rounded-xl px-1 py-0.5 ${
                    active
                      ? 'bg-accent-muted shadow-[inset_0_0_0_1px_var(--accent)]'
                      : 'hover:bg-surface-hover/70'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openCard(row)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-1 py-1.5 text-left sm:gap-3"
                  >
                    <span className="w-4 shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">
                      {index + 1}
                    </span>
                    <CardThumb row={row} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-ink-primary">
                          {row.cardName || row.cardId}
                        </p>
                        {row.stale && (
                          <span className="text-[10px] text-ink-muted">stale</span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-ink-muted">
                        {row.setName || 'Unknown set'}
                        {row.soldListings > 0
                          ? ` · ${row.soldListings.toLocaleString()} comps`
                          : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-semibold tabular-nums text-gain">
                        {formatCurrency(row.netProfit, { signed: true })}
                      </p>
                      <p className="font-mono text-[11px] tabular-nums text-ink-muted">
                        {formatPercent(row.netRoiPct, { signed: true })}
                      </p>
                    </div>
                  </button>
                  {onAlertPremium && (
                    <button
                      type="button"
                      title="Alert on PSA 10 premium"
                      onClick={() =>
                        onAlertPremium({
                          cardId: row.cardId,
                          cardName: row.cardName || row.cardId,
                          premiumPct: row.premiumPct,
                          rawPrice: row.rawPrice,
                        })
                      }
                      className="shrink-0 cursor-pointer rounded-lg p-1.5 text-ink-muted hover:bg-surface-hover hover:text-accent"
                    >
                      <Bell className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {feeNote && <p className="text-[11px] text-ink-muted">{feeNote}</p>}
        </div>
      )}
    </div>
  );
};
