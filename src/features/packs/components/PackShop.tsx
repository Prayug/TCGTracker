import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Pack } from '../../../types/pokemon';
import { tieredPackService } from '../../../services/tieredPackService';
import { useGame } from '../../../contexts/GameContext';
import { PackOpeningModal } from './PackOpeningModal';
import { PackPullKindBadge } from './PackPullCardDisplay';
import { Package, Sparkles, History, Zap, ChevronDown, ArrowRight } from 'lucide-react';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { formatCurrency } from '../../../utils/cardDisplay';
import { activePackRanges, getPullTheme, packIdentityStats } from '../packPresentation';

export const PackShop: React.FC = () => {
  const { game, isOnePiece } = useGame();
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

  const history = tieredPackService.getHistory(game);

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'starter':
        return 'from-surface-overlay to-surface-raised';
      case 'bronze':
        return 'from-[#1a222c] to-[#0b0f14]';
      case 'silver':
        return 'from-[#12201c] to-[#0b0f14]';
      case 'gold':
        return 'from-[#1c2410] via-[#121820] to-[#0b0f14]';
      case 'platinum':
        return 'from-[#102428] via-[#0b0f14] to-[#05060a]';
      default:
        return 'from-surface-overlay to-surface-raised';
    }
  };

  /** Unified Chromatic Vault hover — chartreuse / foil, not rainbow */
  const getTierGlow = (tier: string) => {
    switch (tier) {
      case 'starter':
        return 'hover:border-border-strong';
      case 'bronze':
        return 'hover:border-foil/40';
      case 'silver':
        return 'hover:border-foil/50';
      case 'gold':
        return 'hover:border-accent/55 hover:shadow-glow-accent';
      case 'platinum':
        return 'hover:border-accent/60 hover:shadow-glow-foil';
      default:
        return 'hover:border-border-strong';
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-border-default border-t-accent" />
      </div>
    );
  }

  return (
    <div className="section-stack">
      <div className="space-y-2">
        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-foil">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow-accent" aria-hidden />
          Simulated rip lab
        </p>
        <h2 className="font-display text-h1 text-ink-primary">
          {isOnePiece ? 'One Piece pack shop' : 'Pack shop'}
        </h2>
        <p className="max-w-2xl text-sm text-ink-secondary">
          Open tiered packs with play-money odds — results are simulated, not financial advice.
          {isOnePiece
            ? ' Pulls come from One Piece set pools.'
            : ' Each tier can land a raw card or PSA 10 slab — whichever fits the pool at that value.'}
        </p>
      </div>

      {isOnePiece && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/10 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-primary">Prefer set-accurate OP odds?</p>
            <p className="text-xs text-ink-secondary">
              Use the One Piece pack simulator at{' '}
              <span className="font-mono text-accent">/open</span> for per-set pull rates and
              box/case rips.
            </p>
          </div>
          <Link
            to="/open"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-accent-hover"
          >
            Open /open simulator
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {history.packsOpened > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <article className="card min-w-0">
            <p className="section-label mb-2">Packs opened</p>
            <p className="truncate text-3xl font-bold tabular-nums text-ink-primary">
              {history.packsOpened}
            </p>
          </article>
          <article className="card min-w-0">
            <p className="section-label mb-2">Total spent</p>
            <p className="truncate text-3xl font-bold tabular-nums text-ink-primary">
              {formatCurrency(history.totalSpent)}
            </p>
          </article>
          <article className="card min-w-0">
            <p className="section-label mb-2">Pull value</p>
            <p className="truncate text-3xl font-bold tabular-nums text-gain">
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
                  className={`relative min-h-[12.5rem] bg-gradient-to-br ${getTierColor(pack.tier)} p-5 text-white`}
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
                    {(() => {
                      const stats = packIdentityStats(
                        activePackRanges(pack, !!boostedPacks[pack.id]),
                        pack.price
                      );
                      return (
                        <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-white/90">
                          <div>
                            <dt className="text-white/55">Floor</dt>
                            <dd className="mt-0.5 font-bold tabular-nums">
                              {formatCurrency(stats.floor)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-white/55">Top pull</dt>
                            <dd className="mt-0.5 font-bold tabular-nums">
                              {formatCurrency(stats.top)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-white/55">Jackpot</dt>
                            <dd className="mt-0.5 font-bold tabular-nums">
                              {stats.jackpotChance % 1 === 0
                                ? `${stats.jackpotChance}%`
                                : `${stats.jackpotChance.toFixed(1)}%`}
                            </dd>
                          </div>
                        </dl>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex justify-between border-b border-border-subtle pb-3 text-center text-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted">Cards</p>
                      <p className="font-bold tabular-nums text-ink-primary">{pack.cardsPerPack}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                        Avg value
                      </p>
                      <p className="font-bold tabular-nums text-emerald-300">
                        {formatCurrency(pack.averageValue)}
                      </p>
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
                          <span className="ml-1.5 inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                            BOOSTED
                          </span>
                        )}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-ink-muted transition-transform group-open/odds:rotate-180" />
                    </summary>
                    <div
                      className="mt-3 space-y-2"
                      role="table"
                      aria-label={`${pack.name} pull rates`}
                    >
                      {(boostedPacks[pack.id] && pack.boostedValueRanges
                        ? pack.boostedValueRanges
                        : pack.valueRanges
                      ).map((range, idx) => (
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
                    className="mt-auto flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-bold text-primary-foreground shadow-glow-accent transition-all hover:bg-accent-hover active:scale-[0.99]"
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
          <div className="space-y-1.5">
            {history.pulls.slice(0, 8).map((pull, index) => {
              const card = pull.cards[0];
              const theme = getPullTheme(pull);
              const thumb = card?.images?.small || card?.images?.large;
              return (
                <div
                  key={`${pull.openedAt}-${index}`}
                  className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-inset px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-hover"
                >
                  {thumb ? (
                    <img src={thumb} alt="" className="h-11 w-8 shrink-0 rounded-sm object-cover" />
                  ) : (
                    <div className="h-11 w-8 shrink-0 rounded-sm bg-surface-hover" aria-hidden />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                    <p className="truncate text-xs text-ink-muted sm:w-[7.5rem] sm:shrink-0 sm:text-sm">
                      {pull.pack.name}
                    </p>
                    <div className="flex min-w-0 items-center gap-2">
                      <PackPullKindBadge theme={theme} className="!px-1.5 !py-0 !text-[9px]" />
                      <p className="truncate text-sm font-medium text-ink-primary">
                        {card?.name ?? 'Pack pull'}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums text-ink-secondary">
                      {formatCurrency(pull.totalValue)}
                    </p>
                    <p
                      className={`text-sm font-medium tabular-nums ${
                        pull.profit >= 0 ? 'text-gain' : 'text-loss'
                      }`}
                    >
                      {formatCurrency(pull.profit, { signed: true })}
                    </p>
                  </div>
                </div>
              );
            })}
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
