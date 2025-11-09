import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, size = 'medium' }) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleBodyScroll = () => {
      if (isOpen) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = 'unset';
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      handleBodyScroll();
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const sizeClasses = {
    small: 'max-w-md',
    medium: 'max-w-2xl',
    large: 'max-w-6xl'
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30
            }}
            className={`relative bg-white rounded-3xl shadow-2xl ${sizeClasses[size]} w-full max-h-[90vh] overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Gradient border effect */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary-600 via-accent-600 to-pink-600 opacity-20 blur-xl pointer-events-none" />
            
            {/* Enhanced close button */}
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="absolute top-4 right-4 z-20 bg-gradient-to-r from-gray-100 to-gray-200 hover:from-red-100 hover:to-red-200 rounded-full p-2.5 transition-all duration-300 shadow-lg hover:shadow-xl group"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-gray-600 group-hover:text-red-600 transition-colors" />
            </motion.button>
            
            {/* Scrollable content */}
            <div className="relative bg-white rounded-3xl overflow-y-auto max-h-[90vh] custom-scrollbar">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};