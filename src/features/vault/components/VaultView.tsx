import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, MoreHorizontal, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import type { CardCondition, VaultCard } from '../../../types/pokemon';
import { vaultService } from '../../../services/vaultService';
import { useVault } from '../../../hooks/useVault';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../components/common/Toast';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { PageHeader, FilterChip } from '../../../components/layout/PageShell';
import { Basis, Delta, Price, Unavailable } from '../../../components/exchange/Price';
import { CoverageMeter } from '../../../components/exchange/CoverageMeter';
import {
  fetchPortfolioStats,
  type PortfolioStatsSummary,
} from '../../../services/portfolioApiService';
import { formatCurrency } from '../../../utils/cardDisplay';
import { summarizePortfolio } from '../../../utils/portfolio';
import { GradeWorthinessList } from '../../market/components/GradeWorthinessList';
import { HoldingsTable } from './HoldingsTable';
import { HoldingSheet } from './HoldingSheet';
import { VaultActivity, VaultAnalysis, VaultGallery, VaultSets } from './VaultModes';
import {
  CONDITION_LABEL,
  type HoldingSort,
  type SortDir,
  defaultDir,
  filterHoldings,
  setKey,
  sortHoldings,
} from '../ledger';
import { cn } from '@/lib/utils';

type Mode = 'holdings' | 'gallery' | 'sets' | 'analysis' | 'activity';
const MODES: { id: Mode; label: string }[] = [
  { id: 'holdings', label: 'Holdings' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'sets', label: 'By set' },
  { id: 'analysis', label: 'Allocation' },
  { id: 'activity', label: 'Activity' },
];
const SORTS: HoldingSort[] = ['value', 'pl', 'plPct', 'cost', 'name', 'set', 'qty', 'date'];

/**
 * The personal collection ledger. Every summary figure states what it
 * covers: value counts priced holdings, P/L counts holdings with a recorded
 * cost, and coverage shows how much of the collection those two describe.
 */
