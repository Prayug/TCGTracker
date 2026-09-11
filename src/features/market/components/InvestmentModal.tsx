import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PokemonCard } from '../../../types/pokemon';
import { OnePieceCard } from '../../../types/onepiece';
import { Modal } from '../../../components/common/Modal';
import { PriceChart } from './PriceChart';
import { PriceHistoryApi } from '../../../services/priceHistoryApi';
import { AddToVaultModal } from '../../../features/vault/components/AddToVaultModal';
import { Database, Heart, Loader2, Percent, Vault } from 'lucide-react';
import { vaultService } from '../../../services/vaultService';
import { pokemonApi } from '../../../services/pokemonApi';
import { onePieceApi } from '../../../services/onepieceApi';
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
import { PRICE_RANGES, PriceRangeKey, slicePriceHistory } from '../../../utils/chartDomain';
import { GradedMultiPriceChart, gradedSeriesKey } from './GradedMultiPriceChart';
import { GradedPriceCards } from './GradedPriceCards';
import { headlineGradedPrice } from './gradedPriceDisplay';
import { cn } from '@/lib/utils';

interface InvestmentModalProps {
  card: PokemonCard | OnePieceCard | null;
  isOpen: boolean;
  onClose: () => void;
}

function isOnePieceDetail(card: PokemonCard | OnePieceCard): card is OnePieceCard {
  return 'cardColor' in card || 'cardType' in card || 'cardCost' in card || 'attribute' in card;
}

function toVaultCard(card: PokemonCard | OnePieceCard): PokemonCard {
  if (!isOnePieceDetail(card) && 'set' in card && 'releaseDate' in (card.set ?? {})) {
    return card;
  }
  return {
    id: card.id,
    name: card.name,
    images: card.images,
    set: {
      id: card.set.id,
      name: card.set.name,
      releaseDate: 'releaseDate' in card.set ? String(card.set.releaseDate || '') : '',
      total: 'total' in card.set ? Number(card.set.total) || 0 : 0,
    },
    number: card.number,
    rarity: card.rarity,
    marketPrice: card.marketPrice,
  };
}

type DetailTab = 'overview' | 'grades' | 'population' | 'sales';

const TABS: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'grades', label: 'Grades' },
  { id: 'population', label: 'Population' },
  { id: 'sales', label: 'Sales' },
];

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
const GRADE_ORDER = [
  '10',
  '10 pristine',
  '10 black',
  '9.5',
  '9',
  '8',
  '7',
  '6',
  '5',
  '4',
  '3',
  '2',
  '1',
  'ungraded',
];

function sortGradedEntries(a: GradedPriceEntry, b: GradedPriceEntry): number {
  const ga = GRADER_ORDER.indexOf(a.grader);
  const gb = GRADER_ORDER.indexOf(b.grader);
  if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
  const oa = GRADE_ORDER.indexOf(a.grade);
  const ob = GRADE_ORDER.indexOf(b.grade);
  return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
}

