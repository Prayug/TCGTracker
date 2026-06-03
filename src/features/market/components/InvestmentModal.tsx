import React, { useState, useEffect } from 'react';
import { PokemonCard } from '../../../types/pokemon';
import { Modal } from '../../../components/common/Modal';
import { PriceChart } from './PriceChart';
import { PriceHistoryApi } from '../../../services/priceHistoryApi';
import { AddToVaultModal } from '../../../features/vault/components/AddToVaultModal';
import { Database, Vault, TrendingUp, Calendar } from 'lucide-react';
import { vaultService } from '../../../services/vaultService';
import { pokemonApi } from '../../../services/pokemonApi';
import { priceTrackingService } from '../../../services/priceTrackingService';
import { fetchCardPopulation, PopulationLookupResponse } from '../../../services/populationApi';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { formatCurrency } from '../../../utils/cardDisplay';
import { toIsoDate } from '../../../utils/priceHistory';

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

export const InvestmentModal: React.FC<InvestmentModalProps> = ({ card, isOpen, onClose }) => {
  const getPopulationMessage = (
    data?: PopulationLookupResponse['companies'][keyof PopulationLookupResponse['companies']]
  ) => {
    if (!data || data.status === 'ok') return null;
    if (data.status === 'unavailable') return 'No exact match found';
    return data.message || 'Temporarily unavailable';
  };

  const [priceHistory, setPriceHistory] = useState<Array<{ date: string; price: number }>>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [isInVault, setIsInVault] = useState(false);
  const [isTracked, setIsTracked] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState('normal');
  const [populationData, setPopulationData] = useState<PopulationLookupResponse | null>(null);
  const [isLoadingPopulation, setIsLoadingPopulation] = useState(false);

  const variantOptions = React.useMemo(() => {
    if (!card?.tcgplayer?.prices) return [{ key: 'normal', label: 'Normal' }];
    const keys = Object.keys(card.tcgplayer.prices);
    if (keys.length === 0) return [{ key: 'normal', label: 'Normal' }];
    return keys.map((key) => ({
      key,
      label: key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase()),
    }));
  }, [card]);

  useEffect(() => {
    if (card && isOpen) {
      fetchPriceHistory();
      checkIfInVault();
      checkIfTracked();
    }
  }, [card, isOpen, selectedVariant]);

  useEffect(() => {
    if (card && isOpen) fetchPopulation();
  }, [card, isOpen, selectedVariant]);

  useEffect(() => {
    if (!card || !isOpen) return;
    setSelectedVariant(variantOptions[0]?.key || 'normal');
  }, [card, isOpen, variantOptions]);

  const checkIfInVault = () => {
    if (card) setIsInVault(vaultService.isInVault(card.id));
  };

  const checkIfTracked = () => {
    if (card) setIsTracked(priceTrackingService.isTracked(card.id));
  };

  const handleTrack = () => {
    if (card) {
      priceTrackingService.trackCard(card);
      checkIfTracked();
    }
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

  if (!card) return null;

  const formattedReleaseDate = new Date(card.set.releaseDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const latestHistoryDate =
    hasRealData && priceHistory.length > 0
      ? formatDisplayDate(priceHistory[priceHistory.length - 1].date)
      : null;

  const selectedVariantLabel =
    variantOptions.find((option) => option.key === selectedVariant)?.label || 'Normal';
  const actualCardPrice = pokemonApi.extractCardPrice(card, selectedVariant) || card.marketPrice || 0;
  const snapshotPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : null;
  const populationEntries = populationData ? Object.values(populationData.companies) : [];
  const allPopulationUnavailable =
    populationEntries.length > 0 && populationEntries.every((entry) => entry.total === null);

  const firstHistoryPrice = priceHistory[0]?.price || 0;
  const lastHistoryPrice = priceHistory[priceHistory.length - 1]?.price || 0;
  const priceChange = lastHistoryPrice - firstHistoryPrice;
  const priceChangePercent = firstHistoryPrice > 0 ? (priceChange / firstHistoryPrice) * 100 : 0;
  const isPositiveChange = priceChange >= 0;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="large">
        <div className="p-6 pr-14">
          <div className="mb-6 flex flex-col gap-6 lg:flex-row lg:items-start">
            <img
              src={card.images.large}
              alt={card.name}
              className="mx-auto w-44 shrink-0 rounded-xl border border-white/10 bg-black/30 object-contain shadow-lg lg:mx-0 lg:w-48"
              loading="lazy"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src !== card.images.small) target.src = card.images.small;
              }}
            />

            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{card.name}</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {card.set.name} · Released {formattedReleaseDate}
                  </p>
                  {card.types && card.types.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {card.types.map((type) => (
                        <span
                          key={type}
                          className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-200"
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleTrack}
                    disabled={isTracked}
                    className={
                      isTracked
                        ? 'inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-500'
                        : 'btn-secondary'
                    }
                  >
                    <TrendingUp className="h-4 w-4" />
                    {isTracked ? 'Tracking' : 'Track price'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsVaultModalOpen(true)}
                    className={
                      isInVault
                        ? 'inline-flex items-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300'
                        : 'btn-primary'
                    }
                  >
                    <Vault className="h-4 w-4" />
                    {isInVault ? 'In vault' : 'Add to vault'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <p className="section-label mb-1">Rarity</p>
                  <p className="font-medium text-slate-200">{card.rarity || 'N/A'}</p>
                </div>
                {card.artist && (
                  <div>
                    <p className="section-label mb-1">Artist</p>
                    <p className="font-medium text-slate-200">{card.artist}</p>
                  </div>
                )}
                <div>
                  <p className="section-label mb-1">Finish</p>
                  <select
                    value={selectedVariant}
                    onChange={(e) => setSelectedVariant(e.target.value)}
                    className="input py-1.5"
                  >
                    {variantOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between">
                <SectionLabel>Graded population</SectionLabel>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {isLoadingPopulation
                    ? 'Loading…'
                    : populationData?.cached
                      ? 'Cached'
                      : populationData
                        ? 'Live'
                        : 'Unavailable'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { key: 'psa', label: 'PSA' },
                  { key: 'cgc', label: 'CGC' },
                  { key: 'beckett', label: 'Beckett' },
                ].map((company) => {
                  const data =
                    populationData?.companies?.[
                      company.key as keyof PopulationLookupResponse['companies']
                    ];
                  const value = data?.total;
                  return (
                    <div
                      key={company.key}
                      className="rounded-lg border border-white/10 bg-black/20 p-3"
                    >
                      <p className="text-xs font-medium text-slate-400">{company.label}</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-white">
                        {value !== null && value !== undefined ? value.toLocaleString() : '—'}
                      </p>
                      {getPopulationMessage(data) && (
                        <p className="mt-1 text-[11px] text-slate-500">{getPopulationMessage(data)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {allPopulationUnavailable && !isLoadingPopulation && (
                <p className="mt-3 text-xs text-slate-500">
                  Population data is temporarily unavailable for this card.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <SectionLabel>Price history</SectionLabel>
                <div className="flex flex-wrap items-center gap-2">
                  {isLoadingHistory && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
                      Loading…
                    </span>
                  )}
                  {!isLoadingHistory && hasRealData && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                      <Database className="h-3 w-3" />
                      {selectedVariantLabel}
                    </span>
                  )}
                  {latestHistoryDate && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-slate-300">
                      <Calendar className="h-3 w-3 text-slate-500" />
                      As of {latestHistoryDate}
                    </span>
                  )}
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-white/10 bg-black/25 p-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="section-label mb-1">Current market price</p>
                    <p className="text-3xl font-bold tabular-nums text-white sm:text-4xl">
                      {formatCurrency(actualCardPrice)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      TCGPlayer {selectedVariantLabel} market
                      {latestHistoryDate && (
                        <span className="text-slate-400"> · quote dated {latestHistoryDate}</span>
                      )}
                    </p>
                  </div>
                  {priceHistory.length > 0 && (
                    <div className="text-right">
                      <div
                        className={`inline-flex flex-col items-end rounded-lg border px-3 py-2 ${
                          isPositiveChange
                            ? 'border-emerald-500/30 bg-emerald-500/10'
                            : 'border-rose-500/30 bg-rose-500/10'
                        }`}
                      >
                        <span
                          className={`text-lg font-bold tabular-nums ${isPositiveChange ? 'text-emerald-300' : 'text-rose-300'}`}
                        >
                          {isPositiveChange ? '+' : ''}
                          {formatCurrency(Math.abs(priceChange))}
                        </span>
                        <span
                          className={`text-sm font-semibold tabular-nums ${isPositiveChange ? 'text-emerald-400/90' : 'text-rose-400/90'}`}
                        >
                          {isPositiveChange ? '+' : ''}
                          {priceChangePercent.toFixed(1)}%
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                        vs {formatDisplayDate(priceHistory[0].date)}
                      </p>
                    </div>
                  )}
                </div>
                {snapshotPrice && Math.abs(snapshotPrice - actualCardPrice) > 1 && (
                  <p className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-500">
                    Snapshot price {formatCurrency(snapshotPrice)}
                    {snapshotPrice !== actualCardPrice && (
                      <span className={snapshotPrice > actualCardPrice ? 'text-rose-400' : 'text-emerald-400'}>
                        {' '}
                        ({snapshotPrice > actualCardPrice ? 'above' : 'below'} live market)
                      </span>
                    )}
                  </p>
                )}
              </div>

              {priceHistory.length > 0 ? (
                <PriceChart priceHistory={priceHistory} variant="dark" />
              ) : (
                <div className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed border-white/15 text-center">
                  <Database className="mb-3 h-10 w-10 text-slate-600" />
                  <p className="font-medium text-slate-300">No price history available</p>
                  <p className="mt-1 max-w-sm text-sm text-slate-500">
                    Run backend sync jobs to collect TCGdex variant snapshots.
                  </p>
                  <code className="mt-4 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-400">
                    cd TCGTracker/backend && npm run start
                  </code>
                </div>
              )}
            </section>
          </div>
        </div>
      </Modal>

      <AddToVaultModal
        card={card}
        isOpen={isVaultModalOpen}
        onClose={() => setIsVaultModalOpen(false)}
        onSuccess={checkIfInVault}
      />
    </>
  );
};
