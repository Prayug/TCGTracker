import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { VaultCard as VaultCardType, CardCondition } from '../../../types/pokemon';
import { vaultService } from '../../../services/vaultService';
import { useGame } from '../../../contexts/GameContext';
import { VaultCard } from './VaultCard';
import { VaultPortfolioBySet } from './VaultPortfolioBySet';
import { VaultPerformanceReport } from './VaultPerformanceReport';
import { VaultKpiStrip } from './VaultKpiStrip';
import { VaultInsightStrip } from './VaultInsightStrip';
import { VaultActivityFeed } from './VaultActivityFeed';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { useToast } from '../../../components/common/Toast';
import { FilterBar, FilterChip } from '../../../components/layout/PageShell';
import {
  Vault,
  Download,
  Upload,
  Camera,
  Search,
  Plus,
  MoreHorizontal,
  LayoutGrid,
  List,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  holdingMarketValue,
  holdingProfit,
  isAssumedCost,
} from '../../../utils/vaultCost';

interface VaultViewProps {
  onOpenSet?: (setId: string) => void;
}

type VaultPanel = 'holdings' | 'performance' | 'sets' | 'activity';
type SortKey = 'value' | 'pl' | 'name' | 'date' | 'qty';
type ViewMode = 'table' | 'grid';

const CONDITION_OPTIONS: { value: '' | CardCondition; label: string }[] = [
  { value: '', label: 'All conditions' },
  { value: 'raw', label: 'Raw' },
  { value: 'near-mint', label: 'NM' },
  { value: 'lightly-played', label: 'LP' },
  { value: 'moderately-played', label: 'MP' },
  { value: 'heavily-played', label: 'HP' },
  { value: 'damaged', label: 'Damaged' },
];

