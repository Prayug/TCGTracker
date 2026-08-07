import React, { useState, useEffect } from 'react';
import { PokemonCard } from '../../../types/pokemon';
import { Modal } from '../../../components/common/Modal';
import { PriceChart } from './PriceChart';
import { PriceHistoryApi } from '../../../services/priceHistoryApi';
import { AddToVaultModal } from '../../../features/vault/components/AddToVaultModal';
import { Database, Heart, Loader2, Vault, TrendingUp } from 'lucide-react';
import { vaultService } from '../../../services/vaultService';
import { pokemonApi } from '../../../services/pokemonApi';
import { priceTrackingService } from '../../../services/priceTrackingService';
import { cardWishlistService } from '../../../services/cardWishlistService';
import { useGame } from '../../../contexts/GameContext';
import { useToast } from '../../../components/common/Toast';
import { fetchCardPopulation, PopulationLookupResponse } from '../../../services/populationApi';
import {
  fetchGradedPrices,
  fetchGradedSpreads,
  fetchAllGradedPriceHistory,
  AllGradedPriceHistoryResult,
  GradedPriceResult,
  GradedPriceEntry,
  GradedSpreadSummary,
} from '../../../services/gradedPricesApi';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { toIsoDate } from '../../../utils/priceHistory';
import { GradedMultiPriceChart, gradedSeriesKey } from './GradedMultiPriceChart';

interface InvestmentModalProps {
  card: PokemonCard | null;
  isOpen: boolean;
  onClose: () => void;
}

