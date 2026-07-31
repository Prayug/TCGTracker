import React, { Suspense, lazy, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pack, PackPull } from '../../../types/pokemon';
import { Modal } from '../../../components/common/Modal';
import { tieredPackService } from '../../../services/tieredPackService';
import { vaultService } from '../../../services/vaultService';
import { useToast } from '../../../components/common/Toast';
import { useGame } from '../../../contexts/GameContext';
import { FastForward, Sparkles, Vault, Zap } from 'lucide-react';
import { pokemonApi } from '../../../services/pokemonApi';
import { markOnboardingStep } from '../../../components/common/OnboardingChecklist';

const PackOpeningScene = lazy(() => import('./PackOpeningScene'));

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
  initialBoosted?: boolean;
}

export const PackOpeningModal: React.FC<PackOpeningModalProps> = ({ pack, isOpen, onClose, initialBoosted = false }) => {
  const { game } = useGame();
  const { showToast } = useToast();
  const [isOpening, setIsOpening] = useState(false);
  const [packPull, setPackPull] = useState<PackPull | null>(null);
  const [revealedCards, setRevealedCards] = useState<number>(0);
  const [showResults, setShowResults] = useState(false);
  const [use3D, setUse3D] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [screenShake, setScreenShake] = useState(false);
  const [boosted, setBoosted] = useState(initialBoosted);
  const skipRef = useRef(false);

  // Sync boosted state when modal opens with a new pack
  useEffect(() => {
    if (isOpen) {
      setBoosted(initialBoosted);
    }
  }, [isOpen, initialBoosted]);

  // Screen shake effect
  useEffect(() => {
    if (!screenShake) return;
    const timer = setTimeout(() => setScreenShake(false), 350);
    return () => clearTimeout(timer);
  }, [screenShake]);

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
    const use3DNow = supportsWebGL() && !reducedMotion;
    setUse3D(use3DNow);
    skipRef.current = reducedMotion;
    setIsOpening(true);
    setPackPull(null);
    setRevealedCards(0);
    setShowResults(false);
    setShowFlash(false);
    setScreenShake(false);

    try {
      const packPromise = tieredPackService.openPack(pack, boosted, game);

      if (!use3DNow) {
        await wait(2000);
      }

      const pull = await packPromise;
      setPackPull(pull);

      // Trigger screen effects for dramatic reveal
      if (use3DNow && !skipRef.current) {
        setTimeout(() => setShowFlash(true), 1100);
        setTimeout(() => setScreenShake(true), 1150);
        setTimeout(() => setShowFlash(false), 1300);
      }

      const cardCount = pull.cards.length;

      if (use3DNow && !skipRef.current) {
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

      if (errorMessage.includes('Unable to fetch cards') || errorMessage.includes('No suitable card')) {
        showToast(
          'Unable to open pack right now. The Pokemon TCG API might be experiencing issues. Please try again in a few moments.',
          'error'
        );
      } else {
        showToast(`Error opening pack: ${errorMessage}. Please try again.`, 'error');
      }
    } finally {
      setIsOpening(false);
    }
  };

  const handleAddAllToVault = () => {
    if (!packPull) return;

    packPull.cards.forEach((card) => {
      const price = card.marketPrice || pokemonApi.extractCardPrice(card);
      vaultService.addToVault(card, price, 1, 'raw', `Pulled from ${packPull.pack.name}`, game);
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
      case 'starter':
        return 'from-gray-400 to-gray-600';
      case 'bronze':
        return 'from-orange-400 to-orange-600';
      case 'silver':
        return 'from-gray-300 to-gray-500';
      case 'gold':
        return 'from-yellow-400 to-yellow-600';
      case 'platinum':
        return 'from-purple-400 to-purple-600';
      default:
        return 'from-blue-400 to-blue-600';
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

  // Mutually exclusive stages — never stack prep + opening (that forced scroll).
  const stage: 'prep' | 'opening' | 'reveal' | 'results' =
    showResults && packPull
      ? 'results'
      : packPull
        ? 'reveal'
        : isOpening
          ? 'opening'
          : 'prep';

  const footer =
    stage === 'prep' ? (
      <button
        type="button"
        onClick={handleOpenPack}
        className={`flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r px-4 py-4 text-lg font-black text-white shadow-lg transition-all sm:py-4 sm:text-xl ${getTierColor(pack.tier)}`}
      >
        {boosted ? <Zap className="h-6 w-6 shrink-0" /> : <Sparkles className="h-6 w-6 shrink-0" />}
        {boosted ? 'RIP IT BOOSTED!' : 'RIP IT OPEN!'}
      </button>
    ) : stage === 'results' ? (
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <button
          type="button"
          onClick={handleAddAllToVault}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:from-purple-700 hover:to-blue-700"
        >
          <Vault className="h-5 w-5 shrink-0" aria-hidden="true" />
          Add to Vault
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:from-green-700 hover:to-emerald-700"
        >
          <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
          Rip Another!
        </button>
      </div>
    ) : null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="pack" variant="stage" footer={footer}>
      {/* Screen effects overlay — positioned above canvas but below UI */}
      <AnimatePresence>
        {showFlash && (
          <motion.div
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none absolute inset-0 z-50"
            style={{
              background: 'radial-gradient(circle at center, rgba(255,255,255,0.8) 0%, transparent 70%)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Screen shake wrapper */}
      <div
        className={`relative h-full ${screenShake ? 'animate-screen-shake' : ''}`}
      >
      {stage === 'prep' && (
        <div className="flex h-full flex-col items-center justify-center gap-5 pb-2 sm:gap-6">
          <div className="relative">
            <div
              className={`absolute inset-0 rounded-2xl bg-gradient-to-r opacity-50 blur-2xl motion-safe:animate-pulse ${getTierColor(pack.tier)}`}
            />
            <div
              className={`relative rounded-2xl bg-gradient-to-br p-6 shadow-2xl sm:p-8 ${getTierColor(pack.tier)}`}
            >
              <Sparkles className="mx-auto h-16 w-16 text-white sm:h-20 sm:w-20" aria-hidden="true" />
            </div>
          </div>

          <div className="text-center">
            <h2
              className={`bg-gradient-to-r bg-clip-text text-3xl font-black text-transparent sm:text-4xl ${getTierColor(pack.tier)}`}
            >
              {pack.name}
            </h2>
            <p className="mt-1 text-sm text-ink-muted sm:text-base">{pack.description}</p>
          </div>

          <div className="grid w-full max-w-xl grid-cols-3 gap-3 rounded-2xl border border-border-subtle bg-surface-inset/70 p-4 sm:gap-6 sm:p-5">
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted sm:text-xs">Cards</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink-primary sm:text-3xl">{pack.cardsPerPack}</p>
            </div>
            <div className="border-x border-border-subtle text-center">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted sm:text-xs">Price</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-400 sm:text-3xl">${pack.price}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted sm:text-xs">Avg</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-purple-400 sm:text-3xl">${pack.averageValue}</p>
            </div>
          </div>

          <div className="w-full max-w-xl rounded-2xl border border-border-subtle bg-surface-inset p-4 sm:p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">Value Odds</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {(boosted && pack.boostedValueRanges ? pack.boostedValueRanges : pack.valueRanges).map((range, idx) => (
                <div key={idx} className="flex items-baseline justify-between gap-2 text-xs sm:text-sm">
                  <span className="truncate text-ink-muted">{range.label}</span>
                  <span className="shrink-0 font-bold tabular-nums text-ink-primary">
                    {range.probability.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] italic text-ink-muted sm:text-xs">
              {boosted
                ? 'Boosted odds — lower floor, higher ceiling. Same price.'
                : 'Exact simulated odds — every tier disclosed.'}
            </p>
          </div>

          {pack.boostedValueRanges && (
            <label className="flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 cursor-pointer select-none transition-colors hover:bg-amber-500/10">
              <div className="flex items-center gap-2.5">
                <Zap className="h-5 w-5 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-semibold text-ink-primary">Boosted</p>
                  <p className="text-[11px] text-ink-muted">Lower floor, higher grail chance — same price</p>
                </div>
              </div>
              <div className="relative shrink-0">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={boosted}
                  onChange={(e) => setBoosted(e.target.checked)}
                />
                <div className="h-6 w-11 rounded-full bg-surface-hover transition-colors peer-checked:bg-amber-500" />
                <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
              </div>
            </label>
          )}
        </div>
      )}

      {/* Opening — replaces prep entirely (no stacked scroll) */}
      {stage === 'opening' && (
        <div className="flex h-full flex-col items-center justify-center gap-6 pb-2">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 opacity-50 blur-2xl motion-safe:animate-pulse" />
            <div
              className={`relative rounded-2xl bg-gradient-to-br p-10 shadow-2xl sm:p-12 ${getTierColor(pack.tier)} motion-safe:animate-bounce`}
            >
              <Sparkles className="h-20 w-20 text-white motion-safe:animate-spin sm:h-24 sm:w-24" aria-hidden="true" />
            </div>
          </div>
          <div className="text-center">
            <p className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-2xl font-black text-transparent motion-safe:animate-pulse sm:text-3xl">
              OPENING PACK...
            </p>
            <p className="mt-2 text-ink-muted">Rolling the odds...</p>
          </div>
          <button type="button" onClick={handleSkip} className="btn-secondary">
            <FastForward className="h-4 w-4" aria-hidden="true" />
            Skip animation
          </button>
        </div>
      )}

      {/* Reveal */}
      {stage === 'reveal' && packPull && (
        <div className="relative flex h-full flex-col">
          <button
            type="button"
            onClick={() => {
              handleSkip();
              if (use3D) setShowResults(true);
            }}
            className="absolute right-0 top-0 z-20 inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-overlay/90 px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:text-ink-primary"
          >
            <FastForward className="h-3.5 w-3.5" aria-hidden="true" />
            Skip
          </button>
          <h3 className="mb-4 shrink-0 bg-gradient-to-r from-yellow-400 via-pink-400 to-purple-600 bg-clip-text text-center text-2xl font-bold text-transparent motion-safe:animate-pulse sm:text-3xl">
            YOU PULLED
          </h3>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            {use3D ? (
              <Suspense
                fallback={
                  <div className="flex h-full min-h-[400px] w-full items-center justify-center">
                    <div className="h-12 w-12 animate-spin rounded-full border-2 border-border-default border-t-accent" />
                  </div>
                }
              >
                <PackOpeningScene
                  tier={packPull.pack.tier}
                  cardImages={packPull.cards.map((card) => card.images?.small ?? null)}
                  cardRarities={packPull.cards.map((card) => card.rarity ?? '')}
                  onComplete={() => setShowResults(true)}
                  glamourLevel={(() => {
                    const ratio = packPull.totalValue / packPull.pack.price;
                    if (ratio >= 4) return 'god';
                    if (ratio >= 2) return 'legendary';
                    if (ratio >= 1.5) return 'amazing';
                    if (ratio >= 1.1) return 'good';
                    return 'normal';
                  })()}
                />
              </Suspense>
            ) : (
              <div className="flex items-end justify-center gap-2 overflow-x-auto px-2 pb-4">
                {packPull.cards.map((card, index) => {
                  const price = card.marketPrice || pokemonApi.extractCardPrice(card);
                  const revealed = index < revealedCards;
                  const fanRotate = (index - (packPull.cards.length - 1) / 2) * 12;
                  const fanX = (index - (packPull.cards.length - 1) / 2) * 24;

                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 80, rotate: 0, scale: 0.6 }}
                      animate={
                        revealed
                          ? { opacity: 1, y: 0, rotate: fanRotate, x: fanX, scale: 1 }
                          : { opacity: 0, y: 80, scale: 0.5 }
                      }
                      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                      className="origin-bottom"
                      style={{ zIndex: index }}
                    >
                      <div className="relative">
                        <div
                          className={`absolute -inset-4 rounded-3xl bg-gradient-to-r opacity-60 blur-2xl motion-safe:animate-pulse ${getRarityColor(card.rarity)}`}
                        />
                        <div
                          className={`relative overflow-hidden rounded-2xl border-4 bg-gradient-to-br p-1 shadow-2xl ${getRarityColor(card.rarity)}`}
                        >
                          {card.images?.small ? (
                            <img
                              src={card.images.small}
                              alt={card.name}
                              className="h-auto max-h-[min(60vh,500px)] w-auto max-w-[min(75vw,22rem)] rounded-xl"
                            />
                          ) : (
                            <div className="flex h-[min(60vh,500px)] w-[min(75vw,22rem)] flex-col items-center justify-center rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 p-6 text-white">
                              <p className="text-center text-lg font-bold">{card.name}</p>
                              <p className="mt-1 text-center text-sm text-gray-400">{card.set.name}</p>
                            </div>
                          )}
                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                            <div
                              className={`rounded-full px-4 py-2 text-lg font-black shadow-lg ${
                                price > packPull.pack.price
                                  ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white'
                                  : 'bg-gradient-to-r from-red-400 to-rose-500 text-white'
                              }`}
                            >
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
        </div>
      )}

      {/* Results — large card stage, no nested scroll */}
      {stage === 'results' && packPull && (
        <div className="flex h-full flex-col gap-4 pb-1 sm:gap-5">
          <div className="shrink-0 text-center">
            <h3 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-2xl font-black text-transparent sm:text-3xl">
              Pack Opened!
            </h3>
            <p className="mt-0.5 text-sm text-ink-muted">Here&apos;s what you pulled</p>
          </div>

          <div className="grid shrink-0 grid-cols-3 gap-2 sm:gap-4">
            <div className="rounded-xl bg-surface-inset px-2 py-3 text-center sm:p-4">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted sm:text-xs">Total</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-ink-primary sm:text-2xl">
                ${packPull.totalValue.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl bg-surface-inset px-2 py-3 text-center sm:p-4">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted sm:text-xs">Cost</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-ink-primary sm:text-2xl">
                ${packPull.pack.price.toFixed(2)}
              </p>
            </div>
            <div
              className={`rounded-xl px-2 py-3 text-center sm:p-4 ${
                packPull.profit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
              }`}
            >
              <p
                className={`text-[10px] uppercase tracking-wide sm:text-xs ${
                  packPull.profit >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                P/L
              </p>
              <p
                className={`mt-1 text-lg font-bold tabular-nums sm:text-2xl ${
                  packPull.profit >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {packPull.profit >= 0 ? '+' : ''}${packPull.profit.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-wrap items-center justify-center gap-6 overflow-hidden">
            {packPull.cards.map((card, index) => {
              const price = card.marketPrice || pokemonApi.extractCardPrice(card);
              return (
                <div key={index} className="flex max-h-full flex-col items-center">
                  <div
                    className={`shrink overflow-hidden rounded-2xl border-4 bg-gradient-to-br p-1 shadow-2xl ${getRarityColor(card.rarity)}`}
                  >
                    {card.images?.small ? (
                      <img
                        src={card.images.small}
                        alt={card.name}
                        className="mx-auto h-auto max-h-[min(46vh,380px)] w-auto max-w-[min(72vw,20rem)] rounded-xl object-contain"
                      />
                    ) : (
                      <div className="flex aspect-[63/88] max-h-[min(46vh,380px)] w-[min(72vw,20rem)] flex-col items-center justify-center rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 p-6 text-white">
                        <p className="text-lg font-bold">{card.name}</p>
                        <p className="mt-1 text-sm text-gray-400">{card.set.name}</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 shrink-0 text-center">
                    <p className="text-lg font-bold text-ink-primary sm:text-xl">{card.name}</p>
                    <p className="text-sm text-ink-muted">
                      {card.set.name} • #{card.number}
                    </p>
                    {card.rarity ? (
                      <span className="mt-1.5 inline-block rounded-full bg-purple-500/10 px-3 py-0.5 text-xs font-semibold text-purple-300">
                        {card.rarity}
                      </span>
                    ) : null}
                    {price > 0 ? (
                      <p className="mt-1 text-2xl font-black text-emerald-400 sm:text-3xl">${price.toFixed(2)}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </Modal>
  );
};