function formatSoldAge(days?: number | null): string {
  if (days == null) return '';
  if (days <= 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}

function pickDefaultGradedSeries(
  prices: GradedPriceEntry[]
): { grader: string; grade: string } | null {
  const priced = prices.filter(
    (p) => p.price != null && p.price > 0 && p.grader !== 'ungraded' && p.grader !== 'generic'
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
      className={stale ? 'text-[11px] text-amber-200/60' : 'text-[11px] text-ink-muted'}
      title={stale ? 'No newer verified sales available.' : undefined}
    >
      {stale ? `Updated ${label}` : `as of ${label}`}
    </span>
  );
}

export const InvestmentModal: React.FC<InvestmentModalProps> = ({ card, isOpen, onClose }) => {
  const { game, isOnePiece } = useGame();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [compactHeader, setCompactHeader] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [priceRange, setPriceRange] = useState<PriceRangeKey>('6M');
  const [priceHistory, setPriceHistory] = useState<Array<{ date: string; price: number }>>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [isInVault, setIsInVault] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState('normal');
  const [populationData, setPopulationData] = useState<PopulationLookupResponse | null>(null);
  const [isLoadingPopulation, setIsLoadingPopulation] = useState(false);
  const [gradedPrices, setGradedPrices] = useState<GradedPriceResult | null>(null);
  const [gradedSpreads, setGradedSpreads] = useState<GradedSpreadSummary | null>(null);
  const [isLoadingGradedPrices, setIsLoadingGradedPrices] = useState(false);
  const [selectedGradedSeries, setSelectedGradedSeries] = useState<{
    grader: string;
    grade: string;
  } | null>(null);
  const [allGradedHistory, setAllGradedHistory] = useState<AllGradedPriceHistoryResult | null>(
    null
  );
  const [isLoadingGradedHistory, setIsLoadingGradedHistory] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setGradedPrices(null);
      setGradedSpreads(null);
      setIsLoadingGradedPrices(false);
      setSelectedGradedSeries(null);
      setAllGradedHistory(null);
      setIsLoadingGradedHistory(false);
      setCompactHeader(false);
      setActiveTab('overview');
      setPriceRange('6M');
      return;
    }

    setGradedPrices(null);
    setGradedSpreads(null);
    setSelectedGradedSeries(null);
    setAllGradedHistory(null);
    setCompactHeader(false);
    setActiveTab('overview');
    setPriceRange('6M');
  }, [card?.id, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let observer: IntersectionObserver | null = null;
    const frame = requestAnimationFrame(() => {
      const root = scrollRef.current;
      const hero = heroRef.current;
      if (!root || !hero) return;
      observer = new IntersectionObserver(
        ([entry]) => {
          setCompactHeader(entry.intersectionRatio < 0.4);
        },
        { root, threshold: [0, 0.25, 0.4, 0.75, 1] }
      );
      observer.observe(hero);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [isOpen, card?.id]);

  const variantOptions = React.useMemo(() => {
    if (isOnePiece) return [{ key: 'normal', label: 'Normal' }];
    const pokemon = card as PokemonCard | null;
    const fromPrices = pokemon?.tcgplayer?.prices ? Object.keys(pokemon.tcgplayer.prices) : [];
    const keys = new Set(fromPrices);
    if (pokemon?.preferredVariant) {
      keys.add(pokemon.preferredVariant);
    }
    if (keys.size === 0) {
      return [{ key: 'normal', label: 'Normal' }];
    }
    return [...keys].map((key) => ({
      key,
      label: key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase()),
    }));
  }, [card, isOnePiece]);

  const gradedRows = React.useMemo(() => {
    if (!gradedPrices?.prices) return [];
    return [...gradedPrices.prices]
      .filter((p) => p.grader !== 'ungraded' && p.grader !== 'generic')
      .sort(sortGradedEntries);
  }, [gradedPrices]);

  const rawGradedPrice =
    gradedSpreads?.rawPrice ??
    (card?.marketPrice && card.marketPrice > 0 ? card.marketPrice : null);

  useEffect(() => {
    if (card && isOpen) {
      fetchPriceHistory();
      setIsInVault(vaultService.isInVault(card.id, game));
      setIsWishlisted(cardWishlistService.isWishlisted(card.id, game));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- don't refetch on same-id enrich
  }, [card?.id, isOpen, selectedVariant, game, isOnePiece]);

  useEffect(() => {
    if (card && isOpen) fetchPopulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, isOpen, selectedVariant, isOnePiece]);

  useEffect(() => {
    if (card && isOpen) fetchGradedPricesData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, isOpen, selectedVariant, isOnePiece]);

  useEffect(() => {
    if (!card || !isOpen || isOnePiece) return;
    const pokemon = card as PokemonCard;
    const preferred = pokemon.preferredVariant;
    const match = preferred
      ? variantOptions.find((option) => option.key.toLowerCase() === preferred.toLowerCase())
      : undefined;
    if (match) {
      setSelectedVariant(match.key);
      return;
    }
    let bestKey = variantOptions[0]?.key || 'normal';
    let bestPrice = 0;
    for (const option of variantOptions) {
      const price = pokemonApi.extractCardPrice(pokemon, option.key);
      if (price > bestPrice) {
        bestPrice = price;
        bestKey = option.key;
      }
    }
    setSelectedVariant(bestKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, isOpen, isOnePiece]);

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
      const history = isOnePiece
        ? await onePieceApi.getPriceHistory(card.id, card.marketPrice)
        : await PriceHistoryApi.getPokemonCardPriceHistory({
            id: card.id,
            name: card.name,
            set: card.set as PokemonCard['set'],
            number: card.number,
            rarity: card.rarity,
            productId: (card as PokemonCard).tcgplayer?.productId,
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
      const pokemon = card as PokemonCard;
      const op = card as OnePieceCard;
      const result = await fetchCardPopulation({
        cardId: card.id,
        cardName: card.name,
        setId: card.set?.id,
        setName: card.set?.name,
        cardNumber: card.number,
        variant: isOnePiece ? 'normal' : selectedVariant,
        language: isOnePiece ? undefined : pokemon.language,
        matchName: isOnePiece ? undefined : pokemon.matchName,
        game: isOnePiece ? 'onepiece' : 'pokemon',
        cardImageId: isOnePiece ? op.cardImageId : undefined,
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
      const pokemon = card as PokemonCard;
      const op = card as OnePieceCard;
      const result = await fetchGradedPrices({
        cardId: card.id,
        cardName: card.name,
        setId: card.set?.id,
        setName: card.set?.name,
        cardNumber: card.number,
        language: isOnePiece ? undefined : pokemon.language,
        matchName: isOnePiece ? undefined : pokemon.matchName,
        variant: isOnePiece ? 'normal' : selectedVariant,
        game: isOnePiece ? 'onepiece' : 'pokemon',
        cardImageId: isOnePiece ? op.cardImageId : undefined,
      });
      const spreads = await fetchGradedSpreads(card.id, isOnePiece ? 'normal' : selectedVariant);
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
    fetchAllGradedPriceHistory({ cardId: card.id, days: 365, variant: selectedVariant })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch by card id + finish
  }, [card?.id, isOpen, selectedVariant]);

  const rangedHistory = useMemo(
    () => slicePriceHistory(priceHistory, priceRange),
    [priceHistory, priceRange]
  );

  if (!card) return null;

  const selectedVariantLabel =
    variantOptions.find((option) => option.key === selectedVariant)?.label || 'Normal';
  const firstHistoryPrice = rangedHistory[0]?.price || 0;
  const lastHistoryPrice = rangedHistory[rangedHistory.length - 1]?.price || 0;
  const listingFallback =
    (card.marketPrice && card.marketPrice > 0 ? card.marketPrice : 0) ||
    (isOnePiece ? 0 : pokemonApi.extractCardPrice(card as PokemonCard, selectedVariant)) ||
    0;
  const actualCardPrice = priceHistory[priceHistory.length - 1]?.price || 0 || listingFallback;
  const priceChange =
    lastHistoryPrice > 0 && firstHistoryPrice > 0 ? lastHistoryPrice - firstHistoryPrice : 0;
  const priceChangePercent = firstHistoryPrice > 0 ? (priceChange / firstHistoryPrice) * 100 : 0;
  const isPositiveChange = priceChange >= 0;

  const popCompanies = [
    { key: 'psa', label: 'PSA' },
    { key: 'cgc', label: 'CGC' },
    { key: 'beckett', label: 'BGS' },
  ] as const;

  const psaPop = populationData?.companies?.psa?.pop;

  const focusGrade = (grader: string, grade: string) => {
    setSelectedGradedSeries({ grader, grade });
    setActiveTab('grades');
  };

  const compactBar = compactHeader ? (
    <div className="flex items-center gap-3 border-b border-border-page bg-page px-5 py-2.5 pr-14 sm:px-7">
      <img
        src={card.images?.small || card.images?.large || ''}
        alt=""
        className="h-9 w-7 shrink-0 object-contain"
        style={{ borderRadius: 'var(--radius-ui)' }}
      />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{card.name}</p>
      <p className="stamp-price shrink-0 text-sm tabular-nums">{formatCurrency(actualCardPrice)}</p>
    </div>
  ) : null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="detail"
        variant="dive"
        flush
        bodyRef={scrollRef}
        header={compactBar}
      >
        <div ref={heroRef} className="bg-felt px-4 pb-5 pt-4 pr-14 sm:px-6 sm:pt-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:gap-7">
            <div className="mx-auto w-[min(14rem,70vw)] shrink-0 sm:mx-0 sm:w-[15rem]">
              <div className="sleeve-window bg-black/20 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.28)]">
                <img
                  src={card.images?.large || card.images?.small || ''}
                  alt=""
                  className="aspect-[5/7] w-full object-contain"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    if (card.images?.small && target.src !== card.images.small) {
                      target.src = card.images.small;
                    }
                  }}
                />
              </div>
            </div>

            <div className="binder-page min-w-0 flex-1 p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap gap-1.5">
                <span className="binder-tab" data-active="true">
                  Spec
                </span>
                {card.rarity ? <span className="binder-tab">{card.rarity}</span> : null}
                {!isOnePiece && (card as PokemonCard).language === 'ja' ? (
                  <span className="binder-tab">JP</span>
                ) : null}
              </div>

              <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-ink-primary sm:text-[1.85rem]">
                {card.name}
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-[11px] font-medium text-ink-muted">Set</dt>
                  <dd className="font-medium text-ink-primary">{card.set?.name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-ink-muted">Number</dt>
                  <dd className="font-mono text-ink-primary">
                    {card.number ? `#${card.number}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-ink-muted">Rarity</dt>
                  <dd className="text-ink-primary">{card.rarity || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-ink-muted">Finish</dt>
                  <dd className="text-ink-primary">
                    {isOnePiece ? 'Normal' : selectedVariantLabel}
                  </dd>
                </div>
              </dl>
              {isOnePiece &&
                (() => {
                  const op = card as OnePieceCard;
                  const bits = [
                    op.cardColor,
                    op.cardType,
                    op.cardCost ? `Cost ${op.cardCost}` : null,
                    op.cardPower ? `Power ${op.cardPower}` : null,
                  ].filter(Boolean);
                  return bits.length ? (
                    <p className="mt-2 text-sm text-ink-muted">{bits.join(' · ')}</p>
                  ) : null;
                })()}

              <div className="mt-5 border-t border-border-page pt-4">
                <p className="text-[11px] font-medium text-ink-muted">Market</p>
                <p className="stamp-price animate-stamp-price mt-1 text-4xl tabular-nums tracking-tight sm:text-5xl">
                  {formatCurrency(actualCardPrice)}
                </p>
                {rangedHistory.length > 1 && (
                  <p
                    className={`mt-1.5 text-sm tabular-nums ${
                      isPositiveChange ? 'text-gain' : 'text-loss'
                    }`}
                  >
                    {isPositiveChange ? '+' : ''}
                    {formatCurrency(priceChange, { signed: false })} ·{' '}
                    {formatPercent(priceChangePercent, { signed: true })}
                  </p>
                )}
                {isWishlisted &&
                  (() => {
                    const wish = cardWishlistService.getItem(card.id, game);
                    if (
                      wish?.targetPrice != null &&
                      actualCardPrice > 0 &&
                      actualCardPrice <= wish.targetPrice
                    ) {
                      return <p className="mt-1 text-xs font-medium text-gain">At buy target</p>;
                    }
                    return null;
                  })()}
                {isLoadingHistory && (
                  <Loader2
                    className="mt-2 h-4 w-4 animate-spin text-ink-muted"
                    aria-label="Loading price"
                  />
                )}
              </div>

              {!isOnePiece && (
                <div className="mt-4">
                  <select
                    value={selectedVariant}
                    onChange={(e) => setSelectedVariant(e.target.value)}
                    className="input h-9 max-w-[12rem] py-1.5 text-sm"
                    aria-label="Card finish"
                  >
                    {variantOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="action-tray mt-5 -mx-4 -mb-4 flex flex-wrap items-center gap-2 px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5">
                <button
                  type="button"
                  onClick={() => setIsVaultModalOpen(true)}
                  className={isInVault ? 'btn-secondary' : 'btn-primary'}
                >
                  <Vault className="h-4 w-4" />
                  {isInVault ? 'In vault' : 'Add to vault'}
                </button>
                <button
                  type="button"
                  onClick={handleWishlist}
                  className={cn('btn-icon h-10 w-10', isWishlisted && 'text-sticker')}
                  aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                  aria-pressed={isWishlisted}
                >
                  <Heart className={`h-4 w-4 ${isWishlisted ? 'fill-current' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`/deals?cardId=${encodeURIComponent(card.id)}`);
                  }}
                  className="btn-secondary h-10 px-3"
                  aria-label="Find eBay deals for this card"
                >
                  <Percent className="h-4 w-4" />
                  eBay Deals
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky top-0 z-10 border-b border-border-page bg-page px-5 sm:px-7">
          <div
            className="flex gap-1 overflow-x-auto"
            role="tablist"
            aria-label="Card detail sections"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'binder-tab shrink-0 border-b-0',
                  activeTab === tab.id ? '' : 'opacity-70'
                )}
                data-active={activeTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-page px-5 py-5 sm:px-7 sm:py-6">
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <section>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ink-primary">Market Price</h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {isOnePiece
                        ? (card as OnePieceCard).priceSource === 'tcgplayer'
                          ? 'TCGPlayer'
                          : 'Market'
                        : `${selectedVariantLabel} · TCGplayer`}
                    </p>
                  </div>
                  <div className="flex gap-0.5 rounded-lg bg-surface-raised p-0.5">
                    {PRICE_RANGES.map((range) => (
                      <button
                        key={range}
                        type="button"
                        onClick={() => setPriceRange(range)}
                        className={cn(
                          'rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums',
                          priceRange === range
                            ? 'bg-surface-hover text-ink-primary'
                            : 'text-ink-muted hover:text-ink-secondary'
                        )}
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="font-mono text-2xl font-semibold tabular-nums text-ink-primary">
                  {formatCurrency(actualCardPrice)}
                </p>
                {rangedHistory.length > 1 && (
                  <p
                    className={`mt-0.5 text-sm tabular-nums ${
                      isPositiveChange ? 'text-gain' : 'text-loss'
                    }`}
                  >
                    {formatPercent(priceChangePercent, { signed: true })}
                  </p>
                )}
                <div className="mt-3">
                  {rangedHistory.length > 0 ? (
                    <PriceChart priceHistory={rangedHistory} variant="light" height={220} compact />
                  ) : isLoadingHistory ? (
                    <div className="flex h-[220px] items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
                    </div>
                  ) : (
                    <div className="flex h-[180px] flex-col items-center justify-center text-center">
                      <Database className="mb-2 h-7 w-7 text-ink-muted" />
                      <p className="text-sm text-ink-muted">No price history yet</p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {isOnePiece
                          ? 'Sync backend for snapshots'
                          : `${selectedVariantLabel} · sync backend for snapshots`}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink-primary">Graded Prices</h3>
                  {gradedPrices && (
                    <FreshnessNote fetchedAt={gradedPrices.fetchedAt} stale={gradedPrices.stale} />
                  )}
                </div>
                {isLoadingGradedPrices ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
                  </div>
                ) : gradedRows.length === 0 ? (
                  <p className="py-4 text-sm text-ink-muted">No graded prices available</p>
                ) : (
                  <>
                    <GradedPriceCards
                      rows={gradedRows}
                      rawPrice={rawGradedPrice}
                      selectedKey={
                        selectedGradedSeries
                          ? gradedSeriesKey(selectedGradedSeries.grader, selectedGradedSeries.grade)
                          : null
                      }
                      onSelect={focusGrade}
                    />
                    <button
                      type="button"
                      onClick={() => setActiveTab('grades')}
                      className="mt-4 text-sm text-ink-secondary hover:text-ink-primary"
                    >
                      View grade history →
                    </button>
                  </>
                )}
              </section>

              {isOnePiece &&
                (card as OnePieceCard).cardText &&
                (card as OnePieceCard).cardText !== 'NULL' && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-ink-primary">Card Text</h3>
                    <p className="whitespace-pre-wrap text-sm text-ink-secondary">
                      {(card as OnePieceCard).cardText}
                    </p>
                  </section>
                )}
            </div>
          )}

          {activeTab === 'grades' && (
            <div className="space-y-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink-primary">Graded Prices</h3>
                {gradedPrices && (
                  <FreshnessNote fetchedAt={gradedPrices.fetchedAt} stale={gradedPrices.stale} />
                )}
              </div>
              {isLoadingGradedPrices ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
                </div>
              ) : gradedRows.length === 0 ? (
                <p className="py-4 text-sm text-ink-muted">No graded prices available</p>
              ) : (
                <>
                  <GradedPriceCards
                    rows={gradedRows}
                    rawPrice={rawGradedPrice}
                    selectedKey={
                      selectedGradedSeries
                        ? gradedSeriesKey(selectedGradedSeries.grader, selectedGradedSeries.grade)
                        : null
                    }
                    onSelect={(grader, grade) => setSelectedGradedSeries({ grader, grade })}
                  />

                  {isLoadingGradedHistory && !allGradedHistory ? (
                    <div className="flex h-[150px] items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
                    </div>
                  ) : (
                    <GradedMultiPriceChart
                      history={allGradedHistory}
                      livePrices={gradedRows}
                      height={150}
                      focusedKey={
                        selectedGradedSeries
                          ? gradedSeriesKey(selectedGradedSeries.grader, selectedGradedSeries.grade)
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
                </>
              )}
            </div>
          )}

          {activeTab === 'population' && (
            <div className="space-y-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink-primary">Population</h3>
                {populationData && (
                  <FreshnessNote
                    fetchedAt={populationData.fetchedAt}
                    stale={populationData.stale}
                  />
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {popCompanies.map(({ key, label }) => {
                  const data =
                    populationData?.companies?.[key as keyof PopulationLookupResponse['companies']];
                  const value = data?.total;
                  const grade10 = data?.grade10;
                  return (
                    <div key={key} className="rounded-xl bg-surface-raised px-3 py-3 text-center">
                      <p className="text-xs font-medium text-ink-muted">{label}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">
                        {isLoadingPopulation ? '…' : value != null ? value.toLocaleString() : '—'}
                      </p>
                      {grade10 != null && grade10 > 0 && (
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          {grade10.toLocaleString()} gem mint
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {psaPop && psaPop.some((n) => n > 0) && (
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-ink-primary">
                    PSA grade distribution
                  </h4>
                  <div className="space-y-1.5">
                    {psaPop
                      .map((count, index) => ({ grade: index + 1, count }))
                      .filter((row) => row.grade >= 7 && row.count > 0)
                      .reverse()
                      .map((row) => {
                        const max = Math.max(...psaPop.slice(6), 1);
                        return (
                          <div key={row.grade} className="flex items-center gap-3">
                            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-muted">
                              {row.grade}
                            </span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                              <div
                                className="h-full rounded-full bg-ink-secondary/50"
                                style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
                              />
                            </div>
                            <span className="w-12 shrink-0 text-xs tabular-nums text-ink-muted">
                              {row.count.toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'sales' && (
            <div className="space-y-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink-primary">Recent comps</h3>
                {gradedPrices && (
                  <FreshnessNote fetchedAt={gradedPrices.fetchedAt} stale={gradedPrices.stale} />
                )}
              </div>
              {isLoadingGradedPrices ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
                </div>
              ) : gradedRows.length === 0 ? (
                <p className="py-4 text-sm text-ink-muted">No sold comps yet</p>
              ) : (
                <div className="divide-y divide-border-subtle">
                  {gradedRows.map((entry) => {
                    const price = headlineGradedPrice(entry);
                    return (
                      <div
                        key={`${entry.grader}-${entry.grade}`}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-ink-primary">
                            {gradedRowLabel(entry)}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {entry.soldListings > 0
                              ? `${entry.soldListings.toLocaleString()} comps · PriceCharting`
                              : 'PriceCharting'}
                            {entry.lastSoldDate
                              ? ` · last ${
                                  entry.lastSoldPrice != null
                                    ? formatCurrency(entry.lastSoldPrice)
                                    : ''
                                } ${formatSoldAge(entry.lastSoldAgeDays)}`
                              : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
                            {price != null ? formatCurrency(price) : '—'}
                          </p>
                          {(entry.listedCount ?? 0) > 0 && entry.listedLow != null && (
                            <p className="mt-0.5 text-xs text-ink-muted">
                              lowest listed {formatCurrency(entry.listedLow)}
                              {entry.listedCount ? ` · ${entry.listedCount}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {hasRealData && priceHistory.length > 0 && activeTab === 'overview' && (
            <p className="mt-6 text-xs text-ink-muted">
              {isOnePiece
                ? `Market · as of ${formatDisplayDate(priceHistory[priceHistory.length - 1].date)}`
                : `TCGPlayer ${selectedVariantLabel} · as of ${formatDisplayDate(priceHistory[priceHistory.length - 1].date)}`}
            </p>
          )}
        </div>
      </Modal>

      <AddToVaultModal
        card={toVaultCard(card)}
        isOpen={isVaultModalOpen}
        onClose={() => setIsVaultModalOpen(false)}
        onSuccess={() => setIsInVault(vaultService.isInVault(card.id, game))}
        game={game}
      />
    </>
  );
};
