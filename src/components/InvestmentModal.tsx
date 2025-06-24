import React, { useState, useEffect } from 'react';
import { PokemonCard } from '../types/pokemon';
import { Modal } from './Modal';
import { PriceChart } from './PriceChart';
import { PriceHistoryApi } from '../services/priceHistoryApi';
import { Database } from 'lucide-react';

interface InvestmentModalProps {
  card: PokemonCard | null;
  isOpen: boolean;
  onClose: () => void;
}

export const InvestmentModal: React.FC<InvestmentModalProps> = ({ card, isOpen, onClose }) => {
  const [priceHistory, setPriceHistory] = useState<Array<{ date: string; price: number }>>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    if (card && isOpen) {
      fetchPriceHistory();
    }
  }, [card, isOpen]);

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="large">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start gap-6 mb-6">
          <img
            src={card.images.large}
            alt={card.name}
            className="w-48 rounded-xl shadow-lg flex-shrink-0"
            loading="lazy"
          />
          
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{card.name}</h2>
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
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold">TCGCSV Price History</h4>
            <div className="flex items-center gap-2">
              {isLoadingHistory && (
                <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-full">
                  <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                  <span>Loading...</span>
                </div>
              )}
              {!isLoadingHistory && hasRealData && (
                <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                  <Database className="w-3 h-3" />
                  <span>TCGCSV Data</span>
                </div>
              )}
            </div>
          </div>
          
          {priceHistory.length > 0 ? (
            <>
              <PriceChart priceHistory={priceHistory} />
              {hasRealData && mostRecentPriceDate && (
                <div className="mt-2 text-xs text-gray-500 text-center">
                  Last updated: {mostRecentPriceDate}
                </div>
              )}
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">No price history available</p>
                <p className="text-xs mt-1">Run the backend data fetcher to collect TCGCSV price data</p>
                <div className="mt-3 text-xs text-gray-400">
                  <code>cd TCGTracker/backend && npm run start</code>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};