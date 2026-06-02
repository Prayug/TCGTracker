import React, { useState, useEffect } from 'react';
import { PokemonCard } from '../../../types/pokemon';
import { Modal } from '../../../components/common/Modal';
import { PriceChart } from './PriceChart';
import { PriceHistoryApi } from '../../../services/priceHistoryApi';
import { AddToVaultModal } from '../../../features/vault/components/AddToVaultModal';
import { Database, Vault, TrendingUp } from 'lucide-react';
import { vaultService } from '../../../services/vaultService';
import { pokemonApi } from '../../../services/pokemonApi';
import { priceTrackingService } from '../../../services/priceTrackingService';
import { fetchCardPopulation, PopulationLookupResponse } from '../../../services/populationApi';

interface InvestmentModalProps {
  card: PokemonCard | null;
  isOpen: boolean;
  onClose: () => void;
}

export const InvestmentModal: React.FC<InvestmentModalProps> = ({ card, isOpen, onClose }) => {
  const getPopulationMessage = (data?: PopulationLookupResponse['companies'][keyof PopulationLookupResponse['companies']]) => {
    if (!data || data.status === 'ok') {
      return null;
    }
    if (data.status === 'unavailable') {
      return 'No exact match found';
    }
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
    if (!card?.tcgplayer?.prices) {
      return [{ key: 'normal', label: 'Normal' }];
    }
    const keys = Object.keys(card.tcgplayer.prices);
    if (keys.length === 0) {
      return [{ key: 'normal', label: 'Normal' }];
    }
    return keys.map((key) => ({
      key,
      label: key
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (char) => char.toUpperCase()),
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
    if (card && isOpen) {
      fetchPopulation();
    }
  }, [card, isOpen, selectedVariant]);

  useEffect(() => {
    if (!card || !isOpen) {
      return;
    }
    setSelectedVariant(variantOptions[0]?.key || 'normal');
  }, [card, isOpen, variantOptions]);

  const checkIfInVault = () => {
    if (card) {
      setIsInVault(vaultService.isInVault(card.id));
    }
  };

  const checkIfTracked = () => {
    if (card) {
      setIsTracked(priceTrackingService.isTracked(card.id));
    }
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

      if (history && history.length > 0) {
        setPriceHistory(history);
        setHasRealData(true);
      } else {
        setPriceHistory([]);
        setHasRealData(false);
      }
    } catch (error) {
      console.error('Error fetching price history:', error);
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

  const formattedDate = new Date(card.set.releaseDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const mostRecentPriceDate = hasRealData && priceHistory.length > 0 
    ? new Date(priceHistory[priceHistory.length - 1].date).toLocaleDateString()
    : null;

  const selectedVariantLabel =
    variantOptions.find((option) => option.key === selectedVariant)?.label || 'Normal';
  const actualCardPrice = pokemonApi.extractCardPrice(card, selectedVariant) || card.marketPrice || 0;
  
  // Use latest stored snapshot point for trend comparison.
  const snapshotPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : null;
  const populationEntries = populationData
    ? Object.values(populationData.companies)
    : [];
  const allPopulationUnavailable =
    populationEntries.length > 0 && populationEntries.every((entry) => entry.total === null);

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="large">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start gap-6 mb-6">
            <img
              src={card.images.large}
              alt={card.name}
              className="w-48 rounded-xl shadow-lg flex-shrink-0"
              loading="lazy"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src !== card.images.small) {
                  target.src = card.images.small;
                }
              }}
            />
            
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                  <h2 className="text-3xl font-bold text-slate-900">{card.name}</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={handleTrack}
                      disabled={isTracked}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        isTracked
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                          : 'bg-primary-600 text-white hover:bg-primary-700'
                      }`}
                    >
                      <TrendingUp className="w-4 h-4" />
                      {isTracked ? 'Tracking' : 'Track Price'}
                    </button>
                    <button
                      onClick={() => setIsVaultModalOpen(true)}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        isInVault
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-accent-600 text-white hover:bg-accent-700'
                      }`}
                    >
                      <Vault className="w-4 h-4" />
                      {isInVault ? 'In Vault' : 'Add to Vault'}
                    </button>
                  </div>
                </div>
                <p className="text-lg text-slate-600">{card.set.name} • {formattedDate}</p>
                {card.types && card.types.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {card.types.map((type) => (
                      <span
                        key={type}
                        className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Basic Card Information */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div className="text-left">
                  <p className="font-semibold text-slate-700 mb-1">Rarity</p>
                  <p className="text-slate-900">{card.rarity || 'N/A'}</p>
                </div>
                
                {card.artist && (
                  <div className="text-left">
                    <p className="font-semibold text-slate-700 mb-1">Artist</p>
                    <p className="text-slate-900">{card.artist}</p>
                  </div>
                )}

                <div className="text-left">
                  <p className="font-semibold text-slate-700 mb-1">Finish</p>
                  <select
                    value={selectedVariant}
                    onChange={(event) => setSelectedVariant(event.target.value)}
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

          {/* Price Chart */}
          <div className="card p-6">
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h5 className="text-sm font-semibold text-slate-900">Graded Population</h5>
                <span className="text-xs text-slate-500">
                  {isLoadingPopulation
                    ? 'Loading...'
                    : populationData?.cached
                      ? 'Cached'
                      : populationData
                        ? 'Live'
                        : 'Unavailable'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  { key: 'psa', label: 'PSA' },
                  { key: 'cgc', label: 'CGC' },
                  { key: 'beckett', label: 'Beckett' },
                ].map((company) => {
                  const data = populationData?.companies?.[company.key as keyof PopulationLookupResponse['companies']];
                  const value = data?.total;
                  return (
                    <div key={company.key} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-medium text-slate-600">{company.label}</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">
                        {value !== null && value !== undefined ? value.toLocaleString() : 'Unavailable'}
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
            </div>

            <div className="flex items-center justify-between mb-6">
              <h4 className="text-xl font-bold text-slate-900">Price History</h4>
              <div className="flex items-center gap-2">
                {isLoadingHistory && (
                  <div className="flex items-center gap-1 text-xs text-slate-500 bg-white px-3 py-1.5 rounded-full shadow-sm">
                    <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </div>
                )}
                {!isLoadingHistory && hasRealData && (
                  <div className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full shadow-sm border border-emerald-200">
                    <Database className="w-3 h-3" />
                    <span className="font-medium">Snapshot {selectedVariantLabel}</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Current Price Display - Always show the actual card price */}
            <div className="bg-white rounded-xl p-6 mb-6 shadow-sm border border-slate-200">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Current Market Price</p>
                  <p className="text-4xl font-black text-slate-900">
                    ${actualCardPrice.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">TCGPlayer {selectedVariantLabel} Market</p>
                </div>
                
                {/* Show price change if we have historical snapshot data */}
                {priceHistory.length > 0 && (
                  <div className="text-right">
                    {(() => {
                      const firstPrice = priceHistory[0]?.price || 0;
                      const lastPrice = priceHistory[priceHistory.length - 1]?.price || 0;
                      const priceChange = lastPrice - firstPrice;
                      const priceChangePercent = firstPrice > 0 ? (priceChange / firstPrice) * 100 : 0;
                      const isPositive = priceChange >= 0;
                      
                      return (
                        <div>
                          <div className={`inline-flex flex-col items-end px-4 py-2 rounded-lg ${
                            isPositive ? 'bg-emerald-50' : 'bg-red-50'
                          }`}>
                            <span className={`text-lg font-bold ${
                              isPositive ? 'text-emerald-700' : 'text-red-700'
                            }`}>
                              {isPositive ? '+' : ''}${Math.abs(priceChange).toFixed(2)}
                            </span>
                            <span className={`text-sm font-semibold ${
                              isPositive ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                              {isPositive ? '+' : ''}{priceChangePercent.toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">Historical Change</p>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              
              {/* Show comparison if snapshot and current market differ significantly */}
              {snapshotPrice && Math.abs(snapshotPrice - actualCardPrice) > 1 && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <p className="text-xs text-slate-600">
                    Snapshot Historical Price: <span className="font-semibold">${snapshotPrice.toFixed(2)}</span>
                    {snapshotPrice !== actualCardPrice && (
                      <span className={`ml-2 ${snapshotPrice > actualCardPrice ? 'text-red-600' : 'text-emerald-600'}`}>
                        ({snapshotPrice > actualCardPrice ? 'above' : 'below'} current market)
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
            
            {priceHistory.length > 0 ? (
              <>
                {/* Chart */}
                <PriceChart priceHistory={priceHistory} />
                
                {/* Last Updated */}
                {hasRealData && mostRecentPriceDate && (
                  <div className="mt-4 flex items-center justify-center gap-1 text-xs text-slate-500">
                    <span>Price history last updated:</span>
                    <span className="font-medium">{mostRecentPriceDate}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-base font-semibold text-slate-700">No price history available</p>
                  <p className="text-sm mt-2 text-slate-500">Run backend sync jobs to collect TCGdex variant snapshots</p>
                  <div className="mt-4 text-xs text-slate-400 bg-slate-50 px-4 py-2 rounded-lg inline-block">
                    <code>cd TCGTracker/backend && npm run start</code>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Add to Vault Modal */}
      <AddToVaultModal
        card={card}
        isOpen={isVaultModalOpen}
        onClose={() => setIsVaultModalOpen(false)}
        onSuccess={() => {
          checkIfInVault();
        }}
      />
    </>
  );
};