function formatDisplayDate(dateStr: string): string {
  const iso = toIsoDate(dateStr);
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function graderLabel(grader: string): string {
  const map: Record<string, string> = {
    psa: 'PSA',
    cgc: 'CGC',
    bgs: 'BGS',
    sgc: 'SGC',
    tag: 'TAG',
    ace: 'ACE',
    generic: '',
    ungraded: 'Raw',
  };
  return map[grader] ?? grader.toUpperCase();
}

function formatGradeLabel(grade: string): string {
  return grade
    .split(/\s+/)
    .map((part) => {
      if (/^\d+(\.\d+)?$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

function gradedRowLabel(entry: GradedPriceEntry): string {
  if (entry.grader === 'ungraded') return 'Raw';
  const lab = graderLabel(entry.grader);
  return `${lab} ${formatGradeLabel(entry.grade)}`.trim();
}

const GRADER_ORDER = ['ungraded', 'psa', 'cgc', 'bgs', 'sgc', 'tag', 'ace'];
const GRADE_ORDER = ['10', '10 pristine', '10 black', '9.5', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'ungraded'];

function sortGradedEntries(a: GradedPriceEntry, b: GradedPriceEntry): number {
  const ga = GRADER_ORDER.indexOf(a.grader);
  const gb = GRADER_ORDER.indexOf(b.grader);
  if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
  const oa = GRADE_ORDER.indexOf(a.grade);
  const ob = GRADE_ORDER.indexOf(b.grade);
  return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
}

function pickDefaultGradedSeries(
  prices: GradedPriceEntry[]
): { grader: string; grade: string } | null {
  const priced = prices.filter(
    (p) =>
      p.price != null &&
      p.price > 0 &&
      p.grader !== 'ungraded' &&
      p.grader !== 'generic'
  );
  if (priced.length === 0) return null;
  const psa10 = priced.find((p) => p.grader === 'psa' && p.grade === '10');
  if (psa10) return { grader: psa10.grader, grade: psa10.grade };
  const any10 = priced.find((p) => p.grade === '10');
  if (any10) return { grader: any10.grader, grade: any10.grade };
  return { grader: priced[0].grader, grade: priced[0].grade };
}

function formatAsOf(isoOrEpoch: string | number | undefined | null): string {
  if (isoOrEpoch == null) return '';
  const date = typeof isoOrEpoch === 'number' ? new Date(isoOrEpoch) : new Date(isoOrEpoch);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function FreshnessNote({
  fetchedAt,
  stale,
}: {
  fetchedAt?: string | number | null;
  stale?: boolean | null;
}) {
  const label = formatAsOf(fetchedAt);
  if (!label) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        stale ? 'bg-loss/15 text-loss' : 'bg-gain/15 text-gain'
      }`}
    >
      {stale ? `stale · as of ${label}` : `as of ${label}`}
    </span>
  );
}

export const InvestmentModal: React.FC<InvestmentModalProps> = ({ card, isOpen, onClose }) => {
  const { game } = useGame();
  const { showToast } = useToast();
  const [priceHistory, setPriceHistory] = useState<Array<{ date: string; price: number }>>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [isInVault, setIsInVault] = useState(false);
  const [isTracked, setIsTracked] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState('normal');
  const [populationData, setPopulationData] = useState<PopulationLookupResponse | null>(null);
  const [isLoadingPopulation, setIsLoadingPopulation] = useState(false);
  const [showPopulation, setShowPopulation] = useState(false);
  const [gradedPrices, setGradedPrices] = useState<GradedPriceResult | null>(null);
  const [gradedSpreads, setGradedSpreads] = useState<GradedSpreadSummary | null>(null);
  const [isLoadingGradedPrices, setIsLoadingGradedPrices] = useState(false);
  const [showGradedPrices, setShowGradedPrices] = useState(true);
  const [selectedGradedSeries, setSelectedGradedSeries] = useState<{
    grader: string;
    grade: string;
  } | null>(null);
  const [allGradedHistory, setAllGradedHistory] = useState<AllGradedPriceHistoryResult | null>(
    null
  );
  const [isLoadingGradedHistory, setIsLoadingGradedHistory] = useState(false);

  const hasGradedPrices = gradedPrices?.prices && gradedPrices.prices.length > 0;

  useEffect(() => {
    if (!isOpen) {
      setGradedPrices(null);
      setGradedSpreads(null);
      setShowGradedPrices(true);
      setIsLoadingGradedPrices(false);
      setSelectedGradedSeries(null);
      setAllGradedHistory(null);
      setIsLoadingGradedHistory(false);
      return;
    }

    setGradedPrices(null);
    setGradedSpreads(null);
    setShowGradedPrices(true);
    setSelectedGradedSeries(null);
    setAllGradedHistory(null);
  }, [card?.id, isOpen]);

  const variantOptions = React.useMemo(() => {
    const fromPrices = card?.tcgplayer?.prices
      ? Object.keys(card.tcgplayer.prices)
      : [];
    const keys = new Set(fromPrices);
    if (card?.preferredVariant) {
      keys.add(card.preferredVariant);
    }
    if (keys.size === 0) {
      return [{ key: 'normal', label: 'Normal' }];
    }
    return [...keys].map((key) => ({
      key,
      label: key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase()),
    }));
  }, [card]);

  const gradedRows = React.useMemo(() => {
    if (!gradedPrices?.prices) return [];
    return [...gradedPrices.prices]
      .filter((p) => p.grader !== 'ungraded' && p.grader !== 'generic')
      .sort(sortGradedEntries);
  }, [gradedPrices]);

  const selectedGradedEntry = React.useMemo(() => {
    if (!selectedGradedSeries) return null;
    return (
      gradedRows.find(
        (e) =>
          e.grader === selectedGradedSeries.grader && e.grade === selectedGradedSeries.grade
      ) ?? null
    );
  }, [gradedRows, selectedGradedSeries]);

  // Compare slabs to TCGPlayer/canonical raw — never PriceCharting "ungraded".
  const rawGradedPrice = gradedSpreads?.rawPrice ?? null;

  const selectedVsRaw = React.useMemo(() => {
    const price = selectedGradedEntry?.price;
    if (price == null || price <= 0 || rawGradedPrice == null || rawGradedPrice <= 0) {
      return null;
    }
    return {
      multiple: price / rawGradedPrice,
      premiumPct: ((price - rawGradedPrice) / rawGradedPrice) * 100,
    };
  }, [selectedGradedEntry?.price, rawGradedPrice]);

  useEffect(() => {
    if (card && isOpen) {
      fetchPriceHistory();
      setIsInVault(vaultService.isInVault(card.id, game));
      setIsTracked(priceTrackingService.isTracked(card.id, game));
      setIsWishlisted(cardWishlistService.isWishlisted(card.id, game));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- don't refetch on same-id enrich
  }, [card?.id, isOpen, selectedVariant, game]);

  useEffect(() => {
    if (card && isOpen) fetchPopulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, isOpen, selectedVariant]);

  useEffect(() => {
    if (card && isOpen) fetchGradedPricesData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, isOpen]);

  useEffect(() => {
    if (!card || !isOpen) return;
    const preferred = card.preferredVariant;
    const match = preferred
      ? variantOptions.find((option) => option.key.toLowerCase() === preferred.toLowerCase())
      : undefined;
    if (match) {
      setSelectedVariant(match.key);
      return;
    }
    // Default to the highest coherent listing so the modal matches browse.
    let bestKey = variantOptions[0]?.key || 'normal';
    let bestPrice = 0;
    for (const option of variantOptions) {
      const price = pokemonApi.extractCardPrice(card, option.key);
      if (price > bestPrice) {
        bestPrice = price;
        bestKey = option.key;
      }
    }
    setSelectedVariant(bestKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, card?.preferredVariant, isOpen]);

  const handleTrack = () => {
    if (card) {
      priceTrackingService.trackCard(card, game);
      setIsTracked(true);
      showToast('Added to price watchlist', 'success');
    }
  };

  const handleWishlist = () => {
    if (!card) return;
    const nowOn = cardWishlistService.toggle(card, game);
    setIsWishlisted(nowOn);
    showToast(nowOn ? 'Added to wishlist' : 'Removed from wishlist', nowOn ? 'success' : 'info');
  };

  const fetchPriceHistory = async () => {
    if (!card) return;
    setIsLoadingHistory(true);
    try {
      const history = await PriceHistoryApi.getPokemonCardPriceHistory({
        id: card.id,
        name: card.name,
        set: card.set,
        number: card.number,
        rarity: card.rarity,
        productId: card.tcgplayer?.productId,
        variant: selectedVariant,
      });
      if (history?.length > 0) {
        setPriceHistory(history);
        setHasRealData(true);
      } else {
        setPriceHistory([]);
        setHasRealData(false);
      }
    } catch {
      setPriceHistory([]);
      setHasRealData(false);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchPopulation = async () => {
    if (!card) return;
    setIsLoadingPopulation(true);
    try {
      const result = await fetchCardPopulation({
        cardId: card.id,
        cardName: card.name,
        setId: card.set?.id,
        setName: card.set?.name,
        cardNumber: card.number,
        variant: selectedVariant,
      });
      setPopulationData(result);
    } finally {
      setIsLoadingPopulation(false);
    }
  };

  const fetchGradedPricesData = async () => {
    if (!card) return;
    setIsLoadingGradedPrices(true);
    try {
      const [result, spreads] = await Promise.all([
        fetchGradedPrices({
          cardId: card.id,
          cardName: card.name,
          setId: card.set?.id,
          setName: card.set?.name,
          cardNumber: card.number,
        }),
        fetchGradedSpreads(card.id),
      ]);
      setGradedPrices(result);
      setGradedSpreads(spreads);
      if (result?.prices?.length) {
        setSelectedGradedSeries((prev) => prev ?? pickDefaultGradedSeries(result.prices));
      }
    } finally {
      setIsLoadingGradedPrices(false);
    }
  };

  useEffect(() => {
    if (!card || !isOpen) {
      setAllGradedHistory(null);
      return;
    }

    let cancelled = false;
    setIsLoadingGradedHistory(true);
    fetchAllGradedPriceHistory({ cardId: card.id, days: 365 })
      .then((result) => {
        if (cancelled) return;
        setAllGradedHistory(result);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingGradedHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [card?.id, isOpen]);

  if (!card) return null;

  const selectedVariantLabel =
    variantOptions.find((option) => option.key === selectedVariant)?.label || 'Normal';
  const firstHistoryPrice = priceHistory[0]?.price || 0;
  const lastHistoryPrice = priceHistory[priceHistory.length - 1]?.price || 0;
  const listingFallback =
    (card.marketPrice && card.marketPrice > 0 ? card.marketPrice : 0) ||
    pokemonApi.extractCardPrice(card, selectedVariant) ||
    0;
  // Headline = backend snapshot (latest history point). Listing is fallback before history loads.
  const actualCardPrice = lastHistoryPrice || listingFallback;
  const priceChange = lastHistoryPrice > 0 && firstHistoryPrice > 0 ? lastHistoryPrice - firstHistoryPrice : 0;
  const priceChangePercent = firstHistoryPrice > 0 ? (priceChange / firstHistoryPrice) * 100 : 0;
  const isPositiveChange = priceChange >= 0;

  const popCompanies = [
    { key: 'psa', label: 'PSA' },
    { key: 'cgc', label: 'CGC' },
    { key: 'beckett', label: 'BGS' },
  ] as const;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="detail" variant="dive">
        <div className="min-w-0">
          <div className="flex gap-4 sm:gap-5">
            <img
              src={card.images.large || card.images.small}
              alt=""
              className="aspect-[5/7] w-[8.5rem] shrink-0 rounded-xl border border-border-default bg-surface-inset object-contain shadow-md sm:w-[9.5rem]"
              loading="lazy"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (card.images.small && target.src !== card.images.small) {
                  target.src = card.images.small;
                }
              }}
            />

            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold leading-tight text-ink-primary sm:text-2xl">{card.name}</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {card.set.name}
                {card.number ? ` · #${card.number}` : ''}
              </p>
              {card.rarity && (
                <p className="mt-0.5 text-sm text-ink-muted">{card.rarity}</p>
              )}

              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-3xl font-bold tabular-nums text-ink-primary">
                  {formatCurrency(actualCardPrice)}
                </span>
                {isWishlisted && (() => {
                  const wish = cardWishlistService.getItem(card.id, game);
                  if (
                    wish?.targetPrice != null &&
                    actualCardPrice > 0 &&
                    actualCardPrice <= wish.targetPrice
                  ) {
                    return (
                      <span className="rounded-full bg-gain/15 px-2.5 py-0.5 text-xs font-semibold text-gain">
                        At buy target
                      </span>
                    );
                  }
                  return null;
                })()}
                {priceHistory.length > 1 && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ${
                      isPositiveChange ? 'bg-gain/15 text-gain' : 'bg-loss/15 text-loss'
                    }`}
                  >
                    {isPositiveChange ? '+' : ''}
                    {formatCurrency(priceChange, { signed: false })} ({priceChangePercent.toFixed(1)}%)
                  </span>
                )}
                {isLoadingHistory && (
                  <Loader2 className="h-4 w-4 animate-spin text-ink-muted" aria-label="Loading price" />
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={selectedVariant}
                  onChange={(e) => setSelectedVariant(e.target.value)}
                  className="input max-w-[11rem] py-1.5 text-sm"
                  aria-label="Card finish"
                >
                  {variantOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleTrack}
                  disabled={isTracked}
                  className={
                    isTracked
                      ? 'inline-flex items-center gap-2 rounded-lg border border-border-default px-3 py-1.5 text-sm text-ink-muted'
                      : 'btn-secondary'
                  }
                >
                  <TrendingUp className="h-4 w-4" />
                  {isTracked ? 'Tracking' : 'Track price'}
                </button>
                <button
                  type="button"
                  onClick={handleWishlist}
                  className={
                    isWishlisted
                      ? 'inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-muted px-3 py-1.5 text-sm text-accent'
                      : 'btn-secondary'
                  }
                >
                  <Heart className={`h-4 w-4 ${isWishlisted ? 'fill-current' : ''}`} />
                  {isWishlisted ? 'Wishlisted' : 'Wishlist'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsVaultModalOpen(true)}
                  className={isInVault ? 'btn-secondary' : 'btn-primary'}
                >
                  <Vault className="h-4 w-4" />
                  {isInVault ? 'In vault' : 'Add to vault'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-border-subtle pt-5">
            {priceHistory.length > 0 ? (
              <PriceChart
                priceHistory={priceHistory}
                variant="dark"
                height={300}
                compact
              />
            ) : isLoadingHistory ? (
              <div className="flex h-[300px] items-center justify-center rounded-xl border border-border-default bg-surface-inset">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            ) : (
              <div className="flex h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border-strong text-center">
                <Database className="mb-2 h-8 w-8 text-ink-muted" />
                <p className="text-sm text-ink-muted">No price history yet</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {selectedVariantLabel} · sync backend for snapshots
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-border-subtle pt-4">
            <button
              type="button"
              onClick={() => setShowGradedPrices((v) => !v)}
              className="flex w-full items-center justify-between gap-3 text-left text-sm text-ink-muted hover:text-ink-secondary"
              aria-expanded={showGradedPrices}
            >
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-medium text-ink-secondary">
                Slab prices
                {isLoadingGradedPrices && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                )}
                {gradedPrices && (
                  <FreshnessNote
                    fetchedAt={gradedPrices.fetchedAt}
                    stale={gradedPrices.stale}
                  />
                )}
                {!showGradedPrices && hasGradedPrices && (
                  <span className="truncate font-normal tabular-nums text-ink-muted">
                    {gradedRows
                      .slice(0, 3)
                      .map(
                        (e) =>
                          `${gradedRowLabel(e)} ${e.price != null ? formatCurrency(e.price) : '—'}`
                      )
                      .join(' · ')}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-ink-muted">{showGradedPrices ? '▾' : '▸'}</span>
            </button>
            {showGradedPrices && (
              <div className="mt-3">
                {isLoadingGradedPrices ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-accent" />
                  </div>
                ) : gradedRows.length === 0 ? (
                  <p className="py-4 text-center text-sm text-ink-muted">No graded prices available</p>
                ) : (
                  <div className="space-y-3">
                    <div
                      className="relative overflow-hidden rounded-2xl border border-border-default"
                      style={{ background: 'var(--gradient-chrome)' }}
                    >
                      <div
                        className="pointer-events-none absolute inset-0 opacity-80"
                        style={{
                          background:
                            'radial-gradient(ellipse 80% 70% at 100% 0%, rgba(110,231,183,0.14), transparent 55%), radial-gradient(ellipse 60% 50% at 0% 100%, rgba(91,196,212,0.1), transparent 50%)',
                        }}
                        aria-hidden
                      />
                      <div className="relative px-4 pt-4 sm:px-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-foil">
                              Graded price history
                            </p>
                            <p className="mt-1 truncate font-display text-lg font-semibold tracking-tight text-ink-primary sm:text-xl">
                              {selectedGradedEntry
                                ? gradedRowLabel(selectedGradedEntry)
                                : 'Toggle grades below'}
                            </p>
                          </div>
                          {selectedVsRaw && selectedGradedEntry?.grader !== 'ungraded' && (
                            <div className="shrink-0 text-right">
                              <p className="font-mono text-2xl font-bold tabular-nums leading-none text-accent sm:text-3xl">
                                {selectedVsRaw.multiple.toFixed(
                                  selectedVsRaw.multiple >= 10 ? 1 : 2
                                )}
                                <span className="text-base font-semibold text-accent/80">×</span>
                              </p>
                              <p className="mt-1 text-[11px] font-medium text-ink-muted">vs raw</p>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
                          <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-ink-primary sm:text-4xl">
                            {selectedGradedEntry?.price != null
                              ? formatCurrency(selectedGradedEntry.price)
                              : '—'}
                          </p>
                          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                            {selectedVsRaw && selectedGradedEntry?.grader !== 'ungraded' && (
                              <span
                                className={`rounded-md px-2 py-0.5 font-mono font-semibold tabular-nums ${
                                  selectedVsRaw.premiumPct >= 0
                                    ? 'bg-gain-muted text-gain'
                                    : 'bg-loss-muted text-loss'
                                }`}
                              >
                                {formatPercent(selectedVsRaw.premiumPct, { signed: true })}
                              </span>
                            )}
                            {selectedGradedEntry && selectedGradedEntry.soldListings > 0 && (
                              <span className="text-ink-muted">
                                {selectedGradedEntry.soldListings.toLocaleString()} comps
                              </span>
                            )}
                            {rawGradedPrice != null &&
                              selectedGradedEntry?.grader !== 'ungraded' && (
                                <span className="text-ink-muted">
                                  raw {formatCurrency(rawGradedPrice)}
                                </span>
                              )}
                          </div>
                        </div>
                      </div>

                      <div className="relative mt-2 border-t border-border-subtle/80 px-3 pb-3 pt-2 sm:px-4">
                        {isLoadingGradedHistory && !allGradedHistory ? (
                          <div className="flex h-[180px] items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-accent" />
                          </div>
                        ) : (
                          <GradedMultiPriceChart
                            history={allGradedHistory}
                            livePrices={gradedRows}
                            height={200}
                            focusedKey={
                              selectedGradedSeries
                                ? gradedSeriesKey(
                                    selectedGradedSeries.grader,
                                    selectedGradedSeries.grade
                                  )
                                : null
                            }
                            onFocusKey={(key) => {
                              const [grader, ...gradeParts] = key.split('::');
                              setSelectedGradedSeries({
                                grader,
                                grade: gradeParts.join('::') || '10',
                              });
                            }}
                          />
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-ink-muted">
                      Click a grade in the legend to show/hide · double-click to focus
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-border-subtle pt-4">
            <button
              type="button"
              onClick={() => setShowPopulation((v) => !v)}
              className="flex w-full items-center justify-between text-left text-sm text-ink-muted hover:text-ink-secondary"
              aria-expanded={showPopulation}
            >
              <span>
                Graded pop
                {populationData && (
                  <FreshnessNote
                    fetchedAt={populationData.fetchedAt}
                    stale={populationData.stale}
                  />
                )}
                {!showPopulation && populationData && (
                  <span className="ml-2 tabular-nums text-ink-muted">
                    {popCompanies
                      .map(({ key, label }) => {
                        const company = populationData.companies?.[
                          key as keyof PopulationLookupResponse['companies']
                        ];
                        const val = company?.total;
                        return val != null ? `${label} ${val.toLocaleString()}` : null;
                      })
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </span>
              <span className="text-ink-muted">{showPopulation ? '▾' : '▸'}</span>
            </button>
            {showPopulation && (
              <div className="mt-3">
                <div className="grid grid-cols-3 gap-3">
                  {popCompanies.map(({ key, label }) => {
                    const data =
                      populationData?.companies?.[
                        key as keyof PopulationLookupResponse['companies']
                      ];
                    const value = data?.total;
                    const grade10 = data?.grade10;
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-border-default bg-surface-inset px-3 py-2.5 text-center"
                      >
                        <p className="text-xs font-medium text-ink-muted">{label}</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums text-ink-primary">
                          {isLoadingPopulation ? '…' : value != null ? value.toLocaleString() : '—'}
                        </p>
                        {grade10 != null && grade10 > 0 && (
                          <p className="mt-0.5 text-[11px] text-ink-muted">
                            {grade10.toLocaleString()} {key === 'psa' ? 'PSA 10' : key === 'cgc' ? 'CGC 10' : '10'}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-center text-[11px] text-ink-muted">
                  Total graded submissions (all grades) · PSA 10 count is the top grade
                </p>
              </div>
            )}
          </div>

          {hasRealData && priceHistory.length > 0 && (
            <p className="mt-3 text-center text-xs text-ink-muted">
              TCGPlayer {selectedVariantLabel} · as of{' '}
              {formatDisplayDate(priceHistory[priceHistory.length - 1].date)}
            </p>
          )}
        </div>
      </Modal>

      <AddToVaultModal
        card={card}
        isOpen={isVaultModalOpen}
        onClose={() => setIsVaultModalOpen(false)}
        onSuccess={() => setIsInVault(vaultService.isInVault(card.id, game))}
        game={game}
      />
    </>
  );
};