export function VaultView({ onOpenSet }: { onOpenSet?: (setId: string) => void }) {
  const { cards, activity, game, refresh } = useVault();
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [remote, setRemote] = useState<PortfolioStatsSummary | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const mode = (MODES.find((m) => m.id === params.get('mode'))?.id ?? 'holdings') as Mode;
  const sort = (SORTS.find((s) => s === params.get('sort')) ?? 'value') as HoldingSort;
  const dir: SortDir =
    params.get('dir') === 'asc' ? 'asc' : params.get('dir') === 'desc' ? 'desc' : defaultDir(sort);
  const filter = {
    q: params.get('q') ?? '',
    set: params.get('set') ?? '',
    condition: (params.get('condition') ?? '') as '' | CardCondition,
    missingCost: params.get('filter') === 'missing-cost',
  };

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true, preventScrollReset: true }
      );
    },
    [setParams]
  );

  useEffect(() => {
    if (!isAuthenticated) return setRemote(null);
    let alive = true;
    fetchPortfolioStats()
      .then((s) => alive && setRemote(s))
      .catch(() => alive && setRemote(null));
    return () => {
      alive = false;
    };
  }, [isAuthenticated, cards.length]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Drop selections that no longer exist (removed elsewhere).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(cards.map((c) => c.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [cards]);

  const summary = useMemo(() => summarizePortfolio(cards), [cards]);
  const rows = useMemo(
    () => sortHoldings(filterHoldings(cards, filter), sort, dir),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter is derived from params
    [cards, params, sort, dir]
  );
  const setOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const vc of cards) m.set(setKey(vc), vc.card.set?.name || 'Unknown set');
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [cards]);
  const openHolding = cards.find((c) => c.id === openId) ?? null;
  const filtersActive = Boolean(filter.q || filter.set || filter.condition || filter.missingCost);

  const onSort = (key: HoldingSort) => {
    const nextDir = key === sort ? (dir === 'asc' ? 'desc' : 'asc') : defaultDir(key);
    update({
      sort: key === 'value' ? null : key,
      dir: nextDir === defaultDir(key) ? null : nextDir,
    });
  };

  const exportVault = () => {
    const blob = new Blob([vaultService.exportVault(game)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tcg-vault-${game}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  const importVault = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          vaultService.importVault(String(reader.result), game);
          refresh();
          showToast('Collection imported', 'success');
        } catch {
          showToast('That file is not a TCGTracker collection export', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const bulkDelete = () => {
    selected.forEach((id) => vaultService.removeFromVault(id, game));
    showToast(`Removed ${selected.size} holding${selected.size === 1 ? '' : 's'}`, 'info');
    setSelected(new Set());
    setConfirmBulk(false);
  };

  const gameLabel = game === 'onepiece' ? 'One Piece' : 'Pokémon';

  if (cards.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader title="Vault" meta={`${gameLabel} collection`} />
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <h2 className="font-display text-[24px] leading-tight">Start your ledger</h2>
            <p className="mt-2 max-w-[52ch] text-[14px] text-ink-secondary">
              Add the cards you own and what you paid. The vault values them at today’s market,
              shows profit only where you recorded a cost, and tells you what the collection is made
              of.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/browse" className="btn-primary">
                <Search className="h-4 w-4" aria-hidden />
                Find a card
              </Link>
              {game === 'pokemon' ? (
                <Link to="/scanner" className="btn-secondary">
                  Scan a card
                </Link>
              ) : null}
              <button type="button" onClick={importVault} className="btn-ghost">
                <Upload className="h-4 w-4" aria-hidden />
                Import an export file
              </button>
            </div>
          </div>
          <ol className="border-t border-rule-strong text-[13.5px] md:mt-1">
            {[
              ['Find it', 'Search the catalog or scan the card.'],
              ['Record it', 'Copies, condition, and what you paid. Unknown is fine.'],
              ['Read it', 'Value, known-cost profit, and allocation by set and era.'],
            ].map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[2rem_minmax(0,1fr)] border-b border-rule py-3">
                <span className="font-mono text-ink-muted">{i + 1}</span>
                <span>
                  <span className="font-medium">{t}.</span>{' '}
                  <span className="text-ink-secondary">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vault"
        meta={`${summary.uniqueCards} cards · ${summary.copies} copies · ${setOptions.length} sets`}
        actions={
          <>
            <Link to="/browse" className="btn-primary">
              <Plus className="h-4 w-4" aria-hidden />
              Add cards
            </Link>
            <button type="button" onClick={importVault} className="btn-secondary">
              <Upload className="h-4 w-4" aria-hidden />
              Import
            </button>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="btn-secondary w-10 px-0"
                aria-label="More collection actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-border-default bg-surface-overlay py-1 shadow-popover"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={exportVault}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[13.5px] hover:bg-surface-hover"
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    Export as JSON
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmClear(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[13.5px] text-loss hover:bg-surface-hover"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Clear collection…
                  </button>
                </div>
              ) : null}
            </div>
          </>
        }
      />

      {/* Ledger summary: three figures, each with its coverage stated. */}
      <section
        aria-label="Collection summary"
        className="grid gap-x-10 gap-y-6 border-b border-rule pb-6 md:grid-cols-3"
      >
        <div>
          <p className="text-meta text-ink-muted">Market value</p>
          <Price value={summary.marketValue} size="lg" className="mt-1 block" />
          <Basis
            kind="Market estimate"
            source="TCGplayer"
            detail={
              summary.unpricedEntries > 0
                ? `${summary.unpricedEntries} unpriced holding${summary.unpricedEntries === 1 ? '' : 's'} not counted`
                : 'Near Mint, raw'
            }
            className="mt-1.5"
          />
        </div>
        <div>
          <p className="text-meta text-ink-muted">Unrealized profit / loss</p>
          {summary.unrealized != null ? (
            <>
              <p
                className={cn(
                  'mt-1 font-mono text-[28px] font-medium leading-none tabular-nums tracking-[-0.025em]',
                  summary.unrealized > 0 && 'text-gain',
                  summary.unrealized < 0 && 'text-loss'
                )}
              >
                {formatCurrency(summary.unrealized, { signed: true })}
              </p>
              <p className="mt-1.5 text-[12px] text-ink-muted">
                <Delta pct={summary.unrealizedPct} className="mr-1" />
                on {formatCurrency(summary.knownCost)} of recorded cost
              </p>
            </>
          ) : (
            <p className="mt-2 text-[13.5px] text-ink-secondary">
              Record what you paid for a card to see profit and loss.
            </p>
          )}
          {remote?.realizedPnl != null && remote.realizedPnl !== 0 ? (
            <p className="mt-1 text-[12px] text-ink-muted">
              Realized from recorded sales:{' '}
              <span className="font-mono text-ink-primary">
                {formatCurrency(remote.realizedPnl, { signed: true })}
              </span>
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-meta text-ink-muted">Cost coverage</p>
          <p className="mt-1 font-mono text-[28px] font-medium leading-none tabular-nums tracking-[-0.025em]">
            {Math.round(summary.costCoverage * 100)}%
          </p>
          <span className="mt-2.5 block">
            <CoverageMeter value={summary.costCoverage} />
          </span>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            of value has a recorded cost.{' '}
            {summary.missingCostEntries > 0 ? (
              <button
                type="button"
                onClick={() => update({ mode: null, filter: 'missing-cost' })}
                className="text-accent hover:underline"
              >
                {summary.missingCostEntries} holding{summary.missingCostEntries === 1 ? '' : 's'}{' '}
                need a cost
              </button>
            ) : (
              'Every holding has one.'
            )}
          </p>
        </div>
      </section>

      <div
        role="tablist"
        aria-label="Collection view"
        className="segmented max-w-full overflow-x-auto"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => update({ mode: m.id === 'holdings' ? null : m.id })}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'holdings' || mode === 'gallery' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <label htmlFor="vault-q" className="sr-only">
                Search holdings
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                aria-hidden
              />
              <input
                id="vault-q"
                type="search"
                value={filter.q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder="Search by name, set or number"
                className="input h-10 w-full pl-9"
              />
            </div>
            <label htmlFor="vault-set" className="sr-only">
              Set
            </label>
            <select
              id="vault-set"
              value={filter.set}
              onChange={(e) => update({ set: e.target.value })}
              className="input h-10 w-auto max-w-[14rem] text-[13px]"
            >
              <option value="">All sets</option>
              {setOptions.map(([k, name]) => (
                <option key={k} value={k}>
                  {name}
                </option>
              ))}
            </select>
            <label htmlFor="vault-cond" className="sr-only">
              Condition
            </label>
            <select
              id="vault-cond"
              value={filter.condition}
              onChange={(e) => update({ condition: e.target.value })}
              className="input h-10 w-auto text-[13px]"
            >
              <option value="">Any condition</option>
              {(Object.keys(CONDITION_LABEL) as CardCondition[]).map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </option>
              ))}
            </select>
            <FilterChip
              active={filter.missingCost}
              onClick={() => update({ filter: filter.missingCost ? null : 'missing-cost' })}
            >
              Missing cost
              {summary.missingCostEntries > 0 ? (
                <span className="ml-1.5 font-mono text-[12px]">{summary.missingCostEntries}</span>
              ) : null}
            </FilterChip>
            {filtersActive ? (
              <button
                type="button"
                onClick={() => update({ q: null, set: null, condition: null, filter: null })}
                className="inline-flex h-8 items-center gap-1 px-2 text-[13px] text-ink-muted hover:text-ink-primary"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Clear
              </button>
            ) : null}
          </div>

          {filter.missingCost && rows.length > 0 && mode === 'holdings' ? (
            <p className="border-l-2 border-warn bg-warn-muted px-3 py-2 text-[13px] text-ink-secondary">
              These holdings have no recorded cost, so they are left out of profit and loss. Use{' '}
              <span className="font-medium">Add cost</span> in a row (wider screens) or open a
              holding to fill it in. Leave it blank if you genuinely don’t know.
            </p>
          ) : null}

          {selected.size > 0 && mode === 'holdings' ? (
            <div
              className="flex flex-wrap items-center gap-3 border-y border-rule-strong bg-surface-raised px-3 py-2"
              role="region"
              aria-label="Bulk actions"
            >
              <span className="font-mono text-[13px]">{selected.size} selected</span>
              <button
                type="button"
                onClick={() => setConfirmBulk(true)}
                className="btn-ghost h-8 text-loss"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Remove
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="btn-ghost h-8"
              >
                Clear selection
              </button>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <Unavailable title="No holdings match">
              {filter.missingCost && !filter.q && !filter.set && !filter.condition
                ? 'Every holding has a recorded cost.'
                : 'Try a different search or clear the filters.'}
            </Unavailable>
          ) : mode === 'holdings' ? (
            <HoldingsTable
              rows={rows}
              game={game}
              sort={sort}
              dir={dir}
              onSort={onSort}
              selected={selected}
              onToggle={(id) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onToggleAll={() =>
                setSelected((prev) => {
                  const all = rows.every((r) => prev.has(r.id));
                  const next = new Set(prev);
                  rows.forEach((r) => (all ? next.delete(r.id) : next.add(r.id)));
                  return next;
                })
              }
              onOpen={(vc: VaultCard) => setOpenId(vc.id)}
            />
          ) : (
            <VaultGallery rows={rows} onOpen={(vc) => setOpenId(vc.id)} />
          )}

          {mode === 'holdings' && game === 'pokemon' && !filtersActive ? (
            <div className="pt-6">
              <GradeWorthinessList
                variant="compact"
                cardIds={[...new Set(cards.map((c) => c.card.id))]}
                limit={10}
                title="Worth grading"
                subtitle="Among your holdings · net after PSA fees, weighted by gem rate"
                emptyMessage="None of your holdings clears the grading fee with a verified PSA 10 quote and population report."
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'sets' ? (
        <VaultSets cards={cards} onOpenSet={game === 'pokemon' ? onOpenSet : undefined} />
      ) : null}
      {mode === 'analysis' ? (
        <VaultAnalysis cards={cards} onFilterSet={(k) => update({ mode: null, set: k })} />
      ) : null}
      {mode === 'activity' ? <VaultActivity items={activity} /> : null}

      <HoldingSheet
        holding={openHolding}
        game={game}
        onClose={() => setOpenId(null)}
        onSold={(pnl) =>
          showToast(
            pnl != null
              ? `Sale recorded · realized ${formatCurrency(pnl, { signed: true })}`
              : 'Sale recorded',
            'success'
          )
        }
      />
      <ConfirmDialog
        isOpen={confirmBulk}
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulk(false)}
        title={`Remove ${selected.size} holding${selected.size === 1 ? '' : 's'}?`}
        message="Their cost records are removed too. Export your collection first if you may want them back."
        confirmLabel="Remove"
        variant="destructive"
      />
      <ConfirmDialog
        isOpen={confirmClear}
        onConfirm={() => {
          vaultService.clearVault(game);
          setConfirmClear(false);
          setSelected(new Set());
          showToast('Collection cleared', 'info');
        }}
        onCancel={() => setConfirmClear(false)}
        title="Clear the whole collection?"
        message="This permanently removes every holding for this game. Type CLEAR to confirm."
        confirmLabel="Clear collection"
        variant="destructive"
        confirmText="CLEAR"
      />
    </div>
  );
}
