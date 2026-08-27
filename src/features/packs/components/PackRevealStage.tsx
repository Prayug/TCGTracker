import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FastForward, Sparkles } from 'lucide-react';
import { Pack, PackPull } from '../../../types/pokemon';
import { PackPullCardDisplay } from './PackPullCardDisplay';
import { getPullTheme, packTierTheme } from '../packPresentation';
import { cn } from '../../../lib/utils';

type RevealPhase = 'mystery' | 'silhouette' | 'focus';

interface PackRevealStageProps {
  pack: Pack;
  packPull: PackPull | null;
  skip: boolean;
  reducedMotion: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

const MysteryCard: React.FC<{ gradient: string }> = ({ gradient }) => (
  <div className="relative mx-auto w-[min(72vw,18rem)] sm:w-[20rem]">
    <div
      className={cn(
        'absolute -inset-6 rounded-[2rem] bg-gradient-to-br opacity-30 blur-2xl',
        gradient
      )}
      aria-hidden
    />
    <div
      className={cn(
        'relative aspect-[63/88] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br shadow-elevated',
        gradient
      )}
    >
      <div className="holo-texture opacity-40" aria-hidden />
      <div className="absolute inset-[10%] rounded-xl border border-white/15 bg-black/25" />
      <Sparkles
        className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-white/80"
        aria-hidden
      />
    </div>
  </div>
);

export const PackRevealStage: React.FC<PackRevealStageProps> = ({
  pack,
  packPull,
  skip,
  reducedMotion,
  onComplete,
  onSkip,
}) => {
  const [phase, setPhase] = useState<RevealPhase>('mystery');
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current();
  };

  useEffect(() => {
    if (!packPull) return;
    if (reducedMotion || skip) {
      finish();
      return;
    }

    setPhase('silhouette');
    const focusTimer = window.setTimeout(() => setPhase('focus'), 520);
    const doneTimer = window.setTimeout(finish, 520 + 1100);
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(doneTimer);
    };
  }, [packPull, reducedMotion, skip]);

  const theme = packPull ? getPullTheme(packPull) : null;
  const tier = packTierTheme(pack.tier);
  const isSlab = packPull?.pullKind === 'slab';
  const card = packPull?.cards[0];

  const visualPhase: RevealPhase = !packPull
    ? 'mystery'
    : phase === 'mystery'
      ? 'silhouette'
      : phase;

  const headline =
    visualPhase === 'mystery' ? 'revealing...' : theme?.hitLabel ?? 'CARD PULLED';

  const cardMotion =
    visualPhase === 'focus'
      ? { scale: 1, filter: 'blur(0px)', y: 0, opacity: 1 }
      : visualPhase === 'silhouette'
        ? { scale: 1.04, filter: 'blur(0px)', y: 0, opacity: 1 }
        : { scale: 0.92, filter: 'blur(14px)', y: 12, opacity: 0.85 };

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center gap-5 px-2 pb-2">
      <button
        type="button"
        onClick={onSkip}
        className="absolute right-0 top-0 z-20 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border-default bg-surface-overlay/90 px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:text-ink-primary"
      >
        <FastForward className="h-3.5 w-3.5" aria-hidden="true" />
        Skip
      </button>

      <div className="flex flex-col items-center gap-2">
        <Sparkles
          className={cn(
            'h-4 w-4',
            theme ? theme.accent : 'text-ink-muted',
            visualPhase === 'mystery' && 'motion-safe:animate-pulse'
          )}
          aria-hidden
        />
        <p
          className={cn(
            'text-center text-xs font-bold uppercase tracking-[0.28em]',
            theme && visualPhase !== 'mystery' ? theme.accent : 'text-ink-muted'
          )}
        >
          {headline}
        </p>
      </div>

      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        {!card || visualPhase === 'mystery' ? (
          <motion.div
            initial={{ scale: 0.86, opacity: 0.6, filter: 'blur(12px)' }}
            animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            <MysteryCard gradient={tier.gradient} />
          </motion.div>
        ) : (
          <motion.div
            initial={{ scale: 0.9, filter: 'blur(12px)', y: 16, opacity: 0.7 }}
            animate={cardMotion}
            transition={{ type: 'spring', stiffness: 280, damping: 20, filter: { duration: 0.28 } }}
            className="flex h-full max-h-full items-center justify-center"
          >
            <PackPullCardDisplay
              card={card}
              isSlab={!!isSlab}
              theme={theme ?? undefined}
              size="reveal"
              showSlabEffects={visualPhase === 'focus' && !!isSlab}
              blurred={visualPhase === 'silhouette'}
              grader={packPull.grader}
              grade={packPull.grade}
              imageClassName="h-auto max-h-[min(68vh,36rem)] w-auto max-w-[min(78vw,22rem)]"
            />
          </motion.div>
        )}
      </div>
    </div>
  );
};
