import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import FocusTrap from 'focus-trap-react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'detail' | 'pack';
  /** Sticky action bar pinned below the body. */
  footer?: React.ReactNode;
  hideClose?: boolean;
}

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  small: 'w-full max-w-[min(24rem,calc(100vw-1.5rem))]',
  medium: 'w-full max-w-[min(32rem,calc(100vw-1.5rem))]',
  large: 'w-full max-w-[min(42rem,calc(100vw-2rem))]',
  detail: 'w-full max-w-[min(48rem,calc(100vw-2rem))]',
  /** Near-fullscreen stage for pack opening — dominates the page. */
  pack: 'w-[min(64rem,calc(100vw-1.5rem))] h-[min(52rem,calc(100dvh-1.5rem))] sm:h-[min(56rem,calc(100dvh-2rem))]',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  size = 'medium',
  footer,
  hideClose = false,
}) => {
  const previousActiveElement = useRef<Element | null>(null);
  const isPack = size === 'pack';

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

  const maxHeight =
    size === 'pack'
      ? undefined
      : size === 'detail'
        ? 'max-h-[min(calc(100dvh-1.5rem),52rem)]'
        : 'max-h-[min(calc(100dvh-1rem),40rem)]';

  const modal = (
    <AnimatePresence>
      {isOpen && (
        <FocusTrap focusTrapOptions={{ initialFocus: false, allowOutsideClick: true }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-2 sm:p-4"
            onClick={handleBackdropClick}
            role="presentation"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className={`relative flex flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface-overlay shadow-2xl ${sizeClasses[size]} ${maxHeight ?? ''}`}
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              {!hideClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute right-3 top-3 z-20 rounded-lg border border-border-default bg-surface-overlay/95 p-2 text-ink-secondary shadow-sm backdrop-blur transition-colors hover:bg-surface-hover hover:text-ink-primary"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              )}

              <div
                className={`custom-scrollbar min-h-0 flex-1 overflow-x-hidden px-4 pt-12 sm:px-8 sm:pt-14 ${
                  isPack
                    ? 'flex flex-col overflow-y-hidden'
                    : 'overflow-y-auto overscroll-contain pb-4 sm:pb-5'
                }`}
              >
                <div className="min-h-0 flex-1">
            {children}
          </div>
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
