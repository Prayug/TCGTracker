import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface ZoomModalProps {
  imageSrc: string;
  label: string;
  onClose: () => void;
}

/**
 * Lightbox portaled to document.body so it isn't trapped by page transforms
 * (e.g. animate-fade-in). Sized with dvh so the full dialog stays on screen.
 */
export function ZoomModal({ imageSrc, label, onClose }: ZoomModalProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setScale((s) => Math.max(0.5, Math.min(8, s + (e.deltaY > 0 ? -0.15 : 0.15))));
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(8, s + 0.25));
      if (e.key === '-') setScale((s) => Math.max(0.5, s - 0.25));
      if (e.key === '0') {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      posStart.current = { ...position };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [position]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      setPosition({
        x: posStart.current.x + (e.clientX - dragStart.current.x),
        y: posStart.current.y + (e.clientY - dragStart.current.y),
      });
    },
    [isDragging]
  );

  const handlePointerUp = useCallback(() => setIsDragging(false), []);

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const modal = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-2 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        className="flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-overlay shadow-2xl"
        style={{
          // Account for padding on the backdrop; keep entire dialog in view
          height: 'min(calc(100dvh - 1rem), 52rem)',
          maxHeight: 'calc(100dvh - 1rem)',
          width: 'min(56rem, calc(100vw - 1rem))',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-3 sm:px-4">
          <span className="truncate text-sm font-medium text-ink-primary">{label}</span>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-ink-muted">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={resetView}
              className="rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-inset hover:text-ink-primary"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-ink-muted hover:bg-surface-inset hover:text-ink-primary"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={viewportRef}
          className={`relative min-h-0 flex-1 overflow-hidden bg-black/60 ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="absolute inset-0 flex items-center justify-center overflow-auto p-2 sm:p-4">
            <img
              src={imageSrc}
              alt={label}
              draggable={false}
              // Fit within the viewport without upscaling past native pixels at 100%.
              className="max-h-full max-w-full select-none rounded-md object-contain"
              style={{
                width: 'auto',
                height: 'auto',
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.12s ease-out',
              }}
            />
          </div>
        </div>

        <div className="flex h-9 shrink-0 items-center justify-center border-t border-border-subtle px-3 text-[11px] text-ink-muted">
          Scroll to zoom · Drag to pan · + / − · 0 to reset · Esc to close
        </div>
      </div>
    </motion.div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
