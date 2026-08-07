import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PullCard } from '../types';
import { PullCardView } from './PullCardView';
import { opRarityStyle, OP_RARITY_LABELS } from './opRarityStyles';
import { cn } from '../../../lib/utils';

interface RevealCardProps {
  card: PullCard;
  /** When true the card flips from back to face (one-shot trigger). */
  startFlip?: boolean;
  /** Show the rarity chip over the card after reveal. */
  showChaseLabel?: boolean;
  /** Click handler on the card (used by the pack fan). */
  onClick?: () => void;
}

const FLIP_DURATION_MS = 380;

/**
 * Single card flip reveal: a card back rotates 180° around the Y axis and
 * reveals the card face. Two faces with backface-visibility: hidden —
 * the back sits at 0°, the front is pre-mirrored at 180°, so at the end of
 * the rotation the face shows upright (not mirrored).
 */
export const RevealCard: React.FC<RevealCardProps> = ({
  card,
  startFlip = false,
  showChaseLabel = true,
  onClick,
}) => {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!startFlip) return;
    const revealAt = FLIP_DURATION_MS;
    const t = setTimeout(() => setRevealed(true), revealAt);
    return () => clearTimeout(t);
  }, [startFlip]);

  return (
    <div
      className={cn('relative [perspective:900px]', onClick && 'cursor-pointer')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <motion.div
        initial={{ rotateY: 0 }}
        animate={{ rotateY: startFlip ? 180 : 0 }}
        transition={{ duration: FLIP_DURATION_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div style={{ backfaceVisibility: 'hidden' }}>
          <PullCardView card={card} hidden />
        </div>
        <div
          className="absolute inset-0"
          style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}
        >
          <PullCardView card={card} showMeta={false} />
        </div>
      </motion.div>

      {/* Reveal glint */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: startFlip ? [0, 0.9, 0] : 0 }}
        transition={{ delay: (FLIP_DURATION_MS - 60) / 1000, duration: 0.45, times: [0, 0.5, 1] }}
      >
        <div className="holo-sweep h-full w-full rounded-xl" aria-hidden />
      </motion.div>

      {showChaseLabel && card.isChase && revealed && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none absolute -top-1.5 left-0 right-0 z-10"
        >
          <div
            className={cn(
              'mx-auto w-fit rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider',
              opRarityStyle(card.rarity).badge
            )}
          >
            {OP_RARITY_LABELS[card.rarity]}
          </div>
        </motion.div>
      )}
    </div>
  );
};
