import React, { useState } from 'react';
import { Pack, PackPull } from '../../../types/pokemon';
import { Modal } from '../../../components/common/Modal';
import { tieredPackService } from '../../../services/tieredPackService';
import { vaultService } from '../../../services/vaultService';
import { Sparkles, TrendingUp, TrendingDown, Vault, X } from 'lucide-react';
import { pokemonApi } from '../../../services/pokemonApi';

interface PackOpeningModalProps {
  pack: Pack | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PackOpeningModal: React.FC<PackOpeningModalProps> = ({ pack, isOpen, onClose }) => {
  const [isOpening, setIsOpening] = useState(false);
  const [packPull, setPackPull] = useState<PackPull | null>(null);
  const [revealedCards, setRevealedCards] = useState<number>(0);
  const [showResults, setShowResults] = useState(false);

  const handleOpenPack = async () => {
    if (!pack) return;

    setIsOpening(true);
    setPackPull(null);
    setRevealedCards(0);
    setShowResults(false);

    try {
      // Start fetching the pack while showing animation
      const packPromise = tieredPackService.openPack(pack);
      
      // Show dramatic opening animation for at least 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Wait for pack to finish opening
      const pull = await packPromise;
      setPackPull(pull);

      // Dramatic card flip reveal
      await new Promise(resolve => setTimeout(resolve, 800));
      setRevealedCards(1);

      // Show results after card revealed
      await new Promise(resolve => setTimeout(resolve, 1000));
      setShowResults(true);
    } catch (error) {
      console.error('Error opening pack:', error);
      const errorMessage = (error as Error).message || 'Unknown error';
      
      // Show a more user-friendly error message
      if (errorMessage.includes('Unable to fetch cards') || errorMessage.includes('No suitable card')) {
        alert(`⚠️ Unable to open pack right now. The Pokemon TCG API might be experiencing issues.\n\nPlease try again in a few moments.`);
      } else {
        alert(`⚠️ Error opening pack: ${errorMessage}\n\nPlease try again.`);
      }
    } finally {
      setIsOpening(false);
    }
  };

  const handleAddAllToVault = () => {
    if (!packPull) return;

    packPull.cards.forEach(card => {
      const price = card.marketPrice || pokemonApi.extractCardPrice(card);
      vaultService.addToVault(card, price, 1, 'raw', `Pulled from ${packPull.pack.name}`);
    });

    alert(`✅ Added all ${packPull.cards.length} cards to your vault!`);
  };

  const handleReset = () => {
    setPackPull(null);
    setRevealedCards(0);
    setShowResults(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  if (!pack) return null;

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

  const getRarityColor = (rarity?: string) => {
    const r = (rarity || '').toLowerCase();
    if (r.includes('secret') || r.includes('rainbow')) return 'from-yellow-400 via-pink-400 to-purple-400';
    if (r.includes('ultra')) return 'from-purple-400 to-pink-400';
    if (r.includes('holo')) return 'from-blue-400 to-purple-400';
    if (r.includes('rare')) return 'from-yellow-400 to-orange-400';
    if (r.includes('uncommon')) return 'from-green-400 to-blue-400';
    return 'from-gray-400 to-gray-500';
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="large">
      <div className="relative">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Not opened yet - Show pack and buy button */}
        {!packPull && (
          <div className="p-8 text-center">
            <div className="mb-6">
              <div className="inline-block relative">
                <div className={`absolute inset-0 bg-gradient-to-r ${getTierColor(pack.tier)} rounded-2xl blur-xl opacity-50 animate-pulse`} />
                <div className={`relative bg-gradient-to-br ${getTierColor(pack.tier)} p-8 rounded-2xl shadow-2xl`}>
                  <Sparkles className="w-32 h-32 text-white mx-auto" />
                </div>
              </div>
            </div>

            <h2 className={`text-4xl font-black mb-2 bg-gradient-to-r ${getTierColor(pack.tier)} bg-clip-text text-transparent`}>
              {pack.name}
            </h2>
            <p className="text-gray-600 mb-6 text-lg">{pack.description}</p>

            <div className="flex items-center justify-center gap-8 mb-6 text-sm">
              <div>
                <p className="text-gray-500 mb-1">Cards per pack</p>
                <p className="text-2xl font-bold text-gray-900">{pack.cardsPerPack}</p>
              </div>
              <div className="w-px h-12 bg-gray-300" />
              <div>
                <p className="text-gray-500 mb-1">Pack Price</p>
                <p className="text-3xl font-bold text-green-600">${pack.price}</p>
              </div>
              <div className="w-px h-12 bg-gray-300" />
              <div>
                <p className="text-gray-500 mb-1">Avg Value</p>
                <p className="text-2xl font-bold text-purple-600">${pack.averageValue}</p>
              </div>
            </div>

            {/* Odds Preview */}
            <div className="mb-8 bg-gray-50 rounded-xl p-4 max-w-md mx-auto">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Value Odds</h3>
              <div className="space-y-2">
                {pack.valueRanges.slice(0, 3).map((range, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{range.label}</span>
                    <span className="font-bold text-gray-900">{range.probability}%</span>
                  </div>
                ))}
                {pack.valueRanges.length > 3 && (
                  <p className="text-xs text-gray-400 italic">+ more rare tiers...</p>
                )}
              </div>
            </div>

            <button
              onClick={handleOpenPack}
              disabled={isOpening}
              className={`relative group px-10 py-5 bg-gradient-to-r ${getTierColor(pack.tier)} text-white font-black text-xl rounded-xl shadow-lg hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden`}
            >
              <div className="relative flex items-center justify-center gap-2">
                <Sparkles className="w-6 h-6" />
                {isOpening ? 'Opening...' : 'RIP IT OPEN!'}
              </div>
            </button>

            {isOpening && (
              <div className="mt-8">
                <div className="flex flex-col items-center gap-4">
                  {/* Animated pack icon */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 rounded-2xl blur-2xl opacity-50 animate-pulse" />
                    <div className={`relative bg-gradient-to-br ${getTierColor(pack.tier)} p-12 rounded-2xl shadow-2xl animate-bounce`}>
                      <Sparkles className="w-24 h-24 text-white animate-spin" />
                    </div>
                  </div>
                  
                  {/* Loading text */}
                  <div className="text-center">
                    <p className="font-black text-2xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent animate-pulse">
                      OPENING PACK...
                    </p>
                    <p className="text-gray-600 mt-2 animate-pulse">Rolling the odds...</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Card being revealed */}
        {packPull && !showResults && (
          <div className="p-8">
            <h3 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-yellow-400 via-pink-400 to-purple-600 bg-clip-text text-transparent animate-pulse">
              ✨ YOU PULLED ✨
            </h3>
            <div className="flex justify-center">
              {packPull.cards.map((card, index) => {
                const price = card.marketPrice || pokemonApi.extractCardPrice(card);
                return (
                  <div
                    key={index}
                    className={`transition-all duration-1000 ${
                      index < revealedCards 
                        ? 'opacity-100 scale-100 rotate-0' 
                        : 'opacity-0 scale-50 rotate-180'
                    }`}
                  >
                    {/* Card with glow effect */}
                    <div className="relative">
                      {/* Outer glow */}
                      <div className={`absolute -inset-4 bg-gradient-to-r ${getRarityColor(card.rarity)} rounded-3xl blur-2xl opacity-75 animate-pulse`} />
                      
                      {/* Card */}
                      <div className={`relative rounded-2xl overflow-hidden shadow-2xl border-4 bg-gradient-to-br ${getRarityColor(card.rarity)} p-1 transform hover:scale-105 transition-transform`}>
                        {card.images?.small ? (
                          <img
                            src={card.images.small}
                            alt={card.name}
                            className="w-80 h-auto rounded-xl"
                            onError={(e) => {
                              // Show placeholder if image fails to load
                              const target = e.target as HTMLImageElement;
                              const parent = target.parentElement;
                              if (parent) {
                                target.style.display = 'none';
                                parent.innerHTML += `
                                  <div class="w-80 h-[440px] bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex flex-col items-center justify-center text-white p-6">
                                    <div class="text-center">
                                      <p class="text-xl font-bold mb-2">${card.name}</p>
                                      <p class="text-sm text-gray-400 mb-2">${card.set.name}</p>
                                      <p class="text-xs text-gray-500">Image not available</p>
                                    </div>
                                  </div>
                                `;
                              }
                            }}
                          />
                        ) : (
                          <div className="w-80 h-[440px] bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex flex-col items-center justify-center text-white p-6">
                            <div className="text-center">
                              <p className="text-xl font-bold mb-2">{card.name}</p>
                              <p className="text-sm text-gray-400 mb-2">{card.set.name}</p>
                              <p className="text-xs text-gray-500">Image not available</p>
                            </div>
                          </div>
                        )}
                        
                        {/* Sparkle effects for rare cards */}
                        {price > 100 && (
                          <>
                            <div className="absolute top-4 right-4 animate-ping">
                              <Sparkles className="w-10 h-10 text-yellow-300" />
                            </div>
                            <div className="absolute top-4 right-4">
                              <Sparkles className="w-10 h-10 text-yellow-300" />
                            </div>
                          </>
                        )}
                        
                        {/* Price indicator */}
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                          <div className={`px-6 py-3 rounded-full font-black text-2xl shadow-2xl ${
                            price > packPull.pack.price 
                              ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white' 
                              : 'bg-gradient-to-r from-red-400 to-rose-500 text-white'
                          }`}>
                            ${price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Results summary */}
        {showResults && packPull && (
          <div className="p-8">
            <div className="text-center mb-6">
              <h3 className="text-3xl font-black mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Pack Opened!
              </h3>
              <p className="text-gray-600">Here's what you pulled:</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-600 mb-1">Total Value</p>
                <p className="text-2xl font-bold text-gray-900">${packPull.totalValue.toFixed(2)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-600 mb-1">Pack Cost</p>
                <p className="text-2xl font-bold text-gray-900">${packPull.pack.price.toFixed(2)}</p>
              </div>
              <div className={`rounded-xl p-4 text-center ${packPull.profit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className="text-sm text-gray-600 mb-1">Profit/Loss</p>
                <div className="flex items-center justify-center gap-1">
                  {packPull.profit >= 0 ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  )}
                  <p className={`text-2xl font-bold ${packPull.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {packPull.profit >= 0 ? '+' : ''}${packPull.profit.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Card display */}
            <div className="flex justify-center mb-6">
              {packPull.cards.map((card, index) => {
                const price = card.marketPrice || pokemonApi.extractCardPrice(card);
                return (
                  <div key={index} className="relative group">
                    <div className={`rounded-2xl overflow-hidden shadow-2xl border-4 bg-gradient-to-br ${getRarityColor(card.rarity)} p-1 hover:scale-105 transition-transform`}>
                      {card.images?.small ? (
                        <img
                          src={card.images.small}
                          alt={card.name}
                          className="w-72 h-auto rounded-xl"
                          onError={(e) => {
                            // Show placeholder if image fails to load
                            const target = e.target as HTMLImageElement;
                            const parent = target.parentElement;
                            if (parent) {
                              target.style.display = 'none';
                              parent.innerHTML += `
                                <div class="w-72 h-[396px] bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex flex-col items-center justify-center text-white p-6">
                                  <div class="text-center">
                                    <p class="text-lg font-bold mb-2">${card.name}</p>
                                    <p class="text-xs text-gray-400 mb-2">${card.set.name}</p>
                                    <p class="text-xs text-gray-500">Image not available</p>
                                  </div>
                                </div>
                              `;
                            }
                          }}
                        />
                      ) : (
                        <div className="w-72 h-[396px] bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex flex-col items-center justify-center text-white p-6">
                          <div className="text-center">
                            <p className="text-lg font-bold mb-2">{card.name}</p>
                            <p className="text-xs text-gray-400 mb-2">{card.set.name}</p>
                            <p className="text-xs text-gray-500">Image not available</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 text-center">
                      <p className="text-xl font-bold text-gray-900 mb-1">{card.name}</p>
                      <p className="text-sm text-gray-600 mb-2">{card.set.name} • #{card.number}</p>
                      {card.rarity && (
                        <span className="inline-block px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-semibold mb-2">
                          {card.rarity}
                        </span>
                      )}
                      {price > 0 && (
                        <p className="text-3xl text-green-600 font-black">${price.toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleAddAllToVault}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg"
              >
                <Vault className="w-5 h-5" />
                Add to Vault
              </button>
              <button
                onClick={handleReset}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg"
              >
                <Sparkles className="w-5 h-5 inline mr-2" />
                Rip Another!
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
