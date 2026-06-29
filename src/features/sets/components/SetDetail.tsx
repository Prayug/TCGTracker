import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Layers,
  DollarSign,
  Target,
  TrendingUp,
  PieChart,
} from 'lucide-react';
import { PriceChart } from '../../market/components/PriceChart';
import { TrackerStatCard } from '../../market/components/TrackerStatCard';
import { SetBinderGrid } from './SetBinderGrid';
import { AddToVaultModal } from '../../vault/components/AddToVaultModal';
import {
  setTrackerService,
  SetTrackerCard,
  SetSummary,
  ValueHistoryRange,
} from '../../../services/setTrackerService';
import { setWishlistService } from '../../../services/setWishlistService';
import { onePieceApi } from '../../../services/onepieceApi';
import { OnePieceCard } from '../../../types/onepiece';
import { useGame } from '../../../contexts/GameContext';
import { PokemonSet } from '../../../types/pokemon';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { sortSetTrackerCards, SetCardSort } from '../../../utils/setCardSort';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { ErrorMessage } from '../../../components/common/ErrorMessage';
import { SetLogo } from './SetLogo';
import { formatReleaseYear } from '../../../utils/setEra';

interface SetDetailProps {
  setId: string;
  onBack: () => void;
}

type FilterMode = 'all' | 'owned' | 'missing' | 'wishlist';

