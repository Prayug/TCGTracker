import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, Eye } from 'lucide-react';
import { CategoryDetails, CropImage, GradingResult } from '../../../types/grading';
import {
  CategoryKey,
  CATEGORY_LABEL,
  cornerWearRows,
  evidenceForDefect,
  formatCenteringSplit,
  formatScore,
  humanCategoryNarrative,
  selectEvidenceCrops,
  sideData,
  wearTextClass,
} from '../gradingPresentation';
import { ZoomModal } from './ZoomModal';

interface GradingReportProps {
  result: GradingResult;
  side: 'front' | 'back';
  category: CategoryKey;
  selectedDefect: string | null;
  onSelectDefect: (defect: string) => void;
}

function CenteringMeasurements({ data }: { data: CategoryDetails }) {
  const lr =
    data.deviations && typeof data.deviations.leftRight === 'number'
      ? formatCenteringSplit(data.deviations.leftRight as number)
      : null;
  const tb =
    data.deviations && typeof data.deviations.topBottom === 'number'
      ? formatCenteringSplit(data.deviations.topBottom as number)
      : null;
  if (!lr && !tb) return null;
  return (
    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
      {lr && (
        <div>
          <dt className="text-ink-muted">Left-right</dt>
          <dd
            className={`font-mono tabular-nums ${lr.off ? 'text-amber-300' : 'text-ink-primary'}`}
          >
            {lr.text}
          </dd>
        </div>
      )}
      {tb && (
        <div>
          <dt className="text-ink-muted">Top-bottom</dt>
          <dd
            className={`font-mono tabular-nums ${tb.off ? 'text-amber-300' : 'text-ink-primary'}`}
          >
            {tb.text}
          </dd>
        </div>
      )}
    </dl>
  );
}

export const GradingReport: React.FC<GradingReportProps> = ({
  result,
  side,
  category,
  selectedDefect,
  onSelectDefect,
}) => {
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);

  const data = sideData(result, side)?.[category];
  if (!data) {
    return <p className="text-sm text-ink-muted">No {side} analysis for this category.</p>;
  }

  const defects = data.defects || [];
  const crops = selectEvidenceCrops(data.crops, 3);
  const selectedCrop: CropImage | undefined = selectedDefect
    ? evidenceForDefect(selectedDefect, category, side, data, result.defectRegions).crop
    : undefined;
  const shownCrops = selectedCrop?.image
    ? [selectedCrop, ...crops.filter((c) => c.image !== selectedCrop.image)].slice(0, 3)
    : crops;

  const corners = category === 'corners' ? cornerWearRows(data) : [];
  const hasCentering =
    category === 'centering' && data.deviations && typeof data.deviations.leftRight === 'number';

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-primary">{CATEGORY_LABEL[category]}</h3>
        <p className={`font-mono text-sm tabular-nums ${wearTextClass(data.score)}`}>
          {data.withheld || data.score == null
            ? data.scoreLow != null && data.scoreHigh != null
              ? `${data.scoreLow}–${data.scoreHigh}`
              : 'Unknown'
            : `${formatScore(data.score)}/10`}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-ink-secondary">
        {humanCategoryNarrative(category, data)}
      </p>

      {defects.length > 0 && (
        <ul className="space-y-1.5">
          {defects.map((defect) => {
            const active = selectedDefect === defect;
            return (
              <li key={defect}>
                <button
                  type="button"
                  onClick={() => onSelectDefect(defect)}
                  className={`flex w-full cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm leading-snug transition-colors ${
                    active
                      ? 'border-amber-400/40 bg-amber-400/10 text-ink-primary'
                      : 'border-border-subtle bg-surface-inset/40 text-ink-secondary hover:border-border-default hover:text-ink-primary'
                  }`}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span>{defect}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {(hasCentering || corners.length > 0) && (
        <div>
          <button
            type="button"
            onClick={() => setShowMeasurements((v) => !v)}
            className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-ink-secondary hover:text-ink-primary"
            aria-expanded={showMeasurements}
          >
            Measurements
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showMeasurements ? 'rotate-180' : ''}`}
            />
          </button>
          {showMeasurements && (
            <div className="mt-2 rounded-lg border border-border-subtle bg-surface-inset/30 p-3">
              {hasCentering && <CenteringMeasurements data={data} />}
              {corners.length > 0 && (
                <ul className="space-y-1.5 text-sm">
                  {corners.map((c) => (
                    <li key={c.name} className="flex justify-between gap-3 capitalize">
                      <span className="text-ink-secondary">{c.name} wear</span>
                      <span className={`font-mono tabular-nums ${wearTextClass(c.wear)}`}>
                        {formatScore(c.wear)}/10
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {shownCrops.length > 0 && selectedDefect && (
        <div>
          <p className="mb-2 text-sm text-ink-muted">Close-up</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shownCrops.map((crop, i) => (
              <button
                key={`${crop.label}-${i}`}
                type="button"
                onClick={() => setZoom({ src: crop.image, label: crop.label })}
                className="group relative overflow-hidden rounded-lg border border-border-subtle"
              >
                <div className="aspect-square overflow-hidden">
                  <img
                    src={crop.image}
                    alt={crop.label}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/35">
                  <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100" />
                </span>
                <span className="absolute inset-x-0 bottom-0 bg-black/65 px-2 py-1 text-xs text-white">
                  {crop.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {zoom && <ZoomModal imageSrc={zoom.src} label={zoom.label} onClose={() => setZoom(null)} />}
    </div>
  );
};
