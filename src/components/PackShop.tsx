import React, { useState, useEffect } from 'react';
import { Pack } from '../types/pokemon';
import { tieredPackService } from '../services/tieredPackService';
import { PackOpeningModal } from './PackOpeningModal';
import { Package, Sparkles, TrendingUp, History, Zap } from 'lucide-react';

export const PackShop: React.FC = () => {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadPacks();
  }, []);

  const loadPacks = async () => {
    setIsLoading(true);
    try {
      const availablePacks = tieredPackService.getAvailablePacks();
      setPacks(availablePacks);
    } catch (error) {
      console.error('Error loading packs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPack = (pack: Pack) => {
    setSelectedPack(pack);
    setIsModalOpen(true);
  };

  const history = tieredPackService.getHistory();

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'starter': return 'from-gray-400 to-gray-600';
      case 'bronze': return 'from-orange-400 to-orange-600';
      case 'silver': return 'from-gray-300 to-gray-500';
      case 'gold': return 'from-yellow-400 to-yellow-600';
      case 'platinum': return 'from-purple-400 to-purple-600';
      default: return 'from-blue-400 to-blue-600';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl shadow-lg">
            <Package className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Pack Shop
            </h2>
            <p className="text-gray-600 text-sm">Open packs and add cards to your collection!</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      {history.packsOpened > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Packs Opened</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">{history.packsOpened}</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Sparkles className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Total Spent</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">${history.totalSpent.toFixed(2)}</p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-600">Total Value</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">${history.totalValue.toFixed(2)}</p>
          </div>

          <div className={`rounded-xl p-6 shadow-lg border-2 ${
            history.totalProfit >= 0 
              ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-300' 
              : 'bg-gradient-to-br from-red-50 to-red-100 border-red-300'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${history.totalProfit >= 0 ? 'bg-green-200' : 'bg-red-200'}`}>
                <TrendingUp className={`w-5 h-5 ${history.totalProfit >= 0 ? 'text-green-700' : 'text-red-700'}`} />
              </div>
              <p className={`text-sm font-medium ${history.totalProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {history.totalProfit >= 0 ? 'Total Profit' : 'Total Loss'}
              </p>
            </div>
            <p className={`text-3xl font-bold ${history.totalProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {history.totalProfit >= 0 ? '+' : ''}${history.totalProfit.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Available Packs Grid */}
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          Available Packs
        </h3>
        
        {packs.length === 0 ? (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-12 text-center shadow-lg border border-white/20">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Packs Available</h3>
            <p className="text-gray-600">Check back later for new packs!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {packs.map((pack) => (
              <div
                key={pack.id}
                className="group bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 border-gray-200 hover:border-purple-400"
              >
                {/* Pack Header with Gradient */}
                <div className={`relative overflow-hidden bg-gradient-to-br ${getTierColor(pack.tier)} p-6 text-white`}>
                  <div className="absolute inset-0 bg-black opacity-10"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-black text-2xl">{pack.name}</h4>
                      <Zap className="w-6 h-6" />
                    </div>
                    <p className="text-white/90 text-sm mb-4">{pack.description}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black">${pack.price}</span>
                      <span className="text-white/80 text-sm">per pack</span>
                    </div>
                  </div>
                </div>

                {/* Pack Info */}
                <div className="p-5 space-y-4">
                  {/* Stats */}
                  <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">Cards</p>
                      <p className="text-lg font-bold text-gray-900">{pack.cardsPerPack}</p>
                    </div>
                    <div className="h-8 w-px bg-gray-200" />
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-1">Avg Value</p>
                      <p className="text-lg font-bold text-green-600">${pack.averageValue}</p>
                    </div>
                  </div>

                  {/* Value Distribution */}
                  <div>
                    <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Value Distribution
                    </h5>
                    <div className="space-y-1.5">
                      {pack.valueRanges.slice(0, 4).map((range, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full bg-gradient-to-r ${getTierColor(pack.tier)} transition-all`}
                              style={{ width: `${Math.min(range.probability * 2, 100)}%` }}
                            />
                          </div>
                          <span className="text-gray-600 font-medium w-20">{range.label}</span>
                          <span className="text-gray-500 w-12 text-right">{range.probability}%</span>
                        </div>
                      ))}
                      {pack.valueRanges.length > 4 && (
                        <p className="text-xs text-gray-400 italic mt-1">+ {pack.valueRanges.length - 4} more tiers...</p>
                      )}
                    </div>
                  </div>

                  {/* Open Button */}
                  <button
                    className={`w-full py-3 bg-gradient-to-r ${getTierColor(pack.tier)} hover:opacity-90 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2`}
                    onClick={() => handleOpenPack(pack)}
                  >
                    <Sparkles className="w-5 h-5" />
                    Open Pack
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Openings */}
      {history.pulls.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            Recent Openings
          </h3>
          <div className="space-y-3">
            {history.pulls.slice(0, 5).map((pull, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-4 shadow-md border border-gray-200 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={pull.pack.imageUrl || 'https://images.pokemontcg.io/base1/logo.png'}
                    alt={pull.pack.name}
                    className="w-12 h-12 object-contain"
                  />
                  <div>
                    <p className="font-semibold text-gray-900">{pull.pack.name}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(pull.openedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Value: ${pull.totalValue.toFixed(2)}</p>
                  <p className={`text-sm font-semibold ${pull.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {pull.profit >= 0 ? '+' : ''}${pull.profit.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pack Opening Modal */}
      <PackOpeningModal
        pack={selectedPack}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedPack(null);
          // Refresh history
          const newHistory = tieredPackService.getHistory();
          // Force re-render by updating state
          loadPacks();
        }}
      />
    </div>
  );
};

