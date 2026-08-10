import React from 'react';
import NumberFlow from '@number-flow/react';
import { motion } from 'framer-motion';
import { AlertCircle, Crosshair, Download, RefreshCw, Share2, Shield, Vault } from 'lucide-react';
import { GradingResult, gradeHex, gradeToVaultCondition } from '../../../types/grading';
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

const ease = [0.16, 1, 0.3, 1] as const;

function ValueCell({
  label,
  value,
  tone,
  sign,
}: {
  label: string;
  value: number;
  tone?: 'gain' | 'loss' | 'neutral';
  sign?: string;
}) {
  const color = tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-ink-primary';
  return (
    <div className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface-inset/40 px-4 py-3">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            tone === 'gain'
              ? 'linear-gradient(to right, transparent, color-mix(in srgb, var(--gain) 60%, transparent), transparent)'
              : tone === 'loss'
                ? 'linear-gradient(to right, transparent, color-mix(in srgb, var(--loss) 60%, transparent), transparent)'
                : 'linear-gradient(to right, transparent, var(--border-strong), transparent)',
        }}
      />
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </p>
      <div className="mt-1.5">
        <NumberFlow
          value={value}
          format={{ style: 'currency', currency: 'USD' }}
          prefix={sign ?? ''}
          className={`font-mono text-lg font-semibold tabular-nums ${color}`}
        />
      </div>
    </div>
  );
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

  const hasCenteringRatio =
    centering &&
    'deviations' in centering &&
    centering.deviations &&
    typeof centering.deviations.leftRight === 'number';

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

  const gradeColor = gradeHex(result.grade);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease }}
      className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface-raised shadow-elevated"
    >
      {/* Top edge light */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent"
      />
      {/* Ambient stage tint */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(90% 55% at 50% 0%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 70%)',
        }}
      />

      {/* ── Hero: slab stage ─────────────────────────────────────────── */}
      <div className="relative flex flex-col gap-8 p-5 sm:p-8 lg:flex-row lg:items-start">
        {/* Card on pedestal */}
        <div className="relative z-10 flex shrink-0 flex-col items-center gap-4">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-10 rounded-full opacity-60 blur-3xl"
            style={{
              background:
                'radial-gradient(closest-side, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
            }}
          />
          {result.imageUrl && (
            <motion.div
              initial={{ opacity: 0, y: 18, rotateX: 8 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ duration: 0.5, ease, delay: 0.05 }}
              className="relative w-fit rounded-2xl border border-border-subtle bg-gradient-to-b from-surface-overlay to-surface-base p-3 shadow-elevated"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-5 top-2 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
              />
              <img
                src={result.imageUrl}
                alt={result.cardName || 'Graded card'}
                className="h-56 w-auto rounded-lg object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.55)]"
              />
            </motion.div>
          )}
          {result.backImageUrl && (
            <motion.img
              initial={{ opacity: 0, y: 18, rotate: 2 }}
              animate={{ opacity: 1, y: 0, rotate: -2 }}
              transition={{ duration: 0.5, ease, delay: 0.15 }}
              src={result.backImageUrl}
              alt="Card back"
              className="relative h-40 w-auto -rotate-2 rounded-lg border border-border-subtle object-contain shadow-elevated"
            />
          )}
        </div>

        {/* Slab plate */}
        <div className="relative z-10 min-w-0 flex-1">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-foil">
                <Shield className="h-3 w-3" />
                PSA-style estimate
              </p>
              <h2 className="mt-2 font-display text-h2 text-ink-primary">
                {result.cardName || 'Unknown Card'}
              </h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span
                  className="inline-flex items-center rounded-full border bg-surface-inset/60 px-2.5 py-1 font-mono text-[10px] font-semibold tabular-nums"
                  style={{
                    color: gradeColor,
                    borderColor: `color-mix(in srgb, ${gradeColor} 45%, transparent)`,
                  }}
                >
                  {result.grade}/10
                </span>
                {result.gradeLabel && (
                  <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-inset/60 px-2.5 py-1 font-mono text-[10px] tabular-nums text-ink-secondary">
                    {result.gradeLabel}
                  </span>
                )}
                {result.back && (
                  <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-inset/60 px-2.5 py-1 font-mono text-[10px] tabular-nums text-ink-secondary">
                    Front + Back
                  </span>
                )}
                {result.confidence != null && (
                  <span className="inline-flex items-center rounded-full border border-foil/30 bg-foil-muted px-2.5 py-1 font-mono text-[10px] tabular-nums text-foil">
                    {Math.round(result.confidence * 100)}% confidence
                  </span>
                )}
              </div>
            </div>
            <GradeBadge
              grade={result.grade}
              label={result.gradeLabel}
              size="lg"
              className="shrink-0"
            />
          </div>

          {/* Value ribbon */}
          {(result.estimatedGradedValue != null || rawPrice != null) && (
            <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {rawPrice != null && <ValueCell label="Raw value" value={rawPrice} />}
              {result.estimatedGradedValue != null && (
                <ValueCell label="Est. graded" value={result.estimatedGradedValue} />
              )}
              {uplift != null && (
                <ValueCell
                  label="Grading uplift"
                  value={Math.abs(uplift)}
                  sign={uplift >= 0 ? '+' : '−'}
                  tone={uplift >= 0 ? 'gain' : 'loss'}
                />
              )}
            </div>
          )}

          {/* Confidence */}
          {result.confidence != null && (
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Pipeline confidence
                </span>
                <span className="font-mono text-xs tabular-nums text-ink-secondary">
                  {Math.round(result.confidence * 100)}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5 ring-1 ring-border-subtle">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(result.confidence * 100)}%` }}
                  transition={{ duration: 0.9, ease, delay: 0.3 }}
                  className="h-full rounded-full bg-gradient-to-r from-foil to-accent"
                />
              </div>
            </div>
          )}

          {/* Centering ratios */}
          {hasCenteringRatio && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-inset/40 px-2.5 py-1.5 font-mono text-[10px] tabular-nums text-ink-secondary">
                <Crosshair className="h-3 w-3 text-ink-muted" />
                L/R {formatRatio(centering.deviations.leftRight)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-inset/40 px-2.5 py-1.5 font-mono text-[10px] tabular-nums text-ink-secondary">
                <Crosshair className="h-3 w-3 text-ink-muted" />
                T/B {formatRatio(centering.deviations.topBottom)}
              </span>
            </div>
          )}

          {/* Notices */}
          {result.retakeRecommended && (
            <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3.5 backdrop-blur-sm">
              <div className="flex gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/90" />
                <p className="text-xs leading-relaxed text-amber-100/85">
                  Low confidence — retake on a solid background with sharper focus for a better
                  estimate. This is a PSA-style estimate, not a professional grade.
                </p>
              </div>
            </div>
          )}
          {result.limitations && (
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">{result.limitations}</p>
          )}
          {result.extraction?.overlay && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-accent transition-colors hover:text-accent-hover">
                Detection overlay
              </summary>
              <img
                src={result.extraction.overlay}
                alt="Card detection overlay"
                className="mt-2 max-h-40 rounded-lg border border-border-subtle object-contain"
              />
            </details>
          )}
        </div>
      </div>

      {/* ── Sub-score plaques ─────────────────────────────────────────── */}
      <section className="relative border-t border-border-subtle px-5 py-6 sm:px-8">
        <div className="mb-4 flex items-center gap-3">
          <h3 className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Condition assessment
          </h3>
          <div className="h-px flex-1 bg-gradient-to-r from-border-subtle to-transparent" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SubScoreGauge label="Centering" score={centering.score} defects={centering.defects} />
          <SubScoreGauge label="Corners" score={corners.score} defects={corners.defects} />
          <SubScoreGauge label="Edges" score={edges.score} defects={edges.defects} />
          <SubScoreGauge label="Surface" score={surface.score} defects={surface.defects} />
        </div>
      </section>

      {/* ── Detailed report ───────────────────────────────────────────── */}
      <section className="border-t border-border-subtle px-5 py-6 sm:px-8">
        <div className="mb-4 flex items-center gap-3">
          <h3 className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Detailed report
          </h3>
          <div className="h-px flex-1 bg-gradient-to-r from-border-subtle to-transparent" />
        </div>
        <GradingReport result={result} />
      </section>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-t border-border-subtle px-5 py-4 sm:px-8">
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
            <RefreshCw className="h-4 w-4" />
            Grade another
          </button>
        )}
      </div>
    </motion.div>
  );
};
