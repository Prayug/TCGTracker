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
import { PackPullCardDisplay } from './PackPullCardDisplay';
import { PackPullResults } from './PackPullResults';
import { PackOddsTable } from './PackOddsTable';
import { activePackRanges, getPullTheme, packTierTheme } from '../packPresentation';
import { formatCurrency } from '../../../utils/cardDisplay';
import { cn } from '../../../lib/utils';

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

export const PackOpeningModal: React.FC<PackOpeningModalProps> = ({
  pack,
  isOpen,
  onClose,
  initialBoosted = false,
}) => {
  const { game, isOnePiece } = useGame();
  const { showToast } = useToast();
  const [isOpening, setIsOpening] = useState(false);
  const [packPull, setPackPull] = useState<PackPull | null>(null);
  const [revealedCards, setRevealedCards] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [use3D, setUse3D] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [screenShake, setScreenShake] = useState(false);
  const [boosted, setBoosted] = useState(initialBoosted);
  const skipRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setBoosted(initialBoosted);
    }
  }, [isOpen, initialBoosted]);

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

      if (
        errorMessage.includes('Unable to fetch cards') ||
        errorMessage.includes('No suitable card') ||
        errorMessage.includes('Failed to fetch card pool')
      ) {
        showToast(
          'Unable to open pack. The card pool service may be unavailable — this feature requires backend services not available on the hosted demo.',
          'error'
        );
      } else if (
        errorMessage.includes('502') ||
        errorMessage.includes('503') ||
        errorMessage.includes('Failed to fetch')
      ) {
        showToast(
          'Pack service temporarily unavailable. The backend may be down — please try again later.',
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
      const price = packPull.totalValue || card.marketPrice || pokemonApi.extractCardPrice(card);
      const note =
        packPull.pullKind === 'slab'
          ? `Pulled from ${packPull.pack.name} (simulated ${packPull.grader || 'PSA'} ${packPull.grade || '10'})`
          : `Pulled from ${packPull.pack.name}`;
      vaultService.addToVault(card, price, 1, 'raw', note, game);
    });
    markOnboardingStep('vault');

    showToast(`Added all ${packPull.cards.length} cards to your vault!`, 'success');
  };

  const handleReset = () => {
    setPackPull(null);
    setRevealedCards(0);
    setShowResults(false);
    setIsOpening(false);
    skipRef.current = false;
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  if (!pack) return null;

  const tier = packTierTheme(pack.tier);
  const resultTheme = packPull ? getPullTheme(packPull) : null;
  const ranges = activePackRanges(pack, boosted);

  const getRarityColor = (rarity?: string) => {
    const r = (rarity || '').toLowerCase();
    if (r.includes('secret') || r.includes('rainbow'))
      return 'from-yellow-400 via-pink-400 to-purple-400';
    if (r.includes('ultra')) return 'from-purple-400 to-pink-400';
    if (r.includes('holo')) return 'from-blue-400 to-purple-400';
    if (r.includes('rare')) return 'from-yellow-400 to-orange-400';
    if (r.includes('uncommon')) return 'from-green-400 to-blue-400';
    return 'from-gray-400 to-gray-500';
  };

  const stage: 'prep' | 'opening' | 'reveal' | 'results' =
    showResults && packPull ? 'results' : packPull ? 'reveal' : isOpening ? 'opening' : 'prep';

  const footer =
    stage === 'prep' ? (
      <button
        type="button"
        onClick={handleOpenPack}
        className={cn(
          'flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r px-4 py-4 text-lg font-black text-white shadow-lg transition-all sm:text-xl',
          tier.gradient
        )}
      >
        {boosted ? <Zap className="h-6 w-6 shrink-0" /> : <Sparkles className="h-6 w-6 shrink-0" />}
        {boosted ? 'RIP IT BOOSTED!' : 'RIP IT OPEN!'}
      </button>
    ) : stage === 'results' ? (
      <div className="mx-auto flex w-full max-w-lg items-stretch gap-3 sm:gap-4">
        <button
          type="button"
          onClick={handleAddAllToVault}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-purple-700 hover:to-blue-700 active:scale-[0.98]"
        >
          <Vault className="h-4 w-4 shrink-0" aria-hidden="true" />
          Add to Vault
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-md transition-all hover:from-green-700 hover:to-emerald-700 active:scale-[0.98]"
        >
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
          Rip Again
        </button>
      </div>
    ) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="pack"
      variant="stage"
      footer={footer}
      className={cn(stage === 'results' && resultTheme?.modalRing)}
    >
      <AnimatePresence>
        {showFlash && (
          <motion.div
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none absolute inset-0 z-50"
            style={{
              background:
                'radial-gradient(circle at center, rgba(255,255,255,0.8) 0%, transparent 70%)',
            }}
          />
        )}
      </AnimatePresence>

      <div className={cn('relative h-full', screenShake && 'animate-screen-shake')}>
        {stage === 'prep' && (
          <div className="flex h-full flex-col justify-start gap-5 pb-2 sm:gap-6">
            <div>
              <p className={cn('text-[11px] font-semibold uppercase tracking-[0.2em]', tier.text)}>
                {pack.tier}
              </p>
              <h2 className="mt-1 font-display text-3xl font-semibold text-ink-primary sm:text-4xl">
                {pack.name}
              </h2>
              <p className="mt-1 text-lg font-semibold tabular-nums text-ink-secondary">
                {formatCurrency(pack.price)} per rip
              </p>
              <p className="mt-2 text-sm text-ink-muted">
                {pack.cardsPerPack} pull
                <span className="mx-2 text-ink-muted/50">·</span>
                EV {formatCurrency(pack.averageValue)}
                {pack.boostedValueRanges ? (
                  <>
                    <span className="mx-2 text-ink-muted/50">·</span>
                    Boosted available
                  </>
                ) : null}
              </p>
            </div>

            <PackOddsTable
              ranges={ranges}
              tierTheme={tier}
              boosted={boosted}
              isOnePiece={isOnePiece}
            />

            {pack.boostedValueRanges && (
              <label className="flex w-full cursor-pointer select-none items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 transition-colors hover:bg-amber-500/10">
                <div className="flex items-center gap-2.5">
                  <Zap className="h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <p className="text-sm font-semibold text-ink-primary">Boosted</p>
                    <p className="text-[11px] text-ink-muted">
                      Lower floor, higher grail chance — same price
                    </p>
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

        {stage === 'opening' && (
          <div className="flex h-full flex-col items-center justify-center gap-6 pb-2">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 opacity-50 blur-2xl motion-safe:animate-pulse" />
              <div
                className={cn(
                  'relative rounded-2xl bg-gradient-to-br p-10 shadow-2xl sm:p-12 motion-safe:animate-bounce',
                  tier.gradient
                )}
              >
                <Sparkles
                  className="h-20 w-20 text-white motion-safe:animate-spin sm:h-24 sm:w-24"
                  aria-hidden="true"
                />
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

        {stage === 'reveal' && packPull && (
          <div className="relative flex h-full flex-col">
            <button
              type="button"
              onClick={() => {
                handleSkip();
                if (use3D) setShowResults(true);
              }}
              className="absolute right-0 top-0 z-20 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default bg-surface-overlay/90 px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:text-ink-primary"
            >
              <FastForward className="h-3.5 w-3.5" aria-hidden="true" />
              Skip
            </button>
            <h3 className="mb-4 shrink-0 bg-gradient-to-r from-yellow-400 via-pink-400 to-purple-600 bg-clip-text text-center text-2xl font-bold text-transparent motion-safe:animate-pulse sm:text-3xl">
              {packPull.pullKind === 'slab'
                ? `${packPull.grader || 'PSA'} ${packPull.grade || '10'} SLAB PULLED`
                : 'YOU PULLED'}
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
                    const price =
                      packPull.totalValue || card.marketPrice || pokemonApi.extractCardPrice(card);
                    const isSlab = packPull.pullKind === 'slab';
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
                            className={cn(
                              'absolute -inset-4 rounded-3xl bg-gradient-to-r opacity-60 blur-2xl motion-safe:animate-pulse',
                              isSlab
                                ? 'from-amber-400 via-yellow-300 to-orange-500'
                                : getRarityColor(card.rarity)
                            )}
                          />
                          <PackPullCardDisplay
                            card={card}
                            isSlab={isSlab}
                            rarityClassName={getRarityColor(card.rarity)}
                            size="reveal"
                            showSlabEffects={isSlab}
                            grader={packPull.grader}
                            grade={packPull.grade}
                            imageClassName="h-auto max-h-[min(60vh,500px)] w-auto max-w-[min(75vw,22rem)]"
                          />
                          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
                            <div
                              className={cn(
                                'rounded-full px-4 py-2 text-lg font-black shadow-lg',
                                price > packPull.pack.price
                                  ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white'
                                  : 'bg-gradient-to-r from-red-400 to-rose-500 text-white'
                              )}
                            >
                              ${price.toFixed(2)}
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

        {stage === 'results' && packPull && (
          <PackPullResults
            packPull={packPull}
            rarityClassName={getRarityColor(packPull.cards[0]?.rarity)}
          />
        )}
      </div>
    </Modal>
  );
};