function OnePieceSetBinderGrid({
  cards,
  onCardClick,
}: {
  cards: OnePieceCard[];
  onCardClick: (card: OnePieceCard) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onCardClick(card)}
          className="group relative overflow-hidden rounded-lg border border-border-default bg-surface-raised shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong"
        >
          <div className="aspect-[63/88] overflow-hidden bg-surface-inset">
            {card.images?.small ? (
              <img
                src={card.images.small}
                alt={card.name}
                className="h-full w-full object-contain p-1 transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-ink-muted">
                {card.name}
              </div>
            )}
          </div>
          <div className="p-1.5">
            <p className="truncate text-[11px] font-medium text-white">{card.name}</p>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-[10px] text-ink-muted">{card.id}</span>
              {card.marketPrice != null && card.marketPrice > 0 && (
                <span className="text-[10px] font-medium text-gain">
                  ${card.marketPrice.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export const SetDetail: React.FC<SetDetailProps> = ({ setId, onBack }) => {
  const { isPokemon, isOnePiece } = useGame();
  const [setMeta, setSetMeta] = useState<PokemonSet | null>(null);
  const [cards, setCards] = useState<SetTrackerCard[]>([]);
  const [opCards, setOpCards] = useState<OnePieceCard[]>([]);
  const [summary, setSummary] = useState<SetSummary | null>(null);
  const [historyRange, setHistoryRange] = useState<ValueHistoryRange>('90d');
  const [priceHistory, setPriceHistory] = useState<{ date: string; price: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sortBy, setSortBy] = useState<SetCardSort>('number');
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(() =>
    isPokemon ? setWishlistService.getWishlistForSet(setId) : new Set()
  );
  const [vaultCard, setVaultCard] = useState<SetTrackerCard | null>(null);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    if (isOnePiece) {
      try {
        const data = await onePieceApi.getSetCards(setId);
        setOpCards(data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const wish = setWishlistService.getWishlistForSet(setId);
    setWishlistIds(wish);
    try {
      const [cardsRes, summaryRes, history] = await Promise.all([
        setTrackerService.getSetCards(setId, wish),
        setTrackerService.getSetSummary(setId, wish),
        setTrackerService.getSetValueHistory(setId, historyRange),
      ]);
      setSetMeta(cardsRes.set);
      setCards(cardsRes.cards);
      setSummary(summaryRes.summary);
      setPriceHistory(setTrackerService.toPricePoints(history, summaryRes.summary.totalCards));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [setId, historyRange, isPokemon, isOnePiece]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleToggleWishlist = (cardId: string) => {
    setWishlistService.toggleWishlist(setId, cardId);
    const next = setWishlistService.getWishlistForSet(setId);
    setWishlistIds(next);
    reload();
  };

  const handleAddToVault = (card: SetTrackerCard) => {
    setVaultCard(card);
    setVaultModalOpen(true);
  };

  const handleVaultSuccess = () => {
    setVaultModalOpen(false);
    setVaultCard(null);
    reload();
  };

  const handleOPCardClick = (card: OnePieceCard) => {
    // For now, just show the card image in a new tab
    if (card.images?.large) {
      window.open(card.images.large, '_blank');
    }
  };

  const filterButtons: { key: FilterMode; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'owned', label: 'Owned' },
    { key: 'missing', label: 'Missing' },
    { key: 'wishlist', label: 'Wishlist' },
  ];

  if (isLoading && !setMeta && !opCards.length) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={reload} />;
  }

  // One Piece set detail view
  if (isOnePiece) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          All sets
        </button>

        <section className="rounded-xl border border-border-default bg-surface-raised p-4 text-white shadow-sm">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent-muted text-accent">
              <Layers className="h-8 w-8" />
            </div>
            <div className="min-w-0 flex-1">
              <SectionLabel className="text-accent/90">One Piece TCG</SectionLabel>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{setId}</h1>
              <p className="mt-1 text-sm text-ink-muted">
                {opCards.length} cards · Prices from TCGPlayer
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TrackerStatCard
                icon={Layers}
                label="Total cards"
                value={opCards.length}
                helper="Cards in this set"
              />
              <TrackerStatCard
                icon={DollarSign}
                label="Set value"
                value={formatCurrency(opCards.reduce((sum, c) => sum + (c.marketPrice || 0), 0))}
                helper="Sum of all market prices"
                tone="gain"
              />
            </div>
          </div>
        </section>

        <OnePieceSetBinderGrid cards={opCards} onCardClick={handleOPCardClick} />
      </div>
    );
  }

  // Pokemon set detail view (original)
  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        All sets
      </button>

      <section className="rounded-xl border border-border-default bg-surface-raised p-4 text-white shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          {setMeta && <SetLogo set={setMeta} size="lg" />}
          <div className="min-w-0 flex-1">
            <SectionLabel className="text-accent/90">
              {setMeta?.eraLabel || 'Set detail'}
            </SectionLabel>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{setMeta?.name || setId}</h1>
            {setMeta && (
              <p className="mt-1 text-sm text-ink-muted">
                {setMeta.series && <span>{setMeta.series}</span>}
                {setMeta.series && formatReleaseYear(setMeta.releaseDate) && <span> · </span>}
                {formatReleaseYear(setMeta.releaseDate) && (
                  <span>Released {formatReleaseYear(setMeta.releaseDate)}</span>
                )}
              </p>
            )}
          </div>
        </div>
        {summary && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-sm text-ink-secondary">
              <span>
                {summary.ownedCount} / {summary.totalCards} owned
              </span>
              <span>{formatPercent(summary.completionPct)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  summary.completionPct >= 100 ? 'bg-gold' : 'bg-accent'
                }`}
                style={{ width: `${Math.min(100, summary.completionPct)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              {summary.marketSyncCount} synced market prices ·{' '}
              {summary.totalCards - summary.pricedCardCount} unpriced (
              {summary.priceCoveragePct.toFixed(0)}% coverage)
            </p>
          </div>
        )}
      </section>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TrackerStatCard
            icon={Layers}
            label="Master set value"
            value={formatCurrency(summary.masterSetValue)}
            helper="Sum of all cards at market"
          />
          <TrackerStatCard
            icon={DollarSign}
            label="Your set value"
            value={formatCurrency(summary.ownedValue)}
            helper="Owned cards only"
            tone="gain"
          />
          <TrackerStatCard
            icon={Target}
            label="Cost to complete"
            value={formatCurrency(summary.costToComplete)}
            helper="Missing cards at market"
            tone="alert"
          />
          <TrackerStatCard
            icon={PieChart}
            label="Wishlist"
            value={summary.wishlistCount}
            helper="Cards marked as needed"
          />
        </div>
      )}

      <section className="rounded-xl border border-border-default bg-surface-raised p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-white">Set value over time</h2>
          </div>
          <div className="flex gap-1 rounded-lg border border-border-subtle p-0.5">
            {(['30d', '90d', '1y', 'all'] as ValueHistoryRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setHistoryRange(r)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  historyRange === r
                    ? 'bg-accent/20 text-accent'
                    : 'text-ink-muted hover:text-ink-primary'
                }`}
              >
                {r === 'all' ? 'All' : r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {priceHistory.length > 0 ? (
          <>
            <PriceChart
              priceHistory={priceHistory}
              title="Master set value (catalog cards)"
              variant="dark"
            />
            {summary && (
              <p className="mt-2 text-center text-xs text-ink-muted">
                Chart uses the same {summary.totalCards}-card checklist as master set value — one
                market price per card, not per variant listing.
              </p>
            )}
          </>
        ) : (
          <p className="py-6 text-center text-sm text-ink-muted">
            Not enough price history for this set yet.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {filterButtons.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === key
                  ? 'border-accent/40 bg-accent-muted text-accent'
                  : 'border-border-default text-ink-muted hover:text-ink-primary'
              }`}
            >
              {label}
            </button>
          ))}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SetCardSort)}
            className="rounded-lg border border-border-subtle bg-surface-hover px-3 py-1.5 text-sm text-ink-secondary focus:border-violet-500/50 focus:outline-none"
            aria-label="Sort cards"
          >
            <option value="number">Sort: Card #</option>
            <option value="price-high">Sort: Price high → low</option>
            <option value="price-low">Sort: Price low → high</option>
            <option value="name">Sort: Name</option>
            <option value="rarity">Sort: Rarity</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() =>
            setMeta && setTrackerService.exportChecklistCsv(setMeta.name, cards, wishlistIds)
          }
          className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-hover px-3 py-2 text-sm text-ink-secondary hover:text-ink-primary"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <SetBinderGrid
        cards={sortSetTrackerCards(cards, sortBy)}
        wishlistIds={wishlistIds}
        filter={filter}
        onToggleWishlist={handleToggleWishlist}
        onAddToVault={handleAddToVault}
      />

      <AddToVaultModal
        card={vaultCard}
        isOpen={vaultModalOpen}
        onClose={() => {
          setVaultModalOpen(false);
          setVaultCard(null);
        }}
        onSuccess={handleVaultSuccess}
      />
    </div>
  );
};
