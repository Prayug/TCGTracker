import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { PokemonCard } from '../types/pokemon';
import { useCards, type AnyCard } from '../hooks/useCards';
import { useGame } from '../contexts/GameContext';
import { useCardModal } from '../contexts/CardModalContext';
import { PageShell, PageHeader, FilterChip } from '../components/layout/PageShell';
import { Modal } from '../components/common/Modal';
import { Unavailable } from '../components/exchange/Price';
import { markOnboardingStep } from '../components/common/OnboardingChecklist';
import { AddToVaultModal } from '../features/vault/components/AddToVaultModal';
import { CatalogGrid, CatalogTable } from '../features/catalog/CatalogItems';
import { DiscoverShowcase } from '../features/catalog/DiscoverShowcase';
import { FINISH_LABEL } from '../components/collectible/finish';
import { CardSpotlight } from '../components/collectible/CardSpotlight';
import { QuickPreviewFacts } from '../features/catalog/QuickPreviewFacts';
import { FilterRail } from '../features/catalog/FilterRail';
import {
  type CatalogSort,
  type CatalogState,
  PRICE_BANDS,
  QUICK_FILTERS,
  activeFacetCount,
  applyCatalogFilters,
  facetOptions,
  parseCatalogState,
  writeCatalogState,
} from '../features/catalog/catalogFilters';
import { useIncrementalReveal } from '../features/catalog/useIncrementalReveal';
import { queryContainsCjk } from '../utils/scriptDetection';
import { cn } from '@/lib/utils';

const SORT_LABELS: Record<CatalogSort, string> = {
  'price-high': 'Price, high to low',
  'price-low': 'Price, low to high',
  'name-asc': 'Name, A to Z',
  'name-desc': 'Name, Z to A',
  'set-asc': 'Set, A to Z',
  'set-desc': 'Set, Z to A',
  'date-new': 'Newest set first',
  'date-old': 'Oldest set first',
  rarity: 'Rarity',
};

function CatalogSearch({
  value,
  onCommit,
  loading,
  placeholder,
}: {
  value: string;
  onCommit: (q: string) => void;
  loading: boolean;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = window.setTimeout(() => onCommit(draft), 300);
    return () => window.clearTimeout(t);
  }, [draft, value, onCommit]);

  return (
    <form
      role="search"
      className="relative min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        onCommit(draft);
      }}
    >
      <label htmlFor="catalog-q" className="sr-only">
        Search the catalog
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
        aria-hidden
      />
      <input
        id="catalog-q"
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-busy={loading}
        autoComplete="off"
        className="input h-10 w-full pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {loading ? (
        <span
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-ink-muted border-t-transparent motion-reduce:animate-none"
          aria-hidden
        />
      ) : draft ? (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            onCommit('');
          }}
          className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-ink-muted hover:text-ink-primary"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </form>
  );
}

/**
 * Catalog. View state (query, sort, view, filters) lives in the URL so a
 * filtered view can be shared and the back button restores it.
 */
