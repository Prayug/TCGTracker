import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import FocusTrap from 'focus-trap-react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobileViewport, usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { ModalCardScene } from '../three/ModalCardScene';

export type ModalVariant = 'inspect' | 'stage' | 'slab' | 'dive' | 'reveal' | 'confirm' | 'default';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'detail' | 'pack';
  /** Sticky action bar pinned below the body. */
  footer?: React.ReactNode;
  hideClose?: boolean;
  /** Chromatic Vault 3D entrance personality */
  variant?: ModalVariant;
  /** Optional card art for inspect CSS-3D scene */
  sceneImageUrl?: string;
  /** Extra class on the dialog panel */
  className?: string;
}

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  small: 'w-full max-w-[min(24rem,calc(100vw-1.5rem))]',
  medium: 'w-full max-w-[min(32rem,calc(100vw-1.5rem))]',
  large: 'w-full max-w-[min(42rem,calc(100vw-2rem))]',
  detail: 'w-full max-w-[min(48rem,calc(100vw-2rem))]',
  pack: 'w-[min(60rem,calc(100vw-1.5rem))] h-[min(46rem,calc(100dvh-1rem))] sm:h-[min(50rem,calc(100dvh-2rem))]',
};

const VARIANT_PANEL: Record<ModalVariant, Variants> = {
  default: {
    hidden: { opacity: 0, scale: 0.97 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.98 },
  },
  inspect: {
    hidden: { opacity: 0, rotateY: -28, scale: 0.88, z: -80 },
    visible: { opacity: 1, rotateY: 0, scale: 1, z: 0 },
    exit: { opacity: 0, rotateY: 18, scale: 0.94 },
  },
  stage: {
    hidden: { opacity: 0, scale: 0.92, y: 40 },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, y: 24 },
  },
  slab: {
    hidden: { opacity: 0, scale: 1.08, rotateX: 18, y: -30 },
    visible: { opacity: 1, scale: 1, rotateX: 0, y: 0 },
    exit: { opacity: 0, scale: 0.96, rotateX: -8 },
  },
  dive: {
    hidden: { opacity: 0, y: 80, rotateX: 22, scale: 0.94 },
    visible: { opacity: 1, y: 0, rotateX: 0, scale: 1 },
    exit: { opacity: 0, y: 40, rotateX: 10 },
  },
  reveal: {
    hidden: { opacity: 0, scale: 0.6, filter: 'blur(12px)' },
    visible: { opacity: 1, scale: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, scale: 1.04, filter: 'blur(8px)' },
  },
  confirm: {
    hidden: { opacity: 0, scale: 0.85, rotateZ: -3 },
    visible: { opacity: 1, scale: 1, rotateZ: 0 },
    exit: { opacity: 0, scale: 0.9, rotateZ: 2 },
  },
};

const REDUCED: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  size = 'medium',
  footer,
  hideClose = false,
  variant = 'default',
  sceneImageUrl,
  className,
}) => {
  const previousActiveElement = useRef<Element | null>(null);
  const isPack = size === 'pack' || variant === 'stage';
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useIsMobileViewport();
  const showScene = !reducedMotion && (variant === 'inspect' || variant === 'reveal') && isOpen;
  const showFoil =
    !reducedMotion && !isMobile && (variant === 'dive' || variant === 'reveal') && isOpen;

  const panelVariants = useMemo(() => {
    if (reducedMotion) return REDUCED;
    return VARIANT_PANEL[variant] ?? VARIANT_PANEL.default;
  }, [reducedMotion, variant]);

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement;
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = '';
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const maxHeight = isPack
    ? undefined
    : size === 'detail'
      ? 'max-h-[min(calc(100dvh-1.5rem),52rem)]'
      : 'max-h-[min(calc(100dvh-1rem),40rem)]';

  const borderAccent =
    variant === 'confirm'
      ? 'border-loss/40'
      : variant === 'dive' || variant === 'reveal'
        ? 'border-foil/30'
        : 'border-border-strong';

  const modal = (
    <AnimatePresence>
      {isOpen && (
        <FocusTrap focusTrapOptions={{ initialFocus: false, allowOutsideClick: true }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0.12 : 0.2 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-4"
            style={{ perspective: 1400 }}
            onClick={handleBackdropClick}
            role="presentation"
          >
            {showFoil ? (
              <div
                className="pointer-events-none absolute inset-0 -z-10 opacity-60"
                style={{
                  background:
                    'radial-gradient(ellipse at 30% 20%, rgba(110,231,183,0.18), transparent 45%), radial-gradient(ellipse at 80% 70%, rgba(91,196,212,0.16), transparent 40%)',
                }}
                aria-hidden
              />
            ) : null}

            <motion.div
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={
                reducedMotion
                  ? { duration: 0.15 }
                  : {
                      type: 'spring',
                      stiffness: 420,
                      damping: 34,
                      // Blur cannot go negative — spring overshoot would
                      // produce invalid keyframes like blur(-0.1px).
                      filter: { type: 'tween', duration: 0.3, ease: 'easeOut' },
                    }
              }
              style={{ transformStyle: 'preserve-3d' }}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-2xl border bg-surface-overlay shadow-2xl',
                borderAccent,
                sizeClasses[size],
                maxHeight,
                className
              )}
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              {!hideClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className={`absolute right-3 top-3 z-20 cursor-pointer rounded-lg border border-border-default bg-surface-overlay/95 text-ink-secondary shadow-sm backdrop-blur transition-colors hover:bg-surface-hover hover:text-ink-primary ${
                    isPack ? 'p-1.5' : 'p-2'
                  }`}
                  aria-label="Close modal"
                >
                  <X className={isPack ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
                </button>
              )}

              {showScene ? (
                <div className="border-b border-border-subtle bg-surface-inset/80">
                  <ModalCardScene imageUrl={sceneImageUrl} />
                </div>
              ) : null}

              {variant === 'reveal' && !reducedMotion ? (
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 bg-gradient-to-r from-accent via-foil to-accent"
                  aria-hidden
                />
              ) : null}

              <div
                className={cn(
                  'custom-scrollbar min-h-0 flex-1 overflow-x-hidden px-4 pt-12 sm:px-8 sm:pt-14',
                  isPack
                    ? 'flex flex-col overflow-y-auto overscroll-contain pt-8 sm:pt-10'
                    : 'overflow-y-auto overscroll-contain pb-4 sm:pb-5',
                  showScene && 'pt-4 sm:pt-5'
                )}
              >
                <div className="min-h-0 flex-1">{children}</div>
              </div>

              {footer ? (
                <div className="shrink-0 border-t border-border-default bg-surface-overlay px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-4">
                  {footer}
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        </FocusTrap>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
};
