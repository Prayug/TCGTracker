import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Eye, AlertTriangle } from 'lucide-react';
import { DefectRegion } from '../../../types/grading';
import { ZoomModal } from './ZoomModal';

interface DefectEvidenceProps {
  regions: DefectRegion[];
  defects: Array<{ category: string; text: string }>;
}

const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: string; color: string; borderColor: string }
> = {
  centering: {
    label: 'Centering',
    icon: '⊞',
    color: 'text-sky-300',
    borderColor: 'border-sky-500/30',
  },
  corners: {
    label: 'Corners',
    icon: '◇',
    color: 'text-emerald-300',
    borderColor: 'border-emerald-500/30',
  },
  edges: {
    label: 'Edges',
    icon: '▭',
    color: 'text-amber-300',
    borderColor: 'border-amber-500/30',
  },
  surface: {
    label: 'Surface',
    icon: '◎',
    color: 'text-rose-300',
    borderColor: 'border-rose-500/30',
  },
};

const SEVERITY_STYLES: Record<string, string> = {
  minor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  moderate: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  severe: 'bg-red-500/10 text-red-300 border-red-500/30',
};

function CategoryCard({
  category,
  regions,
  defects,
}: {
  category: string;
  regions: DefectRegion[];
  defects: string[];
}) {
  const [expanded, setExpanded] = useState(true);
  const [zoomImage, setZoomImage] = useState<{ src: string; label: string } | null>(null);
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.surface;

  const severityBadge = (severity: string) => (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${SEVERITY_STYLES[severity] || SEVERITY_STYLES.minor}`}
    >
      {severity}
    </span>
  );

  return (
    <>
      <div
        className={`overflow-hidden rounded-lg border ${config.borderColor} bg-surface-inset/40`}
      >
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-surface-inset/60"
        >
          <div className="flex items-center gap-2">
            <span className={`text-sm ${config.color}`}>{config.icon}</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              {config.label}
            </span>
            {regions.length > 0 && (
              <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[9px] text-ink-muted">
                {regions.length} region{regions.length !== 1 ? 's' : ''}
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
              <div className="border-t border-border-subtle px-3 py-2">
                {defects.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {defects.map((d, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-1.5 text-xs text-ink-secondary"
                      >
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/70" />
                        {d}
                      </div>
                    ))}
                  </div>
                )}

                {regions.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {regions.map((region, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          setZoomImage({
                            src: region.cropImage,
                            label: `${config.label}: ${region.label}`,
                          })
                        }
                        className="group relative overflow-hidden rounded-md border border-border-subtle bg-surface-overlay transition-all hover:border-border-strong hover:shadow-md"
                      >
                        <div className="aspect-square overflow-hidden">
                          <img
                            src={region.cropImage}
                            alt={region.label}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110"
                            loading="lazy"
                          />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                          <Eye className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-[9px] text-white/90">
                              {region.label}
                            </span>
                            {severityBadge(region.severity)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {defects.length === 0 && regions.length === 0 && (
                  <p className="py-1 text-center text-xs text-ink-muted">No issues detected</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {zoomImage && (
          <ZoomModal
            imageSrc={zoomImage.src}
            label={zoomImage.label}
            onClose={() => setZoomImage(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export const DefectEvidence: React.FC<DefectEvidenceProps> = ({ regions, defects }) => {
  const grouped = {
    centering: regions.filter((r) => r.category === 'centering'),
    corners: regions.filter((r) => r.category === 'corners'),
    edges: regions.filter((r) => r.category === 'edges'),
    surface: regions.filter((r) => r.category === 'surface'),
  };

  const defectMap: Record<string, string[]> = {
    centering: [],
    corners: [],
    edges: [],
    surface: [],
  };
  for (const d of defects) {
    const cat = d.category.toLowerCase();
    if (cat in defectMap) defectMap[cat].push(d.text);
  }

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        Defect evidence — tap regions to zoom
      </div>
      <div className="space-y-2">
        {(['centering', 'corners', 'edges', 'surface'] as const).map((cat) => (
          <CategoryCard
            key={cat}
            category={cat}
            regions={grouped[cat]}
            defects={defectMap[cat]}
          />
        ))}
      </div>
    </div>
  );
};
