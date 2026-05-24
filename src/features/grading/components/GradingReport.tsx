import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Eye, AlertTriangle } from 'lucide-react';
import { GradingResult, SideGrading, CategoryDetails, CropImage, CornerDetail } from '../../../types/grading';
import { ZoomModal } from './ZoomModal';

interface GradingReportProps {
  result: GradingResult;
}

const CATEGORY_META: Record<
  string,
  { label: string; icon: string; color: string; borderColor: string; headerBg: string }
> = {
  centering: {
    label: 'Centering',
    icon: '⊞',
    color: 'text-sky-300',
    borderColor: 'border-sky-500/30',
    headerBg: 'bg-sky-500/10',
  },
  corners: {
    label: 'Corners',
    icon: '◇',
    color: 'text-emerald-300',
    borderColor: 'border-emerald-500/30',
    headerBg: 'bg-emerald-500/10',
  },
  edges: {
    label: 'Edges',
    icon: '▭',
    color: 'text-amber-300',
    borderColor: 'border-amber-500/30',
    headerBg: 'bg-amber-500/10',
  },
  surface: {
    label: 'Surface',
    icon: '◎',
    color: 'text-rose-300',
    borderColor: 'border-rose-500/30',
    headerBg: 'bg-rose-500/10',
  },
};

// ── Corner Detail Table ──────────────────────────────────────────────────────

function CornerDetailTable({ corners }: { corners: CategoryDetails }) {
  const cornerDetails = corners.deviations?.cornerDetails as CornerDetail[] | undefined;
  if (!cornerDetails || cornerDetails.length === 0) return null;

  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        Per-corner breakdown
      </div>
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-inset/40">
              <th className="px-2 py-1.5 text-left font-medium text-ink-muted">Corner</th>
              <th className="px-2 py-1.5 text-right font-medium text-ink-muted">Fray</th>
              <th className="px-2 py-1.5 text-right font-medium text-ink-muted">Fill</th>
              <th className="px-2 py-1.5 text-right font-medium text-ink-muted">Angle</th>
            </tr>
          </thead>
          <tbody>
            {cornerDetails.map((c) => (
              <tr key={c.name} className="border-b border-border-subtle/50 last:border-0">
                <td className="px-2 py-1.5 font-medium text-ink-secondary capitalize">
                  {c.name.replace(/-/g, ' ')}
                </td>
                <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${c.fray >= 9.5 ? 'text-emerald-300' : c.fray >= 8.0 ? 'text-sky-300' : c.fray >= 6.0 ? 'text-amber-300' : 'text-red-300'}`}>
                  {c.fray}
                </td>
                <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${c.fill >= 9.5 ? 'text-emerald-300' : c.fill >= 8.0 ? 'text-sky-300' : c.fill >= 6.0 ? 'text-amber-300' : 'text-red-300'}`}>
                  {c.fill}
                </td>
                <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${c.angle >= 9.5 ? 'text-emerald-300' : c.angle >= 8.0 ? 'text-sky-300' : c.angle >= 6.0 ? 'text-amber-300' : 'text-red-300'}`}>
                  {c.angle}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Category Section ─────────────────────────────────────────────────────────

function CategorySection({
  category,
  data,
  side,
  onZoom,
}: {
  category: string;
  data: CategoryDetails;
  side: 'front' | 'back';
  onZoom: (src: string, label: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const config = CATEGORY_META[category] || CATEGORY_META.surface;
  const crops = data.crops || [];

  return (
    <div className={`overflow-hidden rounded-lg border ${config.borderColor}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:brightness-110 ${config.headerBg}`}
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm ${config.color}`}>{config.icon}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            {side} {config.label}
          </span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${config.color} bg-surface-overlay`}>
            {data.score}/10
          </span>
          {data.defects.length > 0 && (
            <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">
              {data.defects.length} issue{data.defects.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-ink-muted" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-subtle px-3 py-3">
              <p className="mb-2 text-xs text-ink-muted">{data.details}</p>

              {data.defects.length > 0 && (
                <div className="mb-3 space-y-1">
                  {data.defects.map((d, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-ink-secondary">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/70" />
                      {d}
                    </div>
                  ))}
                </div>
              )}

              {category === 'corners' && <CornerDetailTable corners={data} />}

              {crops.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    Close-up regions
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {crops.map((crop: CropImage, i: number) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onZoom(crop.image, `${side} ${config.label}: ${crop.label}`)}
                        className="group relative overflow-hidden rounded-md border border-border-subtle bg-surface-overlay transition-all hover:border-border-strong hover:shadow-md"
                      >
                        <div className="aspect-square overflow-hidden">
                          <img
                            src={crop.image}
                            alt={crop.label}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110"
                            loading="lazy"
                          />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                          <Eye className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
                          <span className="truncate text-[9px] text-white/90">{crop.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Side Section ─────────────────────────────────────────────────────────────

function SideSection({
  label,
  icon,
  side,
  data,
  onZoom,
}: {
  label: string;
  icon: string;
  side: 'front' | 'back';
  data: SideGrading;
  onZoom: (src: string, label: string) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink-primary">{label}</h3>
        <div className="flex-1 border-t border-border-subtle" />
      </div>
      <div className="space-y-2">
        {(['centering', 'corners', 'edges', 'surface'] as const).map((cat) => (
          <CategorySection
            key={`${side}-${cat}`}
            category={cat}
            data={data[cat]}
            side={side}
            onZoom={onZoom}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Report ──────────────────────────────────────────────────────────────

export const GradingReport: React.FC<GradingReportProps> = ({ result }) => {
  const [zoomImage, setZoomImage] = useState<{ src: string; label: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'front' | 'back'>('front');

  const hasBack = !!result.back;

  // Determine which side data to show in the top-level category keys (for backward compat)
  const frontData: SideGrading | undefined = result.front || {
    centering: result.centering,
    corners: result.corners,
    edges: result.edges,
    surface: result.surface,
  };

  const backData = result.back;

  // Auto-select front tab
  useEffect(() => {
    if (!hasBack) setActiveTab('front');
  }, [hasBack]);

  const handleZoom = useCallback((src: string, label: string) => {
    setZoomImage({ src, label });
  }, []);

  return (
    <div className="space-y-4">
      {/* Front/Back tabs */}
      {hasBack && (
        <div className="flex gap-1 rounded-lg border border-border-subtle bg-surface-inset/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('front')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'front'
                ? 'bg-surface-overlay text-ink-primary shadow-sm'
                : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            Front
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('back')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === 'back'
                ? 'bg-surface-overlay text-ink-primary shadow-sm'
                : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            Back
          </button>
        </div>
      )}

      {/* Active side */}
      {activeTab === 'front' && frontData && (
        <SideSection
          label="Front"
          icon="F"
          side="front"
          data={frontData}
          onZoom={handleZoom}
        />
      )}
      {activeTab === 'back' && backData && (
        <SideSection
          label="Back"
          icon="B"
          side="back"
          data={backData}
          onZoom={handleZoom}
        />
      )}

      {/* Zoom modal */}
      <AnimatePresence>
        {zoomImage && (
          <ZoomModal
            imageSrc={zoomImage.src}
            label={zoomImage.label}
            onClose={() => setZoomImage(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
