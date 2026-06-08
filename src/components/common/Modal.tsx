import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'detail';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, size = 'medium' }) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const sizeClasses = {
    small: 'max-w-[min(24rem,calc(100vw-1rem))]',
    medium: 'max-w-[min(32rem,calc(100vw-1rem))]',
    large: 'max-w-[min(42rem,calc(100vw-1.5rem))]',
    /** Card detail — wide enough for chart, not full-screen */
    detail: 'max-w-[min(48rem,calc(100vw-1.5rem))]',
  };

  const maxHeightClass =
    size === 'detail'
      ? 'max-h-[min(calc(100dvh-1.5rem),52rem)]'
      : 'max-h-[min(calc(100dvh-1rem),40rem)]';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[70] overflow-y-auto bg-black/75 p-3  sm:p-4"
          onClick={onClose}
        >
          {/* Scrollable backdrop wrapper — keeps modal usable at browser zoom levels */}
          <div className="flex min-h-full items-start justify-center py-3 sm:items-center sm:py-6">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className={`relative flex w-full flex-col ${sizeClasses[size]} ${maxHeightClass} rounded-2xl border border-border-strong bg-surface-overlay shadow-2xl`}
              onClick={(e) => e.stopPropagation()}
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
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
                {children}
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