export const VaultView: React.FC<VaultViewProps> = ({ onOpenSet }) => {
  const { game, isPokemon } = useGame();
  const { showToast } = useToast();
  const [vaultCards, setVaultCards] = useState<VaultCardType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [panel, setPanel] = useState<VaultPanel>('holdings');
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState('');
  const [setFilter, setSetFilter] = useState('');
  const [conditionFilter, setConditionFilter] = useState<'' | CardCondition>('');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [assumedOnly, setAssumedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusEditId, setFocusEditId] = useState<string | null>(null);

  const loadVaultCards = useCallback(() => {
    setIsLoading(true);
    setVaultCards(vaultService.getVaultCards(game));
    setIsLoading(false);
  }, [game]);

  useEffect(() => {
    loadVaultCards();
    const onVaultUpdated = () => loadVaultCards();
    window.addEventListener('tcg:vault-updated', onVaultUpdated);
    return () => window.removeEventListener('tcg:vault-updated', onVaultUpdated);
  }, [loadVaultCards]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const handleRemoveCard = (id: string) => {
    vaultService.removeFromVault(id, game);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    loadVaultCards();
  };

  const handleExport = () => {
    const data = vaultService.exportVault(game);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tcg-vault-${game}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setOverflowOpen(false);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          vaultService.importVault(ev.target?.result as string, game);
          loadVaultCards();
          showToast('Vault imported successfully!', 'success');
        } catch {
          showToast('Error importing vault: Invalid file format', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearConfirm = () => {
    vaultService.clearVault(game);
    loadVaultCards();
    setSelected(new Set());
    setShowClearConfirm(false);
    showToast('Vault cleared successfully', 'info');
  };

  const handleBulkDelete = () => {
    selected.forEach((id) => vaultService.removeFromVault(id, game));
    setSelected(new Set());
    loadVaultCards();
    showToast(`Removed ${selected.size} holding${selected.size === 1 ? '' : 's'}`, 'info');
  };

  const stats = vaultService.getVaultStats(game);
  const activity = useMemo(() => vaultService.getActivity(game), [vaultCards, game]);
  const gameLabel = isPokemon ? 'Pokémon' : 'One Piece';

  const setOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const vc of vaultCards) {
      const id = vc.card.set?.id || vc.card.set?.name || '';
      const name = vc.card.set?.name || 'Unknown';
      if (id) map.set(id, name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [vaultCards]);

  const setCount = setOptions.length;

  const filteredSorted = useMemo(() => {
    let list = [...vaultCards];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((vc) => {
        const name = vc.card.name?.toLowerCase() ?? '';
        const set = vc.card.set?.name?.toLowerCase() ?? '';
        const num = vc.card.number?.toLowerCase() ?? '';
        return name.includes(q) || set.includes(q) || num.includes(q);
      });
    }
    if (setFilter) {
      list = list.filter(
        (vc) => vc.card.set?.id === setFilter || vc.card.set?.name === setFilter
      );
    }
    if (conditionFilter) {
      list = list.filter((vc) => vc.condition === conditionFilter);
    }
    if (assumedOnly) {
      list = list.filter(isAssumedCost);
    }

    list.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.card.name.localeCompare(b.card.name);
        case 'date':
          return new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime();
        case 'qty':
          return b.quantity - a.quantity;
        case 'pl':
          return holdingProfit(b).profit - holdingProfit(a).profit;
        case 'value':
        default:
          return holdingMarketValue(b) - holdingMarketValue(a);
      }
    });
    return list;
  }, [vaultCards, search, setFilter, conditionFilter, assumedOnly, sortKey]);

  const allVisibleSelected =
    filteredSorted.length > 0 && filteredSorted.every((vc) => selected.has(vc.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredSorted.forEach((vc) => next.delete(vc.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredSorted.forEach((vc) => next.add(vc.id));
        return next;
      });
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reviewAssumed = () => {
    setPanel('holdings');
    setAssumedOnly(true);
    setSearch('');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="font-display text-h1 tracking-tight text-ink-primary sm:text-[clamp(2rem,4vw,3rem)]">
            {gameLabel} Vault
          </h1>
          <p className="text-sm text-ink-secondary">
            Personal Collection
            {vaultCards.length > 0 ? (
              <>
                {' '}
                · {stats.uniqueCards} unique · {stats.totalCards} total
              </>
            ) : (
              <> · Add cards to start tracking</>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Link to="/browse" className="btn-primary h-9 px-3 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add cards
          </Link>
          <button type="button" onClick={handleImport} className="btn-secondary h-9 px-3 text-xs">
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
          <div className="relative" ref={overflowRef}>
            <button
              type="button"
              onClick={() => setOverflowOpen((v) => !v)}
              className="btn-secondary h-9 w-9 px-0"
              aria-label="More actions"
              aria-expanded={overflowOpen}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {overflowOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-1.5 w-44 overflow-hidden rounded-lg border border-border-default bg-surface-overlay py-1 shadow-popover"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={vaultCards.length === 0}
                  onClick={handleExport}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-secondary hover:bg-surface-hover disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
                {vaultCards.length > 0 ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOverflowOpen(false);
                      setShowClearConfirm(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-loss hover:bg-surface-hover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear vault
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {vaultCards.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-default bg-surface-raised/50 px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/40 bg-accent/10">
            <Vault className="h-7 w-7 text-accent" aria-hidden />
          </div>
          <h2 className="font-display text-lg font-semibold text-ink-primary">Your vault is empty</h2>
          <p className="mt-1.5 max-w-sm text-sm text-ink-secondary">
            {isPokemon
              ? 'Scan a card or browse the marketplace to start your collection.'
              : 'Browse One Piece cards to add your first entry.'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {isPokemon ? (
              <Link to="/scanner" className="btn-primary h-9 text-sm">
                <Camera className="h-4 w-4" aria-hidden />
                Scan a card
              </Link>
            ) : null}
            <Link to="/browse" className={cn('h-9 text-sm', isPokemon ? 'btn-secondary' : 'btn-primary')}>
              <Search className="h-4 w-4" aria-hidden />
              Browse {gameLabel}
            </Link>
          </div>
        </div>
      ) : (
        <>
          <VaultKpiStrip stats={stats} vaultCards={vaultCards} />

          <VaultInsightStrip
            vaultCards={vaultCards}
            assumedCostCount={stats.assumedCostCount}
            onReviewAssumed={reviewAssumed}
            onFocusHolding={(id) => {
              setPanel('holdings');
              setFocusEditId(id);
              setAssumedOnly(false);
            }}
          />

          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'holdings' as const, label: 'Holdings', badge: vaultCards.length },
                { id: 'performance' as const, label: 'Performance' },
                ...(isPokemon
                  ? [{ id: 'sets' as const, label: 'Sets', badge: setCount }]
                  : []),
                { id: 'activity' as const, label: 'Activity', badge: activity.length || undefined },
              ] as { id: VaultPanel; label: string; badge?: number }[]
            ).map((tab) => (
              <FilterChip key={tab.id} active={panel === tab.id} onClick={() => setPanel(tab.id)}>
                {tab.label}
                {tab.badge !== undefined ? (
                  <span
                    className={cn(
                      'ml-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                      panel === tab.id
                        ? 'bg-accent/20 text-accent'
                        : 'bg-surface-inset text-ink-muted'
                    )}
                  >
                    {tab.badge}
                  </span>
                ) : null}
              </FilterChip>
            ))}
          </div>

          {panel === 'holdings' ? (
            <div className="space-y-3">
              <FilterBar className="items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search holdings..."
                      className="input h-9 w-full pl-8 text-sm"
                    />
                  </div>
                  <select
                    value={setFilter}
                    onChange={(e) => setSetFilter(e.target.value)}
                    className="input h-9 max-w-[10rem] text-xs"
                    aria-label="Filter by set"
                  >
                    <option value="">All sets</option>
                    {setOptions.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={conditionFilter}
                    onChange={(e) =>
                      setConditionFilter(e.target.value as '' | CardCondition)
                    }
                    className="input h-9 text-xs"
                    aria-label="Filter by condition"
                  >
                    {CONDITION_OPTIONS.map((o) => (
                      <option key={o.value || 'all'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="input h-9 text-xs"
                    aria-label="Sort holdings"
                  >
                    <option value="value">Value high → low</option>
                    <option value="pl">P/L high → low</option>
                    <option value="name">Name</option>
                    <option value="date">Date</option>
                    <option value="qty">Quantity</option>
                  </select>
                  {assumedOnly ? (
                    <button
                      type="button"
                      onClick={() => setAssumedOnly(false)}
                      className="rounded-lg bg-amber-400/15 px-2.5 py-1.5 text-xs font-medium text-amber-300"
                    >
                      Assumed cost · Clear
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-border-subtle p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={cn(
                      'rounded-md p-1.5 cursor-pointer',
                      viewMode === 'table' ? 'bg-accent/15 text-accent' : 'text-ink-muted'
                    )}
                    aria-label="Table view"
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={cn(
                      'rounded-md p-1.5 cursor-pointer',
                      viewMode === 'grid' ? 'bg-accent/15 text-accent' : 'text-ink-muted'
                    )}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              </FilterBar>

              {selected.size > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised px-3 py-2">
                  <span className="text-xs text-ink-secondary">
                    {selected.size} selected
                  </span>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="btn-destructive h-8 px-3 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="btn-ghost h-8 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              {filteredSorted.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-default px-6 py-10 text-center text-sm text-ink-secondary">
                  No holdings match these filters.
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {filteredSorted.map((vaultCard) => (
                    <VaultCard
                      key={vaultCard.id}
                      vaultCard={vaultCard}
                      onRemove={handleRemoveCard}
                      onUpdate={loadVaultCards}
                      selected={selected.has(vaultCard.id)}
                      onToggleSelect={toggleSelect}
                      forceEdit={focusEditId === vaultCard.id}
                      onEditHandled={() => setFocusEditId(null)}
                      view="grid"
                    />
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised">
                  <div className="max-h-[min(70vh,52rem)] overflow-auto">
                    <div
                      className={cn(
                        'sticky top-0 z-10 hidden border-b border-border-subtle bg-surface-raised/95 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted backdrop-blur-sm sm:grid sm:gap-x-3',
                        'sm:grid-cols-[1.5rem_2.75rem_minmax(0,1.4fr)_2.5rem_2.75rem_4.75rem_4.75rem_4.5rem_4rem_2rem]'
                      )}
                    >
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="flex h-7 w-7 items-center justify-center"
                        aria-label="Select all"
                      >
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          readOnly
                          className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                        />
                      </button>
                      <span />
                      <button
                        type="button"
                        className="cursor-pointer text-left hover:text-ink-primary"
                        onClick={() => setSortKey('name')}
                      >
                        Card
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer text-right hover:text-ink-primary"
                        onClick={() => setSortKey('qty')}
                      >
                        Qty
                      </button>
                      <span className="text-right">Cond.</span>
                      <span className="text-right">Cost</span>
                      <button
                        type="button"
                        className="cursor-pointer text-right hover:text-ink-primary"
                        onClick={() => setSortKey('value')}
                      >
                        Market
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer text-right hover:text-ink-primary"
                        onClick={() => setSortKey('pl')}
                      >
                        P/L
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer text-right hover:text-ink-primary"
                        onClick={() => setSortKey('date')}
                      >
                        Updated
                      </button>
                      <span />
                    </div>
                    <div>
                      {filteredSorted.map((vaultCard) => (
                        <VaultCard
                          key={vaultCard.id}
                          vaultCard={vaultCard}
                          onRemove={handleRemoveCard}
                          onUpdate={loadVaultCards}
                          selected={selected.has(vaultCard.id)}
                          onToggleSelect={toggleSelect}
                          forceEdit={focusEditId === vaultCard.id}
                          onEditHandled={() => setFocusEditId(null)}
                          view="table"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {panel === 'performance' ? <VaultPerformanceReport vaultCards={vaultCards} /> : null}

          {panel === 'sets' && isPokemon ? (
            <VaultPortfolioBySet vaultCards={vaultCards} onOpenSet={onOpenSet} />
          ) : null}

          {panel === 'activity' ? <VaultActivityFeed items={activity} /> : null}
        </>
      )}

      <ConfirmDialog
        isOpen={showClearConfirm}
        onConfirm={handleClearConfirm}
        onCancel={() => setShowClearConfirm(false)}
        title="Clear vault?"
        message="This permanently removes every holding in this vault. Type CLEAR to confirm."
        confirmLabel="Clear vault"
        variant="destructive"
        confirmText="CLEAR"
      />
    </div>
  );
};
