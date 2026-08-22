import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, ScanSearch } from 'lucide-react';
import { GradingResult } from '../../../types/grading';
import { DefectBox, displayCardName } from '../gradingPresentation';
import { ZoomModal } from './ZoomModal';

interface InspectCanvasProps {
  result: GradingResult;
  side: 'front' | 'back';
  onSideChange: (side: 'front' | 'back') => void;
  highlight?: DefectBox | null;
  highlightLabel?: string | null;
  wearMarks?: DefectBox[];
  showWearMarks: boolean;
  onToggleWearMarks: () => void;
}

function containRect(containerW: number, containerH: number, imgW: number, imgH: number) {
  if (!containerW || !containerH || !imgW || !imgH) {
    return { offsetX: 0, offsetY: 0, drawnW: 0, drawnH: 0 };
  }
  const scale = Math.min(containerW / imgW, containerH / imgH);
  const drawnW = imgW * scale;
  const drawnH = imgH * scale;
  return {
    offsetX: (containerW - drawnW) / 2,
    drawnW,
    offsetY: (containerH - drawnH) / 2,
    drawnH,
  };
}

export const InspectCanvas: React.FC<InspectCanvasProps> = ({
  result,
  side,
  onSideChange,
  highlight,
  highlightLabel,
  wearMarks = [],
  showWearMarks,
  onToggleWearMarks,
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [layout, setLayout] = useState({ offsetX: 0, offsetY: 0, drawnW: 0, drawnH: 0 });
  const [zoomOpen, setZoomOpen] = useState(false);

  const src = side === 'back' ? result.backImageUrl : result.imageUrl;
  const hasBack = Boolean(result.backImageUrl || result.back);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    const img = imgRef.current;
    if (!frame || !img || !img.naturalWidth) return;
    setLayout(
      containRect(frame.clientWidth, frame.clientHeight, img.naturalWidth, img.naturalHeight)
    );
  }, []);

  useEffect(() => {
    measure();
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(frame);
    return () => ro.disconnect();
  }, [measure, src, side]);

  const boxStyle = (box: DefectBox) => ({
    left: layout.offsetX + box.x * layout.drawnW,
    top: layout.offsetY + box.y * layout.drawnH,
    width: Math.max(8, box.width * layout.drawnW),
    height: Math.max(8, box.height * layout.drawnH),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {hasBack ? (
          <div
            role="tablist"
            aria-label="Card side"
            className="flex gap-1 rounded-xl border border-border-subtle bg-surface-inset/40 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={side === 'front'}
              onClick={() => onSideChange('front')}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                side === 'front'
                  ? 'bg-surface-overlay text-ink-primary ring-1 ring-border-subtle'
                  : 'text-ink-muted hover:text-ink-secondary'
              }`}
            >
              Front
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={side === 'back'}
              onClick={() => onSideChange('back')}
              disabled={!result.backImageUrl}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
                side === 'back'
                  ? 'bg-surface-overlay text-ink-primary ring-1 ring-border-subtle'
                  : 'text-ink-muted hover:text-ink-secondary'
              }`}
            >
              Back
            </button>
          </div>
        ) : (
          <p className="text-sm font-medium text-ink-secondary">Front</p>
        )}

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--foil)]"
            checked={showWearMarks}
            onChange={onToggleWearMarks}
          />
          Show wear marks
        </label>
      </div>

      <div
        ref={frameRef}
        className="relative flex min-h-[28rem] items-center justify-center overflow-hidden rounded-2xl border border-border-subtle bg-surface-inset/50 sm:min-h-[32rem] lg:min-h-[36rem]"
      >
        {src ? (
          <img
            ref={imgRef}
            src={src}
            alt={`${displayCardName(result.cardName)} ${side}`}
            className="absolute inset-0 h-full w-full object-contain"
            onLoad={measure}
          />
        ) : (
          <p className="text-sm text-ink-muted">No {side} photo</p>
        )}

        {showWearMarks &&
          layout.drawnW > 0 &&
          wearMarks.map((box, i) => (
            <div
              key={`wear-${i}`}
              aria-hidden
              className="pointer-events-none absolute rounded-sm border border-amber-300/50"
              style={boxStyle(box)}
            />
          ))}

        {highlight && layout.drawnW > 0 && (
          <div
            className="pointer-events-none absolute rounded-sm border-2 border-amber-300 bg-amber-300/10"
            style={boxStyle(highlight)}
          />
        )}

        {src && (
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            className="absolute bottom-3 right-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-overlay/90 px-2.5 py-1.5 text-sm text-ink-secondary hover:text-ink-primary"
          >
            <Eye className="h-4 w-4" />
            Expand
          </button>
        )}
      </div>

      {highlightLabel ? (
        <p className="flex items-start gap-2 text-sm leading-relaxed text-ink-secondary">
          <ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <span>{highlightLabel}</span>
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          Select an issue on the right to highlight it on the card.
        </p>
      )}

      {zoomOpen && src && (
        <ZoomModal
          imageSrc={src}
          label={`${displayCardName(result.cardName)} · ${side}`}
          onClose={() => setZoomOpen(false)}
        />
      )}
    </div>
  );
};
