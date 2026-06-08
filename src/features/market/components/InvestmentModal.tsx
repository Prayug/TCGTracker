import React, { useState, useEffect } from 'react';
import { PokemonCard } from '../../../types/pokemon';
import { Modal } from '../../../components/common/Modal';
import { PriceChart } from './PriceChart';
import { PriceHistoryApi } from '../../../services/priceHistoryApi';
import { AddToVaultModal } from '../../../features/vault/components/AddToVaultModal';
import { Database, Loader2, Vault, TrendingUp } from 'lucide-react';
import { vaultService } from '../../../services/vaultService';
import { pokemonApi } from '../../../services/pokemonApi';
import { priceTrackingService } from '../../../services/priceTrackingService';
import { fetchCardPopulation, PopulationLookupResponse } from '../../../services/populationApi';
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
  const [priceHistory, setPriceHistory] = useState<Array<{ date: string; price: number }>>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [isInVault, setIsInVault] = useState(false);
  const [isTracked, setIsTracked] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState('normal');
  const [populationData, setPopulationData] = useState<PopulationLookupResponse | null>(null);
  const [isLoadingPopulation, setIsLoadingPopulation] = useState(false);
  const [showPopulation, setShowPopulation] = useState(false);

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
      setIsInVault(vaultService.isInVault(card.id));
      setIsTracked(priceTrackingService.isTracked(card.id));
    }
  }, [card, isOpen, selectedVariant]);

  useEffect(() => {
    if (card && isOpen) fetchPopulation();
  }, [card, isOpen, selectedVariant]);

  useEffect(() => {
    if (!card || !isOpen) return;
    const defaultVariant = variantOptions[0]?.key || 'normal';
    setSelectedVariant(defaultVariant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, isOpen]);

  const handleTrack = () => {
    if (card) {
      priceTrackingService.trackCard(card);
      setIsTracked(true);
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

  const selectedVariantLabel =
    variantOptions.find((option) => option.key === selectedVariant)?.label || 'Normal';
  const actualCardPrice = pokemonApi.extractCardPrice(card, selectedVariant) || card.marketPrice || 0;

  const firstHistoryPrice = priceHistory[0]?.price || 0;
  const lastHistoryPrice = priceHistory[priceHistory.length - 1]?.price || 0;
  const priceChange = lastHistoryPrice - firstHistoryPrice;
  const priceChangePercent = firstHistoryPrice > 0 ? (priceChange / firstHistoryPrice) * 100 : 0;
  const isPositiveChange = priceChange >= 0;

  const popCompanies = [
    { key: 'psa', label: 'PSA' },
    { key: 'cgc', label: 'CGC' },
    { key: 'beckett', label: 'BGS' },
  ] as const;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="detail">
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
              <h2 className="text-xl font-bold leading-tight text-white sm:text-2xl">{card.name}</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {card.set.name}
                {card.number ? ` · #${card.number}` : ''}
              </p>
              {card.rarity && (
                <p className="mt-0.5 text-sm text-ink-muted">{card.rarity}</p>
              )}

              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-3xl font-bold tabular-nums text-white">
                  {formatCurrency(actualCardPrice)}
                </span>
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
              onClick={() => setShowPopulation((v) => !v)}
              className="flex w-full items-center justify-between text-left text-sm text-ink-muted hover:text-ink-secondary"
              aria-expanded={showPopulation}
            >
              <span>
                Graded pop
                {!showPopulation && populationData && (
                  <span className="ml-2 tabular-nums text-ink-muted">
                    {popCompanies
                      .map(({ key, label }) => {
                        const val =
                          populationData.companies?.[
                            key as keyof PopulationLookupResponse['companies']
                          ]?.total;
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
              <div className="mt-3 grid grid-cols-3 gap-3">
                {popCompanies.map(({ key, label }) => {
                  const data =
                    populationData?.companies?.[
                      key as keyof PopulationLookupResponse['companies']
                    ];
                  const value = data?.total;
                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-border-default bg-surface-inset px-3 py-2.5 text-center"
                    >
                      <p className="text-xs font-medium text-ink-muted">{label}</p>
                      <p className="mt-0.5 text-lg font-bold tabular-nums text-white">
                        {isLoadingPopulation ? '…' : value != null ? value.toLocaleString() : '—'}
                      </p>
                    </div>
                  );
                })}
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
        onSuccess={() => setIsInVault(vaultService.isInVault(card.id))}
      />
    </>
  );
};
