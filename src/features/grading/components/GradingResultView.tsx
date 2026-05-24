import React from 'react';
import { motion } from 'framer-motion';
import { Download, Share2, Vault } from 'lucide-react';
import { GradingResult, gradeToVaultCondition, normalizeScore } from '../../../types/grading';
import { calculateGradingUplift } from '../../../services/gradingService';
import { GradeBadge } from './GradeBadge';
import { SubScoreGauge } from './SubScoreGauge';
import { GradingReport } from './GradingReport';

interface GradingResultViewProps {
  result: GradingResult;
  rawPrice?: number;
  onAddToVault?: (result: GradingResult) => void;
  onGradeAnother?: () => void;
}

const EMPTY_CATEGORY = { score: 0, details: '', defects: [] as string[] };

/** Format centering deviation as L/R or T/B ratio.
 *  New system stores the larger share % (e.g. 52 for 52/48).
 *  Legacy stores deviation % (e.g. 5.2) → convert.
 */
function formatRatio(pct: number): string {
  // Legacy deviation: values < 50 are % off-center
  const share = pct < 50 ? Math.round(50 + pct / 2) : Math.round(pct);
  const other = 100 - share;
  return `${share}/${other}`;
}

export const GradingResultView: React.FC<GradingResultViewProps> = ({
  result,
  rawPrice,
  onAddToVault,
  onGradeAnother,
}) => {
  // Front+back responses may only nest scores under `front`; fall back for older payloads
  const centering = result.centering ?? result.front?.centering ?? EMPTY_CATEGORY;
  const corners = result.corners ?? result.front?.corners ?? EMPTY_CATEGORY;
  const edges = result.edges ?? result.front?.edges ?? EMPTY_CATEGORY;
  const surface = result.surface ?? result.front?.surface ?? EMPTY_CATEGORY;

  const uplift =
    result.estimatedGradedValue != null && rawPrice != null
      ? result.estimatedGradedValue - rawPrice
      : rawPrice != null
        ? calculateGradingUplift(rawPrice, result.grade)
        : null;

  const handleShare = async () => {
    const text = `${result.cardName || 'Card'} — PSA-style Grade ${result.grade} ${result.gradeLabel}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'TCGTracker PSA-style Grade', text });
        return;
      } catch {
        // fall through
      }
    }
    await navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grade-${result.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-xl border border-border-strong bg-surface-overlay p-5 shadow-sm"
    >
      {/* Header: Card image + grade badge */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2">
          {result.imageUrl && (
            <img
              src={result.imageUrl}
              alt={result.cardName || 'Graded card'}
              className="h-56 w-auto rounded-lg border border-border-subtle object-contain"
            />
          )}
          {result.backImageUrl && (
            <img
              src={result.backImageUrl}
              alt="Card back"
              className="h-56 w-auto rounded-lg border border-border-subtle object-contain"
            />
          )}
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                PSA-style estimate
              </p>
              <h2 className="mt-1 text-xl font-semibold text-ink-primary">
                {result.cardName || 'Unknown Card'}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {result.grade}/10 · {result.gradeLabel}
                {result.back && (
                  <span className="ml-2 text-ink-muted">· Front + Back</span>
                )}
                {result.confidence != null && (
                  <span className="ml-2 text-ink-muted">
                    · Confidence {Math.round(result.confidence * 100)}%
                  </span>
                )}
              </p>
              {result.retakeRecommended && (
                <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100">
                  Low confidence — retake on a solid background with sharper focus for a better
                  estimate. This is a PSA-style estimate, not a professional grade.
                </p>
              )}
              {result.limitations && (
                <p className="mt-1 text-xs text-ink-muted">{result.limitations}</p>
              )}
              {result.extraction?.overlay && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-accent">Detection overlay</summary>
                  <img
                    src={result.extraction.overlay}
                    alt="Card detection overlay"
                    className="mt-2 max-h-40 rounded border border-border-subtle object-contain"
                  />
                </details>
              )}
            </div>
            <GradeBadge grade={result.grade} label={result.gradeLabel} size="lg" />
          </div>

          {(result.estimatedGradedValue != null || rawPrice != null) && (
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border-subtle bg-surface-inset p-3 sm:grid-cols-3">
              {rawPrice != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-muted">Raw value</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
                    ${rawPrice.toFixed(2)}
                  </p>
                </div>
              )}
              {result.estimatedGradedValue != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-muted">Est. graded</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
                    ${result.estimatedGradedValue.toFixed(2)}
                  </p>
                </div>
              )}
              {uplift != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                    Grading uplift
                  </p>
                  <p
                    className={`font-mono text-sm font-semibold tabular-nums ${
                      uplift >= 0 ? 'text-gain' : 'text-loss'
                    }`}
                  >
                    {uplift >= 0 ? '+' : ''}${uplift.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sub-score gauges (quick overview) */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SubScoreGauge
          label="Centering"
          score={centering.score}
          defects={centering.defects}
        />
        <SubScoreGauge label="Corners" score={corners.score} defects={corners.defects} />
        <SubScoreGauge label="Edges" score={edges.score} defects={edges.defects} />
        <SubScoreGauge label="Surface" score={surface.score} defects={surface.defects} />
      </div>

      {/* Centering PSA ratios */}
      {centering &&
        'deviations' in centering &&
        centering.deviations &&
        typeof centering.deviations.leftRight === 'number' && (
        <p className="mt-3 text-xs text-ink-muted">
          Centering — L/R {formatRatio(centering.deviations.leftRight)} · T/B{' '}
          {formatRatio(centering.deviations.topBottom)}
        </p>
      )}

      {/* Full TAG-style detailed report with close-ups */}
      <div className="mt-6">
        <GradingReport result={result} />
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-2">
        {onAddToVault && (
          <button type="button" onClick={() => onAddToVault(result)} className="btn-primary">
            <Vault className="h-4 w-4" />
            Add to Vault ({result.suggestedCondition || gradeToVaultCondition(result.grade)})
          </button>
        )}
        <button type="button" onClick={handleShare} className="btn-secondary">
          <Share2 className="h-4 w-4" />
          Share
        </button>
        <button type="button" onClick={handleDownload} className="btn-secondary">
          <Download className="h-4 w-4" />
          Download
        </button>
        {onGradeAnother && (
          <button type="button" onClick={onGradeAnother} className="btn-secondary">
            Grade another
          </button>
        )}
      </div>
    </motion.div>
  );
};
