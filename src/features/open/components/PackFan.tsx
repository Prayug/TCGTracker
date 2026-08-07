import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { MousePointerClick, Shuffle, Trash2 } from 'lucide-react';
import { PullCard } from '../types';
import { RevealCard } from './RevealCard';
import { usePrefersReducedMotion } from '../../../hooks/useMotionPreferences';
import { cn } from '../../../lib/utils';

interface PackFanProps {
  cards: PullCard[];
  /** Fired once every remaining card has been flipped face-up. */
  onDone?: () => void;
  /** Fired whenever the set of flipped card indices changes (for live value). */
  onFlippedChange?: (flippedIndices: number[]) => void;
  className?: string;
}

const CARD_W = 192; // w-48
const CARD_H = Math.round((CARD_W * 88) / 63); // ≈ 268
const STAGGER_MS = 60;
const ENTER_SPRING = { type: 'spring', stiffness: 100, damping: 18 } as const;

/**
 * Pack reveal matching the reference sim: cards drop in from above into a
 * stacked fanned pile — each card randomly rotated -10°..+10° like a
 * shuffled hand. Click a card to flip it (one at a time), click a flipped
 * card to fling it off. "Flip all" and "Remove commons" shortcuts on top.
 */
export const PackFan: React.FC<PackFanProps> = ({
  cards,
  onDone,
  onFlippedChange,
  className,
}) => {
  const reducedMotion = usePrefersReducedMotion();
  const [flipped, setFlipped] = useState<Set<number>>(new Set());
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [entered, setEntered] = useState(false);

  const n = cards.length;

  /* Stable random fan rotation per pack, like the reference. */
  const rotations = useMemo(
    () => cards.map(() => Math.round(Math.random() * 200 - 100) / 10),
    [cards]
  );

  const remaining = useMemo(
    () => cards.map((_, i) => i).filter((i) => !removed.has(i)),
    [cards, removed]
  );
  const flippedCount = remaining.filter((i) => flipped.has(i)).length;
  const allFlipped = remaining.length > 0 && flippedCount === remaining.length;

  useEffect(() => {
    if (allFlipped) onDone?.();
  }, [allFlipped, onDone]);

  useEffect(() => {
    onFlippedChange?.(Array.from(flipped).sort((a, b) => a - b));
  }, [flipped, onFlippedChange]);

  useEffect(() => {
    /* Enable Flip all once the first cards have landed — don't wait for the
       full stagger + settle (felt like a stuck loader). */
    const t = setTimeout(() => setEntered(true), reducedMotion ? 0 : 200);
    return () => clearTimeout(t);
  }, [n, reducedMotion]);

  const flipCard = useCallback((index: number) => {
    setFlipped((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const flyAway = useCallback((index: number) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const flipAll = useCallback(() => {
    setFlipped(new Set(cards.map((_, i) => i)));
  }, [cards]);

  const removeCommons = useCallback(() => {
    const commonIdx: number[] = [];
    cards.forEach((card, i) => {
      if (card.rarity === 'C' || card.rarity === 'UC') commonIdx.push(i);
    });
    setRemoved((prev) => {
      const next = new Set(prev);
      commonIdx.forEach((i) => next.add(i));
      return next;
    });
    /* Count removed commons toward live value so pack EV stays consistent. */
    setFlipped((prev) => {
      const next = new Set(prev);
      commonIdx.forEach((i) => next.add(i));
      return next;
    });
  }, [cards]);

  const flyTarget = useMemo(
    () => (typeof window !== 'undefined' ? -window.innerWidth - 40 : -1200),
    []
  );

  return (
    <div className={cn('relative h-full w-full min-h-0 overflow-hidden', className)}>
      {/* Fanned pile — centered in the stage */}
      <div className="absolute inset-0 overflow-hidden">
        {cards.map((card, i) => {
          const isFlipped = flipped.has(i);
          const isRemoved = removed.has(i);
          return (
            <motion.div
              key={`${card.id}-${i}`}
              className="absolute left-1/2"
              initial={reducedMotion ? false : { opacity: 0, y: -40, rotate: -3 + i, scale: 0.98 }}
              animate={{
                opacity: isRemoved ? 0 : 1,
                x: isRemoved ? flyTarget : 0,
                y: 0,
                scale: 1,
              }}
              transition={
                isRemoved
                  ? { duration: 0.7, ease: 'easeOut' }
                  : {
                      ...ENTER_SPRING,
                      /* Reverse drop order: hit enters first at the bottom,
                         commons land last on top — like the reference. */
                      delay: reducedMotion
                        ? 0
                        : Math.min((n - 1 - i) * (STAGGER_MS / 1000), 0.4),
                    }
              }
              style={{
                /* Card 0 on top: the pack reveals in order, hit buried last. */
                zIndex: isRemoved ? 0 : n - i,
                marginLeft: -CARD_W / 2,
                marginTop: -CARD_H / 2,
                top: '50%',
                width: CARD_W,
                height: CARD_H,
              }}
            >
              <div style={{ transform: `rotate(${rotations[i]}deg)` }}>
                <RevealCard
                  card={card}
                  startFlip={isFlipped}
                  onClick={() => (isFlipped ? flyAway(i) : flipCard(i))}
                />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="absolute inset-x-0 top-0 z-40 flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={flipAll}
          disabled={!entered || allFlipped}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-primary-foreground shadow-glow-accent transition-all hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Shuffle className="h-4 w-4" />
          Flip all Cards
        </button>
        <button
          type="button"
          onClick={removeCommons}
          disabled={!entered}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border-default bg-surface-overlay/90 px-4 py-2 text-sm font-bold text-ink-primary transition-all hover:border-border-strong hover:bg-surface-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
          Remove Commons
        </button>
        <span className="rounded-md border border-border-subtle bg-surface-overlay/90 px-2 py-1 text-[11px] font-semibold tabular-nums text-ink-muted">
          {flippedCount} / {remaining.length} flipped
        </span>
      </div>

      {/* Hint */}
      <p className="absolute inset-x-0 bottom-0 z-40 pb-1 text-center text-[11px] text-ink-muted">
        {allFlipped ? (
          'Click any card to send it to your collection'
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <MousePointerClick className="h-3.5 w-3.5" />
            Click a card to flip it
          </span>
        )}
      </p>
    </div>
  );
};
