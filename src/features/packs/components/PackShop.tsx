import React, { useState, useEffect } from 'react';
import { Pack } from '../../../types/pokemon';
import { tieredPackService } from '../../../services/tieredPackService';
import { useGame } from '../../../contexts/GameContext';
import { PackOpeningModal } from './PackOpeningModal';
import { Package, Sparkles, History, Zap, Swords, ChevronDown } from 'lucide-react';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { formatCurrency } from '../../../utils/cardDisplay';

export const PackShop: React.FC = () => {
  const { isOnePiece } = useGame();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [boostedPacks, setBoostedPacks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadPacks();
  }, []);

  const loadPacks = async () => {
    setIsLoading(true);
    try {
      setPacks(tieredPackService.getAvailablePacks());
    } catch (error) {
      console.error('Error loading packs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPack = (pack: Pack, boosted: boolean) => {
    setSelectedPack(pack);
    setBoostedPacks((prev) => ({ ...prev, [pack.id]: boosted }));
    setIsModalOpen(true);
  };

  const history = tieredPackService.getHistory();

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'starter':
        return 'from-slate-500 to-slate-700';
      case 'bronze':
        return 'from-orange-500 to-amber-700';
      case 'silver':
        return 'from-slate-300 to-slate-500';
      case 'gold':
        return 'from-yellow-400 to-amber-600';
      case 'platinum':
        return 'from-violet-400 to-fuchsia-700';
      default:
        return 'from-blue-500 to-indigo-700';
    }
  };

  /** Tier-matched glow used for the hover border/shadow on pack cards. */
  const getTierGlow = (tier: string) => {
    switch (tier) {
      case 'starter':
        return 'hover:border-slate-400/60 hover:shadow-[0_16px_40px_-12px_rgba(100,116,139,0.45)]';
      case 'bronze':
        return 'hover:border-amber-500/60 hover:shadow-[0_16px_40px_-12px_rgba(217,119,6,0.45)]';
      case 'silver':
        return 'hover:border-slate-300/70 hover:shadow-[0_16px_40px_-12px_rgba(148,163,184,0.5)]';
      case 'gold':
        return 'hover:border-yellow-400/60 hover:shadow-[0_16px_40px_-12px_rgba(234,179,8,0.5)]';
      case 'platinum':
        return 'hover:border-fuchsia-400/60 hover:shadow-[0_16px_40px_-12px_rgba(192,38,211,0.5)]';
      default:
        return 'hover:border-blue-400/60 hover:shadow-[0_16px_40px_-12px_rgba(59,130,246,0.5)]';
    }
  };

  const evRatio = (pack: Pack) => (pack.price > 0 ? pack.averageValue / pack.price : 0);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-border-default border-t-accent" />
      </div>
    );
  }

  // One Piece pack opening coming soon
  if (isOnePiece) {
    return (
      <div className="section-stack">
        <div>
          <SectionLabel className="text-violet-300/90">Simulated rip lab</SectionLabel>
          <h2 className="mt-2 text-3xl font-bold text-ink-primary">One Piece Pack Shop</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Open tiered packs with play-money odds — results are simulated, not financial advice.
          </p>
        </div>

        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-surface-raised p-12 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-border-default bg-surface-inset">
            <Swords className="h-8 w-8 text-ink-muted" aria-hidden="true" />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-ink-primary">Coming Soon</h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-ink-muted">
            One Piece pack opening is under development. In the meantime, browse and collect One Piece cards!
          </p>
          <a href="/browse" className="btn-secondary">
            <Package className="h-4 w-4" aria-hidden="true" />
            Browse One Piece Cards
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="section-stack">
      <div>
        <SectionLabel className="text-violet-300/90">Simulated rip lab</SectionLabel>
        <h2 className="mt-2 text-3xl font-bold text-ink-primary">Pack shop</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Open tiered packs with play-money odds — results are simulated, not financial advice.
        </p>
      </div>

      {history.packsOpened > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <article className="card min-w-0">
            <p className="section-label mb-2">Packs opened</p>
            <p className="truncate text-3xl font-bold tabular-nums text-ink-primary">{history.packsOpened}</p>
          </article>
          <article className="card min-w-0">
            <p className="section-label mb-2">Total spent</p>
            <p className="truncate text-3xl font-bold tabular-nums text-ink-primary">
              {formatCurrency(history.totalSpent)}
            </p>
          </article>
          <article className="card min-w-0">
            <p className="section-label mb-2">Pull value</p>
            <p className="truncate text-3xl font-bold tabular-nums text-emerald-300">
              {formatCurrency(history.totalValue)}
            </p>
          </article>
          <article className="card min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="section-label">Session P/L</p>
              <span className="rounded-md border border-border-subtle bg-surface-hover px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-muted">
                Simulated
              </span>
            </div>
            <p
              className={`truncate text-2xl font-bold tabular-nums ${
                history.totalProfit >= 0 ? 'text-gain' : 'text-loss'
              }`}
            >
              {history.totalProfit >= 0 ? '+' : ''}
              {formatCurrency(history.totalProfit)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">Play-money session only</p>
          </article>
        </div>
      )}

      <div>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink-primary">
          <Sparkles className="h-5 w-5 text-violet-400" />
          Available packs
        </h3>

        {packs.length === 0 ? (
          <PageEmptyState
            icon={Package}
            title="No packs available"
            message="Check back later for new simulated pack tiers."
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {packs.map((pack) => (
              <div
                key={pack.id}
                className={`group flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-inset shadow-card transition-all duration-300 hover:-translate-y-1.5 ${getTierGlow(pack.tier)}`}
              >
                <div
                  className={`relative min-h-[10.5rem] bg-gradient-to-br ${getTierColor(pack.tier)} p-5 text-white`}
                >
                  <div className="holo-texture" aria-hidden="true" />
                  <div className="absolute inset-0 bg-black/25" aria-hidden="true" />
                  <div className="holo-sweep" aria-hidden="true" />
                  <div className="relative">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xl font-bold drop-shadow-sm">{pack.name}</h4>
                      <Zap className="h-5 w-5 shrink-0 opacity-80" />
                    </div>
                    <p className="mt-1 text-sm text-white/85">{pack.description}</p>
                    <div className="mt-4 flex items-baseline gap-2">
                      <span className="text-3xl font-black tabular-nums drop-shadow-sm">
                        {formatCurrency(pack.price)}
                      </span>
                      <span className="text-xs text-white/70">per pack</span>
                    </div>
                    <p className="mt-2 inline-flex rounded-md border border-white/20 bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white/90">
                      EV: ${evRatio(pack).toFixed(2)}/dollar spent
                    </p>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex justify-between border-b border-border-subtle pb-3 text-center text-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted">Cards</p>
                      <p className="font-bold tabular-nums text-ink-primary">{pack.cardsPerPack}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted">Avg value</p>
                      <p className="font-bold tabular-nums text-emerald-300">{formatCurrency(pack.averageValue)}</p>
                    </div>
                  </div>

                  {/* Boost toggle */}
                  {pack.boostedValueRanges && (
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 cursor-pointer select-none transition-colors hover:bg-amber-500/10">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Zap className="h-4 w-4 shrink-0 text-amber-400" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink-primary">Boosted</p>
                          <p className="text-[11px] text-ink-muted">Higher variance, same price</p>
                        </div>
                      </div>
                      <div className="relative shrink-0">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={!!boostedPacks[pack.id]}
                          onChange={(e) => {
                            e.stopPropagation();
                            setBoostedPacks((prev) => ({ ...prev, [pack.id]: e.target.checked }));
                          }}
                        />
                        <div className="h-6 w-11 rounded-full bg-surface-hover transition-colors peer-checked:bg-amber-500" />
                        <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
                      </div>
                    </label>
                  )}

                  <details className="group/odds">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-ink-secondary transition-colors hover:text-ink-primary [&::-webkit-details-marker]:hidden">
                      <span>
                        Pull rates (full disclosure)
                        {boostedPacks[pack.id] && (
                          <span className="ml-1.5 inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">BOOSTED</span>
                        )}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-ink-muted transition-transform group-open/odds:rotate-180" />
                    </summary>
                    <div className="mt-3 space-y-2" role="table" aria-label={`${pack.name} pull rates`}>
                      {(boostedPacks[pack.id] && pack.boostedValueRanges ? pack.boostedValueRanges : pack.valueRanges).map((range, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs" role="row">
                          <span className="w-24 truncate text-ink-muted" title={range.label}>
                            {range.label}
                          </span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${getTierColor(pack.tier)}`}
                              style={{ width: `${Math.min(range.probability, 100)}%` }}
                            />
                          </div>
                          <span className="w-12 text-right font-semibold tabular-nums text-ink-secondary">
                            {range.probability.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                      <p className="pt-1 text-[10px] leading-relaxed text-ink-muted">
                        Simulated odds. Every pull uses these exact probabilities — no hidden
                        modifiers.
                      </p>
                    </div>
                  </details>

                  <button
                    type="button"
                    className={`mt-auto flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r py-3 text-sm font-bold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg active:scale-[0.99] ${getTierColor(pack.tier)}`}
                    onClick={() => handleOpenPack(pack, !!boostedPacks[pack.id])}
                  >
                    <Sparkles className="h-4 w-4" />
                    {boostedPacks[pack.id] ? 'Open boosted pack' : 'Open pack'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {history.pulls.length > 0 && (
        <div>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink-primary">
            <History className="h-5 w-5 text-sky-400" />
            Recent openings
          </h3>
          <div className="space-y-2.5">
            {history.pulls.slice(0, 5).map((pull, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-surface-inset p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-hover hover:shadow-card"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={pull.pack.imageUrl || '/images/pokemontcg/base1/logo.png'}
                    alt={pull.pack.name}
                    className="h-10 w-10 shrink-0 object-contain"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-primary">{pull.pack.name}</p>
                    <p className="text-xs text-ink-muted">
                      {new Date(pull.openedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <p className="tabular-nums text-ink-muted">{formatCurrency(pull.totalValue)}</p>
                  <p className={`font-medium tabular-nums ${pull.profit >= 0 ? 'text-gain' : 'text-loss'}`}>
                    {pull.profit >= 0 ? '+' : ''}
                    {formatCurrency(pull.profit)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <PackOpeningModal
        pack={selectedPack}
        isOpen={isModalOpen}
        initialBoosted={selectedPack ? !!boostedPacks[selectedPack.id] : false}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedPack(null);
          loadPacks();
        }}
      />
    </div>
  );
};