export function BrowsePage() {
  const { game, isPokemon, isOnePiece } = useGame();
  const { openCard } = useCardModal();
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseCatalogState(params), [params]);
  const [railOpen, setRailOpen] = useState(() => {
    try {
      return window.localStorage.getItem('tcg.catalog.rail') !== 'closed';
    } catch {
      return true;
    }
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [adding, setAdding] = useState<AnyCard | null>(null);
  const [preview, setPreview] = useState<{ card: AnyCard; layoutId: string } | null>(null);

  const {
    cards,
    isLoading,
    error,
    setSearchQuery,
    setSortBy,
    setCardLanguage,
    refetch,
    searchQuery,
  } = useCards();

  // URL → data hook
  useEffect(() => setSearchQuery(state.q), [state.q, setSearchQuery]);
  useEffect(() => setSortBy(state.sort), [state.sort, setSortBy]);
  useEffect(() => {
    if (isPokemon) setCardLanguage(state.lang);
  }, [state.lang, isPokemon, setCardLanguage]);

  useEffect(() => {
    if (searchQuery.trim() && cards.length > 0 && !isLoading) markOnboardingStep('browse');
  }, [searchQuery, cards.length, isLoading]);

  const update = useCallback(
    (patch: Partial<CatalogState>, opts: { push?: boolean } = {}) => {
      setParams((prev) => writeCatalogState(prev, patch), {
        replace: !opts.push,
        preventScrollReset: true,
      });
    },
    [setParams]
  );

  const commitQuery = useCallback(
    (q: string) => {
      // A new search starts from a clean facet slate: old set/rarity picks rarely apply.
      const patch: Partial<CatalogState> = { q, set: '', rarity: '', type: '', finish: '' };
      if (queryContainsCjk(q)) patch.lang = 'ja';
      update(patch);
    },
    [update]
  );

  const setRail = (open: boolean) => {
    setRailOpen(open);
    try {
      window.localStorage.setItem('tcg.catalog.rail', open ? 'open' : 'closed');
    } catch {
      /* per-viewer convenience only */
    }
  };

  const facets = useMemo(() => facetOptions(cards), [cards]);
  const filtered = useMemo(() => applyCatalogFilters(cards, state), [cards, state]);
  const reveal = useIncrementalReveal(filtered);
  const facetCount = activeFacetCount(state);
  const hasQuery = state.q.trim().length > 0;
  const gameLabel = isOnePiece ? 'One Piece' : 'Pokémon';
  const typeLabel = isOnePiece ? 'Colour' : 'Type';

  const resetFilters = () =>
    update({ set: '', rarity: '', type: '', price: 'all', quick: 'all', finish: '' });

  const activeTokens: { key: keyof CatalogState; label: string }[] = [];
  if (state.set) activeTokens.push({ key: 'set', label: state.set });
  if (state.rarity) activeTokens.push({ key: 'rarity', label: state.rarity });
  if (state.type) activeTokens.push({ key: 'type', label: state.type });
  if (state.finish) activeTokens.push({ key: 'finish', label: FINISH_LABEL[state.finish] });
  if (state.price !== 'all')
    activeTokens.push({
      key: 'price',
      label: PRICE_BANDS.find((b) => b.value === state.price)?.label ?? state.price,
    });

  const quickFilters = QUICK_FILTERS.filter((f) => !f.pokemonOnly || isPokemon);
  const showRail = hasQuery && !error && cards.length > 0;
  const resultsRef = useRef<HTMLDivElement>(null);

  const rail = (
    <FilterRail
      state={state}
      facets={facets}
      typeLabel={typeLabel}
      onChange={(p) => update(p)}
      onReset={resetFilters}
      activeCount={facetCount}
    />
  );

  const searchBox = (
    <CatalogSearch
      value={state.q}
      onCommit={commitQuery}
      loading={isLoading}
      placeholder={
        isOnePiece ? 'Search by name, set or code, e.g. OP05-119' : 'Search by name, set or number'
      }
    />
  );

  if (!hasQuery) {
    return (
      <PageShell wide className="space-y-5">
        <DiscoverShowcase
          search={searchBox}
          onSearch={(q, patch) =>
            update(
              { q, set: '', rarity: '', type: '', finish: '', ...(patch as Partial<CatalogState>) },
              { push: true }
            )
          }
          onAdvanced={() => document.getElementById('catalog-q')?.focus()}
        />
      </PageShell>
    );
  }

  return (
    <PageShell wide className="space-y-5">
      <PageHeader
        title="Catalog"
        meta={
          hasQuery && !isLoading && !error && cards.length > 0
            ? `${filtered.length.toLocaleString()} of ${cards.length.toLocaleString()} ${gameLabel} cards match “${state.q}”`
            : `Every printed ${gameLabel} card, with market prices`
        }
      />

      {/* Toolbar: search, language, sort, view, filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex w-full min-w-0 items-center gap-2 lg:w-auto lg:flex-1">
          <CatalogSearch
            value={state.q}
            onCommit={commitQuery}
            loading={isLoading}
            placeholder={
              isOnePiece
                ? 'Search by name, set or code, e.g. OP05-119'
                : 'Search by name, set or number'
            }
          />
        </div>
        {isPokemon ? (
          <div className="segmented" role="radiogroup" aria-label="Card language">
            {(['en', 'ja'] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={state.lang === l}
                onClick={() => update({ lang: l })}
              >
                {l === 'en' ? 'English' : 'Japanese'}
              </button>
            ))}
          </div>
        ) : null}
        <label className="sr-only" htmlFor="catalog-sort">
          Sort by
        </label>
        <select
          id="catalog-sort"
          value={state.sort}
          onChange={(e) => update({ sort: e.target.value as CatalogSort })}
          className="input h-10 w-auto min-w-0 pr-8 text-[13px]"
        >
          {(Object.keys(SORT_LABELS) as CatalogSort[])
            .filter((s) => isOnePiece || (s !== 'set-asc' && s !== 'set-desc'))
            .map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
        </select>
        <div className="segmented" role="radiogroup" aria-label="Layout">
          {(['grid', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={state.view === v}
              onClick={() => update({ view: v })}
            >
              {v === 'grid' ? 'Grid' : 'List'}
            </button>
          ))}
        </div>
        {showRail ? (
          <>
            <button
              type="button"
              onClick={() => setRail(!railOpen)}
              aria-expanded={railOpen}
              aria-controls="catalog-rail"
              className="btn-secondary hidden h-10 lg:inline-flex"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              {railOpen ? 'Hide filters' : 'Filters'}
              {facetCount > 0 ? (
                <span className="font-mono text-[12px] text-accent">{facetCount}</span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="btn-secondary h-10 lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filters
              {facetCount > 0 ? (
                <span className="font-mono text-[12px] text-accent">{facetCount}</span>
              ) : null}
            </button>
          </>
        ) : null}
      </div>

      {hasQuery ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {quickFilters.map((f) => (
            <FilterChip
              key={f.value}
              active={state.quick === f.value}
              onClick={() => update({ quick: state.quick === f.value ? 'all' : f.value })}
            >
              {f.label}
            </FilterChip>
          ))}
          {activeTokens.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => update({ [t.key]: t.key === 'price' ? 'all' : '' })}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-accent-muted px-3 text-[13px] text-accent hover:underline"
            >
              {t.label}
              <X className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          {facetCount > 0 || state.quick !== 'all' ? (
            <button
              type="button"
              onClick={resetFilters}
              className="h-8 px-2 text-[13px] text-ink-muted hover:text-ink-primary"
            >
              Clear all
            </button>
          ) : null}
          {isPokemon ? (
            <p className="w-full text-[11.5px] text-ink-muted sm:ml-auto sm:w-auto">
              Weekly movement compares the Cardmarket trend with its 7- and 30-day averages.
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          'grid min-w-0 gap-8',
          showRail && railOpen && 'lg:grid-cols-[15rem_minmax(0,1fr)]'
        )}
      >
        {showRail && railOpen ? (
          <aside
            id="catalog-rail"
            aria-label="Catalog filters"
            className="hidden self-start lg:sticky lg:top-[calc(var(--header-h)+16px)] lg:block lg:max-h-[calc(100dvh-var(--header-h)-32px)] lg:overflow-y-auto lg:pr-2"
          >
            {rail}
          </aside>
        ) : null}

        <div ref={resultsRef} className="min-w-0" aria-live="polite" aria-busy={isLoading}>
          {error ? (
            <Unavailable title="The catalog did not load">
              {error}{' '}
              <button type="button" onClick={refetch} className="text-accent hover:underline">
                Try again
              </button>
            </Unavailable>
          ) : isLoading && cards.length === 0 ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i}>
                  <div className="skeleton aspect-[63/88] rounded-md" />
                  <div className="skeleton mt-2.5 h-3.5 w-3/4 rounded" />
                  <div className="skeleton mt-1.5 h-3 w-1/2 rounded" />
                </div>
              ))}
            </div>
          ) : cards.length === 0 ? (
            <Unavailable title={`No cards match “${state.q}”`}>
              Check the spelling, try fewer words, or search by set name or card number.
              {isPokemon && state.lang === 'en' ? (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => update({ lang: 'ja' })}
                    className="text-accent hover:underline"
                  >
                    Search Japanese cards instead
                  </button>
                </>
              ) : null}
            </Unavailable>
          ) : filtered.length === 0 ? (
            <Unavailable title="No cards match these filters">
              {cards.length.toLocaleString()} cards match the search, but none pass the current
              filters.{' '}
              <button type="button" onClick={resetFilters} className="text-accent hover:underline">
                Clear filters
              </button>
            </Unavailable>
          ) : (
            <>
              {state.view === 'list' ? (
                <CatalogTable
                  cards={reveal.visible}
                  game={game}
                  onOpen={(c) => openCard(c as PokemonCard)}
                  onAdd={setAdding}
                />
              ) : (
                <CatalogGrid
                  cards={reveal.visible}
                  game={game}
                  onOpen={(c) => openCard(c as PokemonCard)}
                  onAdd={setAdding}
                  onPreview={(card, layoutId) => setPreview({ card, layoutId })}
                />
              )}
              <div className="mt-8 flex flex-col items-center gap-3">
                {reveal.autoMode ? (
                  <div ref={reveal.sentinelRef} className="h-px w-full" aria-hidden />
                ) : null}
                <p className="font-mono text-[12px] tabular-nums text-ink-muted">
                  Showing {reveal.count.toLocaleString()} of {filtered.length.toLocaleString()}
                </p>
                {reveal.hasMore && !reveal.autoMode ? (
                  <button type="button" onClick={reveal.loadMore} className="btn-secondary">
                    Show {Math.min(reveal.pageSize, filtered.length - reveal.count)} more
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        size="medium"
        ariaLabel="Catalog filters"
        footer={
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="font-mono text-[12.5px] text-ink-muted">
              {filtered.length.toLocaleString()} cards
            </span>
            <button type="button" className="btn-primary" onClick={() => setSheetOpen(false)}>
              Show results
            </button>
          </div>
        }
      >
        {rail}
      </Modal>

      <CardSpotlight
        card={(preview?.card as PokemonCard) ?? null}
        layoutId={preview?.layoutId}
        onClose={() => setPreview(null)}
      >
        {preview ? (
          <QuickPreviewFacts
            card={preview.card}
            onDetails={() => {
              const c = preview.card;
              setPreview(null);
              openCard(c as PokemonCard);
            }}
            onAdd={() => {
              const c = preview.card;
              setPreview(null);
              setAdding(c);
            }}
          />
        ) : null}
      </CardSpotlight>

      <AddToVaultModal
        card={adding as PokemonCard | null}
        isOpen={adding != null}
        onClose={() => setAdding(null)}
        onSuccess={() => setAdding(null)}
        game={game}
      />
    </PageShell>
  );
}
