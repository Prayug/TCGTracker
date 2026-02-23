import React, { Suspense, lazy, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Pack, PackPull } from '../../../types/pokemon';
import { Modal } from '../../../components/common/Modal';
import { tieredPackService } from '../../../services/tieredPackService';
import { vaultService } from '../../../services/vaultService';
import { useToast } from '../../../components/common/Toast';
import { FastForward, Sparkles, Vault } from 'lucide-react';
import { pokemonApi } from '../../../services/pokemonApi';
import { markOnboardingStep } from '../../../components/common/OnboardingChecklist';

// Lazy-loaded so three.js/R3F stay out of the initial bundle.
const PackOpeningScene = lazy(() => import('./PackOpeningScene'));

/** Kept local (not imported from the scene) to preserve the lazy chunk split. */
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

interface PackOpeningModalProps {
  pack: Pack | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PackOpeningModal: React.FC<PackOpeningModalProps> = ({ pack, isOpen, onClose }) => {
  const { showToast } = useToast();
  const [isOpening, setIsOpening] = useState(false);
  const [packPull, setPackPull] = useState<PackPull | null>(null);
  const [revealedCards, setRevealedCards] = useState<number>(0);
  const [showResults, setShowResults] = useState(false);
  const [use3D, setUse3D] = useState(false);
  const skipRef = useRef(false);

  /** Delay that resolves early when the user hits Skip. */
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (skipRef.current || Date.now() - started >= ms) resolve();
        else window.setTimeout(tick, 50);
      };
      tick();
    });

  const handleSkip = () => {
    skipRef.current = true;
  };

  const handleOpenPack = async () => {
    if (!pack) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 3D reveal only when WebGL works and the user hasn't opted out of motion;
    // otherwise gracefully degrade to the CSS fan-out.
    const use3DNow = supportsWebGL() && !reducedMotion;
    setUse3D(use3DNow);
    skipRef.current = reducedMotion;
    setIsOpening(true);
    setPackPull(null);
    setRevealedCards(0);
    setShowResults(false);

    try {
      // Start fetching the pack while showing animation
      const packPromise = tieredPackService.openPack(pack);

      // Dramatic opening pause — skippable, and skipped entirely for reduced
      // motion. The 3D scene provides its own idle/rip intro, so no extra wait.
      if (!use3DNow) {
        await wait(2000);
      }

      // Wait for pack to finish opening
      const pull = await packPromise;
      setPackPull(pull);

      const cardCount = pull.cards.length;

      if (use3DNow && !skipRef.current) {
        // The 3D scene drives the reveal and calls onComplete → showResults.
        setRevealedCards(cardCount);
        return;
      }

      for (let i = 0; i < cardCount; i++) {
        if (skipRef.current) {
          setRevealedCards(cardCount);
          break;
        }
        await wait(450);
        setRevealedCards(i + 1);
      }

      await wait(600);
      setShowResults(true);
    } catch (error) {
      console.error('Error opening pack:', error);
      const errorMessage = (error as Error).message || 'Unknown error';
      
      // Show a more user-friendly error message
      if (errorMessage.includes('Unable to fetch cards') || errorMessage.includes('No suitable card')) {
        showToast('Unable to open pack right now. The Pokemon TCG API might be experiencing issues. Please try again in a few moments.', 'error');
      } else {
        showToast(`Error opening pack: ${errorMessage}. Please try again.`, 'error');
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
    markOnboardingStep('vault');

    showToast(`Added all ${packPull.cards.length} cards to your vault!`, 'success');
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
    <Modal isOpen={isOpen} onClose={handleClose} size="detail">
      <div className="relative">
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
            <p className="text-ink-muted mb-6 text-lg">{pack.description}</p>

            <div className="flex items-center justify-center gap-8 mb-6 text-sm">
              <div>
                <p className="text-ink-muted mb-1">Cards per pack</p>
                <p className="text-2xl font-bold text-ink-primary">{pack.cardsPerPack}</p>
              </div>
              <div className="w-px h-12 bg-white/10" />
              <div>
                <p className="text-ink-muted mb-1">Pack Price</p>
                <p className="text-3xl font-bold text-emerald-400">${pack.price}</p>
              </div>
              <div className="w-px h-12 bg-white/10" />
              <div>
                <p className="text-ink-muted mb-1">Avg Value</p>
                <p className="text-2xl font-bold text-purple-400">${pack.averageValue}</p>
              </div>
            </div>

            {/* Odds Preview */}
            <div className="mb-8 bg-surface-inset rounded-xl p-4 max-w-md mx-auto">
              <h3 className="text-sm font-semibold text-ink-secondary mb-3">Value Odds</h3>
              <div className="space-y-2">
                {pack.valueRanges.map((range, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">{range.label}</span>
                    <span className="font-bold tabular-nums text-ink-primary">
                      {range.probability.toFixed(1)}%
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-[10px] italic text-ink-muted">
                  Exact simulated odds — every tier disclosed.
                </p>
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
                  <div className="relative">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 opacity-50 blur-2xl motion-safe:animate-pulse" />
                    <div className={`relative rounded-2xl bg-gradient-to-br p-12 shadow-2xl ${getTierColor(pack.tier)} motion-safe:animate-bounce`}>
                      <Sparkles className="h-24 w-24 text-white motion-safe:animate-spin" />
                    </div>
                  </div>

                  <div className="text-center">
                    <p className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-2xl font-black text-transparent motion-safe:animate-pulse">
                      OPENING PACK...
                    </p>
                    <p className="mt-2 text-ink-muted motion-safe:animate-pulse">Rolling the odds...</p>
                  </div>
                  <button type="button" onClick={handleSkip} className="btn-secondary mt-2">
                    <FastForward className="h-4 w-4" aria-hidden="true" />
                    Skip animation
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Card being revealed */}
        {packPull && !showResults && (
          <div className="relative p-4 sm:p-6">
            <button
              type="button"
              onClick={() => {
                handleSkip();
                if (use3D) setShowResults(true);
              }}
              className="absolute right-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-overlay/90 px-3 py-1.5 text-xs font-medium text-ink-secondary  transition-colors hover:text-ink-primary"
            >
              <FastForward className="h-3.5 w-3.5" aria-hidden="true" />
              Skip
            </button>
            <h3 className="mb-4 text-center text-3xl font-bold bg-gradient-to-r from-yellow-400 via-pink-400 to-purple-600 bg-clip-text text-transparent motion-safe:animate-pulse">
              ✨ YOU PULLED ✨
            </h3>
            {use3D ? (
              <Suspense
                fallback={
                  <div className="flex h-[380px] items-center justify-center sm:h-[440px]">
                    <div className="h-9 w-9 animate-spin rounded-full border-2 border-border-default border-t-accent" />
                  </div>
                }
              >
                <PackOpeningScene
                  tier={packPull.pack.tier}
                  cardImages={packPull.cards.map((card) => card.images?.small ?? null)}
                  onComplete={() => setShowResults(true)}
                />
              </Suspense>
            ) : (
            <div className="flex min-h-[320px] items-end justify-center gap-2 px-4 pb-4">
              {packPull.cards.map((card, index) => {
                const price = card.marketPrice || pokemonApi.extractCardPrice(card);
                const revealed = index < revealedCards;
                const fanRotate = (index - (packPull.cards.length - 1) / 2) * 14;
                const fanX = (index - (packPull.cards.length - 1) / 2) * 28;

                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 80, rotate: 0, scale: 0.6 }}
                    animate={
                      revealed
                        ? {
                            opacity: 1,
                            y: 0,
                            rotate: fanRotate,
                            x: fanX,
                            scale: 1,
                          }
                        : { opacity: 0, y: 80, scale: 0.5 }
                    }
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className="origin-bottom"
                    style={{ zIndex: index }}
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
                  </motion.div>
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* Results summary */}
        {showResults && packPull && (
          <div className="p-8">
            <div className="text-center mb-6">
              <h3 className="text-3xl font-black mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Pack Opened!
              </h3>
              <p className="text-ink-muted">Here's what you pulled:</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-surface-inset rounded-xl p-4 text-center">
                <p className="text-sm text-ink-muted mb-1">Total Value</p>
                <p className="text-2xl font-bold tabular-nums text-ink-primary">${packPull.totalValue.toFixed(2)}</p>
              </div>
              <div className="bg-surface-inset rounded-xl p-4 text-center">
                <p className="text-sm text-ink-muted mb-1">Pack Cost</p>
                <p className="text-2xl font-bold tabular-nums text-ink-primary">${packPull.pack.price.toFixed(2)}</p>
              </div>
              <div className={`rounded-xl p-4 text-center ${packPull.profit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                <p className={`text-sm ${packPull.profit >= 0 ? 'text-green-400' : 'text-red-400'} mb-1`}>Profit/Loss</p>
                <div className="flex items-center justify-center gap-1">
                  <p className={`text-2xl font-bold ${packPull.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {packPull.profit >= 0 ? '+' : ''}${packPull.profit.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Card display */}
            <div className="mb-6 flex flex-wrap justify-center gap-6">
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
                      <p className="text-xl font-bold text-ink-primary mb-1">{card.name}</p>
                      <p className="text-sm text-ink-muted mb-2">{card.set.name} • #{card.number}</p>
                      {card.rarity && (
                        <span className="inline-block px-3 py-1 bg-purple-500/10 text-purple-300 rounded-full text-sm font-semibold mb-2">
                          {card.rarity}
                        </span>
                      )}
                      {price > 0 && (
                        <p className="text-3xl text-emerald-400 font-black">${price.toFixed(2)}</p>
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
