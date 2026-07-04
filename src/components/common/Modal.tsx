import React, { useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FocusTrap from 'focus-trap-react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'detail';
}

const sizeClasses = {
  small: 'max-w-[min(24rem,calc(100vw-1rem))]',
  medium: 'max-w-[min(32rem,calc(100vw-1rem))]',
  large: 'max-w-[min(42rem,calc(100vw-1.5rem))]',
  detail: 'max-w-[min(48rem,calc(100vw-1.5rem))]',
};

const maxHeightForSize = (size: string) =>
  size === 'detail'
    ? 'max-h-[min(calc(100dvh-1.5rem),52rem)]'
    : 'max-h-[min(calc(100dvh-1rem),40rem)]';

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, size = 'medium' }) => {
  const previousActiveElement = useRef<Element | null>(null);

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

  return (
    <AnimatePresence>
      {isOpen && (
        <FocusTrap focusTrapOptions={{ initialFocus: false, allowOutsideClick: true }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] overflow-y-auto bg-black/75 p-3 sm:p-4"
            onClick={handleBackdropClick}
            role="presentation"
          >
            <div className="flex min-h-full items-start justify-center py-3 sm:items-center sm:py-6">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className={`relative flex w-full flex-col ${sizeClasses[size]} ${maxHeightForSize(size)} rounded-2xl border border-border-strong bg-surface-overlay shadow-2xl`}
                role="dialog"
                aria-modal="true"
              >
                <div className="flex shrink-0 items-center justify-end px-2 pt-2 sm:px-3 sm:pt-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-border-default bg-surface-hover p-2 text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary"
                    aria-label="Close modal"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                <div className="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
                  {children}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </FocusTrap>
      )}
    </AnimatePresence>
  );
};
