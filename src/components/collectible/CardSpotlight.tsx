import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import FocusTrap from 'focus-trap-react';
import { RotateCcw, X } from 'lucide-react';
import { HolographicCard, type CollectibleSource } from './HolographicCard';
import { FINISH_LABEL, finishOf } from './finish';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';

/**
 * Shared-element card expansion. Render it with the same `layoutId` as the
 * card that was clicked: the card travels from its place into the spotlight
 * and back on close. The right column is whatever facts the caller passes.
 */
export function CardSpotlight({
  card,
  layoutId,
  onClose,
  children,
  title,
}: {
  card: CollectibleSource | null;
  layoutId?: string;
  onClose: () => void;
  children?: ReactNode;
  title?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!card) return;
    setFlipped(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [card, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {card ? (
        <FocusTrap
          focusTrapOptions={{ initialFocus: false, allowOutsideClick: true, fallbackFocus: 'body' }}
        >
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-label={title ?? card.name}
          >
            <motion.button
              type="button"
              aria-label="Close"
              tabIndex={-1}
              className="absolute inset-0 cursor-default bg-stage/75 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.25 }}
              onClick={onClose}
            />
            <div className="relative grid max-h-full w-full max-w-[980px] items-center gap-6 overflow-y-auto sm:grid-cols-[minmax(0,420px)_minmax(0,1fr)] sm:gap-10">
              <div className="mx-auto w-[min(72vw,420px)] sm:w-full">
                <HolographicCard
                  card={card}
                  layoutId={layoutId}
                  level="showcase"
                  size="large"
                  priority
                  flipped={flipped}
                />
              </div>
              <motion.div
                className="relative rounded-lg border border-border-default bg-surface-overlay p-5 text-ink-primary shadow-popover sm:p-6"
                initial={reduced ? false : { opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{
                  type: 'spring',
                  stiffness: 260,
                  damping: 28,
                  delay: reduced ? 0 : 0.08,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-ink-muted">
                      {card.set?.name ?? 'Unknown set'}
                      {card.number ? ` · No. ${card.number}` : ''}
                    </p>
                    <h2 className="mt-1 text-[clamp(1.4rem,2.6vw,1.9rem)] font-semibold leading-tight">
                      {card.name}
                    </h2>
                    <p className="mt-2 flex flex-wrap gap-2 text-[12.5px]">
                      {card.rarity ? (
                        <span className="rounded-full bg-surface-hover px-2.5 py-0.5">
                          {card.rarity}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-surface-hover px-2.5 py-0.5">
                        {FINISH_LABEL[finishOf(card)]}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-hover hover:bg-surface-hover"
                    aria-label="Close preview"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>
                <div className="mt-5">{children}</div>
                <button
                  type="button"
                  onClick={() => setFlipped((f) => !f)}
                  className="mt-5 inline-flex items-center gap-2 text-[13px] text-ink-secondary hover:text-ink-primary"
                  aria-pressed={flipped}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  {flipped ? 'Show the front' : 'Turn the card over'}
                </button>
              </motion.div>
            </div>
          </div>
        </FocusTrap>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
