import React, { useState, useEffect } from 'react';
import { PokemonCard } from '../types/pokemon';
import { Modal } from './Modal';
import { PriceChart } from './PriceChart';
import { PriceHistoryApi } from '../services/priceHistoryApi';
import { AddToVaultModal } from './AddToVaultModal';
import { Database, Vault, TrendingUp } from 'lucide-react';
import { vaultService } from '../services/vaultService';
import { pokemonApi } from '../services/pokemonApi';
import { priceTrackingService } from '../services/priceTrackingService';

interface InvestmentModalProps {
  card: PokemonCard | null;
  isOpen: boolean;
  onClose: () => void;
}

export const InvestmentModal: React.FC<InvestmentModalProps> = ({ card, isOpen, onClose }) => {
  const [priceHistory, setPriceHistory] = useState<Array<{ date: string; price: number }>>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [isInVault, setIsInVault] = useState(false);
  const [isTracked, setIsTracked] = useState(false);

  useEffect(() => {
    if (card && isOpen) {
      fetchPriceHistory();
      checkIfInVault();
      checkIfTracked();
    }
  }, [card, isOpen]);

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
        productId: card.tcgplayer?.productId
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

  if (!card) return null;

  const formattedDate = new Date(card.set.releaseDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const mostRecentPriceDate = hasRealData && priceHistory.length > 0 
    ? new Date(priceHistory[priceHistory.length - 1].date).toLocaleDateString()
    : null;

  // Get the actual card price from Pokemon TCG API (this is the accurate price)
  const actualCardPrice = card.marketPrice || pokemonApi.extractCardPrice(card);
  
  // Get TCGCSV price if available (for comparison/trend)
  const tcgcsvPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : null;

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
                  <h2 className="text-3xl font-bold text-gray-900">{card.name}</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={handleTrack}
                      disabled={isTracked}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg ${
                        isTracked
                          ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
                          : 'bg-gradient-to-r from-primary-600 to-accent-600 text-white hover:from-primary-700 hover:to-accent-700'
                      }`}
                    >
                      <TrendingUp className="w-4 h-4" />
                      {isTracked ? 'Tracking' : 'Track Price'}
                    </button>
                    <button
                      onClick={() => setIsVaultModalOpen(true)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg ${
                        isInVault
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
                      }`}
                    >
                      <Vault className="w-4 h-4" />
                      {isInVault ? 'In Vault' : 'Add to Vault'}
                    </button>
                  </div>
                </div>
                <p className="text-lg text-gray-600">{card.set.name} • {formattedDate}</p>
                {card.types && card.types.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {card.types.map((type) => (
                      <span
                        key={type}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Basic Card Information */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="text-left">
                  <p className="font-semibold text-gray-700 mb-1">Rarity</p>
                  <p className="text-gray-900">{card.rarity || 'N/A'}</p>
                </div>
                
                {card.artist && (
                  <div className="text-left">
                    <p className="font-semibold text-gray-700 mb-1">Artist</p>
                    <p className="text-gray-900">{card.artist}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Price Chart */}
          <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-xl font-bold text-gray-900">Price History</h4>
              <div className="flex items-center gap-2">
                {isLoadingHistory && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 bg-white px-3 py-1.5 rounded-full shadow-sm">
                    <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                    <span>Loading...</span>
                  </div>
                )}
                {!isLoadingHistory && hasRealData && (
                  <div className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-full shadow-sm border border-green-200">
                    <Database className="w-3 h-3" />
                    <span className="font-medium">TCGCSV Data</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Current Price Display - Always show the actual card price */}
            <div className="bg-white rounded-xl p-6 mb-6 shadow-sm border border-gray-200">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">Current Market Price</p>
                  <p className="text-4xl font-black text-gray-900">
                    ${actualCardPrice.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">TCGPlayer Market Price</p>
                </div>
                
                {/* Show price change if we have TCGCSV history */}
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
                            isPositive ? 'bg-green-50' : 'bg-red-50'
                          }`}>
                            <span className={`text-lg font-bold ${
                              isPositive ? 'text-green-700' : 'text-red-700'
                            }`}>
                              {isPositive ? '+' : ''}${Math.abs(priceChange).toFixed(2)}
                            </span>
                            <span className={`text-sm font-semibold ${
                              isPositive ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {isPositive ? '+' : ''}{priceChangePercent.toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Historical Change</p>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              
              {/* Show comparison if TCGCSV price differs significantly */}
              {tcgcsvPrice && Math.abs(tcgcsvPrice - actualCardPrice) > 1 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-600">
                    TCGCSV Historical Price: <span className="font-semibold">${tcgcsvPrice.toFixed(2)}</span>
                    {tcgcsvPrice !== actualCardPrice && (
                      <span className={`ml-2 ${tcgcsvPrice > actualCardPrice ? 'text-red-600' : 'text-green-600'}`}>
                        ({tcgcsvPrice > actualCardPrice ? 'above' : 'below'} current market)
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
                  <div className="mt-4 flex items-center justify-center gap-1 text-xs text-gray-500">
                    <span>Price history last updated:</span>
                    <span className="font-medium">{mostRecentPriceDate}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-base font-semibold text-gray-700">No price history available</p>
                  <p className="text-sm mt-2 text-gray-500">Run the backend data fetcher to collect TCGCSV price data</p>
                  <div className="mt-4 text-xs text-gray-400 bg-gray-50 px-4 py-2 rounded-lg inline-block">
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