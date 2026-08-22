import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Camera,
  Check,
  ChevronDown,
  Copy,
  Flag,
  ListPlus,
  MoreHorizontal,
  RefreshCw,
  Search,
  Share2,
  Vault,
} from 'lucide-react';
import { GradingResult } from '../../../types/grading';
import { formatCurrency } from '../../../utils/cardDisplay';
import {
  buildGradeDecision,
  DefectDispute,
  DisputeReason,
  disputeDefect,
  GradeMarket,
  ImpactLevel,
} from '../gradingDecision';
import {
  CategoryKey,
  evidenceForDefect,
  formatScore,
  isUnidentifiedCard,
  rankedCategories,
  sideData,
  wearMarkBoxes,
  wearTextClass,
} from '../gradingPresentation';
import { addToSubmissionQueue, isInSubmissionQueue } from '../submissionQueue';
import { submitGradingFeedback } from '../../../services/gradingService';
import { GradingReport } from './GradingReport';
import { InspectCanvas } from './InspectCanvas';

interface GradingResultViewProps {
  result: GradingResult;
  market?: GradeMarket | null;
  marketLoading?: boolean;
  onAddToVault?: (result: GradingResult) => void;
  onGradeAnother?: () => void;
  onIdentifyCard?: (result: GradingResult) => void;
  onRetake?: () => void;
  onQueueChange?: () => void;
}

const ease = [0.16, 1, 0.3, 1] as const;

const LEVEL_LABEL: Record<ImpactLevel, string> = {
  severe: 'Severe',
  high: 'High',
  moderate: 'Moderate',
  minimal: 'Minimal',
};

const LEVEL_CLASS: Record<ImpactLevel, string> = {
  severe: 'text-red-300 bg-red-500/10 border-red-500/25',
  high: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
  moderate: 'text-ink-secondary bg-surface-inset/50 border-border-subtle',
  minimal: 'text-ink-muted bg-transparent border-border-subtle',
};

const REASONS: { id: DisputeReason; label: string }[] = [
  { id: 'print', label: 'Print' },
  { id: 'foil', label: 'Foil' },
  { id: 'glare', label: 'Glare' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'other', label: 'Other' },
];

export const GradingResultView: React.FC<GradingResultViewProps> = ({
  result,
  market,
  marketLoading,
  onAddToVault,
  onGradeAnother,
  onIdentifyCard,
  onRetake,
  onQueueChange,
}) => {
  const rows = useMemo(() => rankedCategories(result), [result]);
  const unidentified = isUnidentifiedCard(result.cardName);
  const initialRow = rows.find((r) => r.limiting) ?? rows[0];
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [category, setCategory] = useState<CategoryKey>(initialRow?.key ?? 'surface');
  const [selectedDefect, setSelectedDefect] = useState<string | null>(
    initialRow?.defects[0] ?? null
  );
  const [showWearMarks, setShowWearMarks] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [disputes, setDisputes] = useState<DefectDispute[]>([]);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inQueue, setInQueue] = useState(false);

  useEffect(() => {
    const next = rankedCategories(result);
    const limiting = next.find((r) => r.limiting) ?? next[0];
    setCategory(limiting?.key ?? 'surface');
    setSelectedDefect(limiting?.defects[0] ?? null);
    setSide('front');
    setShowWearMarks(false);
    setDisputes([]);
    setReasonFor(null);
    setAdvancedOpen(false);
    setInQueue(isInSubmissionQueue(result.id));
  }, [result.id]);

  const decision = useMemo(
    () =>
      buildGradeDecision(result, {
        identified: !unidentified,
        market,
        disputes,
      }),
    [result, unidentified, market, disputes]
  );

  const categoryData = sideData(result, side)?.[category];
  const evidence =
    selectedDefect && categoryData
      ? evidenceForDefect(selectedDefect, category, side, categoryData, result.defectRegions)
      : undefined;
  const wearMarks = wearMarkBoxes(categoryData, result.defectRegions, category, side);

  const limiter = decision.impacts.find((i) => i.level !== 'minimal') ?? decision.impacts[0];
  const visibleImpacts = decision.impacts.filter((i) => i.level !== 'minimal').slice(0, 5);
  const centeringNote = decision.impacts.find((i) => i.level === 'minimal');

  const primaryIsRetake = Boolean(
    (result.retakeRecommended || result.surfaceRetakeRecommended) && onRetake
  );
  const primaryIsIdentify = !primaryIsRetake && unidentified && onIdentifyCard;
  const vaultLabel = `Save as ${decision.marketplaceLabel}`;

  const selectCategory = (key: CategoryKey) => {
    setCategory(key);
    const data = sideData(result, side)?.[key];
    setSelectedDefect(data?.defects[0] ?? null);
  };

  const selectDefect = (defect: string, cat: CategoryKey = category) => {
    setSelectedDefect(defect);
    const frontCat = sideData(result, 'front')?.[cat];
    const backCat = sideData(result, 'back')?.[cat];
    const frontEv = frontCat
      ? evidenceForDefect(defect, cat, 'front', frontCat, result.defectRegions)
      : undefined;
    const backEv = backCat
      ? evidenceForDefect(defect, cat, 'back', backCat, result.defectRegions)
      : undefined;
    if (side === 'front' && !frontEv?.location && backEv?.location) setSide('back');
    if (side === 'back' && !backEv?.location && frontEv?.location) setSide('front');
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(decision.sellerCopy);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleShare = async () => {
    const text = decision.sellerCopy;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'TCGTracker condition notes', text });
        return;
      } catch {
        // fall through
      }
    }
    await navigator.clipboard.writeText(text);
  };

  const handleFlag = async () => {
    const text = `Flagged detection: ${decision.displayName} · ${decision.marketplaceAbbr} · ${selectedDefect || decision.why}`;
    await navigator.clipboard.writeText(text);
  };

  const handleQueue = () => {
    if (decision.recommendation !== 'submit' && decision.recommendation !== 'consider') return;
    addToSubmissionQueue({
      gradingId: result.id,
      cardId: result.cardId,
      cardName: decision.displayName,
      imageUrl: result.imageUrl,
      action: decision.recommendation,
      psaRangeLabel: decision.psaRangeLabel || 'PSA estimate',
      expectedUpside: decision.economics?.expectedUpside ?? null,
    });
    setInQueue(true);
    onQueueChange?.();
  };

  const applyLooksRight = (defect: string) => {
    setDisputes((prev) => disputeDefect(prev, defect, 'looks-right'));
    setReasonFor(null);
    void submitGradingFeedback({
      gradingId: result.id,
      cardId: result.cardId,
      cardName: result.cardName,
      finishType: result.finishType,
      predictedDefect: defect,
      predictedCategory: category,
      verdict: 'looks-right',
    });
  };

  const applyNotDamage = (defect: string, reason?: DisputeReason) => {
    if (!reason) {
      setReasonFor(defect);
      return;
    }
    setDisputes((prev) => disputeDefect(prev, defect, 'not-damage', reason));
    setReasonFor(null);
    void submitGradingFeedback({
      gradingId: result.id,
      cardId: result.cardId,
      cardName: result.cardName,
      finishType: result.finishType,
      predictedDefect: defect,
      predictedCategory: category,
      verdict: 'not-damage',
      reason,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease }}
      className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface-raised shadow-elevated"
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(280px,1.15fr)_minmax(300px,0.85fr)]">
        <div className="border-b border-border-subtle p-4 sm:p-6 lg:border-b-0 lg:border-r">
          <InspectCanvas
            result={result}
            side={side}
            onSideChange={setSide}
            highlight={evidence?.location ?? null}
            highlightLabel={
              selectedDefect
                ? `${selectedDefect}${limiter?.original === selectedDefect ? ' — this is why the grade cannot go higher.' : ''}`
                : null
            }
            wearMarks={wearMarks}
            showWearMarks={showWearMarks}
            onToggleWearMarks={() => setShowWearMarks((v) => !v)}
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-5 p-4 sm:p-6 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-h2 text-ink-primary">{decision.displayName}</h2>
              {unidentified && onIdentifyCard && (
                <button
                  type="button"
                  onClick={() => onIdentifyCard(result)}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-sm font-medium text-foil hover:text-ink-primary"
                >
                  <Search className="h-3.5 w-3.5" />
                  Identify
                </button>
              )}
            </div>
            <p className="mt-4 font-display text-[2.75rem] font-semibold leading-none tracking-tight tabular-nums text-ink-primary">
              {decision.psaRangeLabel ?? 'No PSA estimate'}
            </p>
            <p className="mt-2 text-sm text-ink-secondary">
              {decision.marketplaceLabel}
              {decision.psaRangeLabel
                ? ' · predicted from these photos'
                : decision.refuseReason
                  ? ` · ${decision.refuseReason}`
                  : ''}
            </p>
          </div>

          {unidentified && (
            <div className="rounded-xl border border-accent/25 bg-accent/10 p-3">
              <p className="text-sm font-medium text-ink-primary">Name this card to unlock comps</p>
              <p className="mt-1 text-sm text-ink-secondary">
                Marketplace condition does not need a name. A PSA submission decision does.
              </p>
            </div>
          )}

          {(result.retakeRecommended ||
            result.surfaceRetakeRecommended ||
            result.quality?.surfaceMessage) && (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3">
              <div className="flex gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <p className="text-sm leading-relaxed text-ink-secondary">
                  {result.quality?.surfaceMessage ||
                    result.limitations ||
                    'Photo quality is too low for a reliable estimate. Retake unsleeved on a solid background with sharper focus.'}
                </p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border-subtle bg-surface-inset/40 p-4">
            <p className="font-display text-lg font-semibold text-ink-primary">
              {decision.recommendationTitle}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
              {decision.recommendationBody}
            </p>
            {decision.userAdjusted && (
              <p className="mt-2 text-sm text-amber-200/90">
                User-adjusted view — you marked a detection as not damage. The model estimate is
                unchanged and this click is stored as training evidence, not a new official grade.
              </p>
            )}
          </div>

          {result.psaDistribution &&
            result.psaDistribution.length > 0 &&
            decision.psaEstimateAllowed && (
              <div className="flex flex-wrap gap-1.5">
                {result.psaDistribution.map((bin) => (
                  <span
                    key={bin.grade}
                    className="rounded-full border border-border-subtle px-2 py-0.5 text-xs text-ink-secondary"
                  >
                    PSA {bin.grade}: {bin.pct}%
                  </span>
                ))}
              </div>
            )}

          <div>
            <p className="text-sm leading-relaxed text-ink-secondary">{decision.why}</p>
            {decision.counterfactual && (
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {decision.counterfactual}
              </p>
            )}
            {centeringNote && <p className="mt-2 text-sm text-ink-muted">{centeringNote.text}.</p>}
            <p className="mt-2 text-sm text-ink-muted">{decision.confidenceReason}</p>
            {decision.refuseReason && !result.retakeRecommended && (
              <p className="mt-2 text-sm text-ink-muted">{decision.refuseReason}</p>
            )}
          </div>

          {visibleImpacts.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink-primary">What hurt this copy</h3>
              <ul className="space-y-2">
                {visibleImpacts.map((row, index) => {
                  const active = selectedDefect === row.original;
                  const canDispute = index === 0 && Boolean(row.original);
                  const dispute = disputes.find((d) => d.defect === row.original);
                  return (
                    <li key={row.original || row.text}>
                      <button
                        type="button"
                        onClick={() => {
                          if (row.original) {
                            setCategory(row.category);
                            selectDefect(row.original, row.category);
                          }
                        }}
                        className={`flex w-full cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                          active
                            ? 'border-amber-400/40 bg-amber-400/10'
                            : 'border-border-subtle hover:border-border-default'
                        }`}
                      >
                        <span
                          className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${LEVEL_CLASS[row.level]}`}
                        >
                          {LEVEL_LABEL[row.level]}
                        </span>
                        <span className="text-sm text-ink-primary">{row.text}</span>
                      </button>
                      {canDispute && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
                          <span className="text-xs text-ink-muted">Is this actually damage?</span>
                          <button
                            type="button"
                            className={`rounded-lg border px-2 py-0.5 text-xs ${
                              dispute?.verdict === 'looks-right'
                                ? 'border-gain/40 bg-gain/10 text-gain'
                                : 'border-border-subtle text-ink-secondary hover:text-ink-primary'
                            }`}
                            onClick={() => applyLooksRight(row.original)}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className={`rounded-lg border px-2 py-0.5 text-xs ${
                              dispute?.verdict === 'not-damage'
                                ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                                : 'border-border-subtle text-ink-secondary hover:text-ink-primary'
                            }`}
                            onClick={() => applyNotDamage(row.original)}
                          >
                            No
                          </button>
                          {reasonFor === row.original && (
                            <span className="flex flex-wrap gap-1">
                              {REASONS.map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  className="rounded-lg border border-border-subtle px-2 py-0.5 text-xs text-ink-secondary hover:text-ink-primary"
                                  onClick={() => applyNotDamage(row.original, r.id)}
                                >
                                  {r.label}
                                </button>
                              ))}
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {(decision.identified || marketLoading) && (
            <EconomicsBlock decision={decision} loading={Boolean(marketLoading)} />
          )}

          <div className="flex flex-wrap gap-2">
            {primaryIsRetake && (
              <button type="button" onClick={onRetake} className="btn-primary">
                <Camera className="h-4 w-4" />
                Retake photos
              </button>
            )}
            {primaryIsIdentify && (
              <button
                type="button"
                onClick={() => onIdentifyCard?.(result)}
                className="btn-primary"
              >
                <Search className="h-4 w-4" />
                Identify card
              </button>
            )}
            <button type="button" onClick={() => void handleCopy()} className="btn-secondary">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy listing notes'}
            </button>
            {onAddToVault && !primaryIsRetake && (
              <button
                type="button"
                onClick={() => onAddToVault(result)}
                className={
                  primaryIsIdentify || decision.recommendation === 'list'
                    ? 'btn-secondary'
                    : 'btn-primary'
                }
              >
                <Vault className="h-4 w-4" />
                {vaultLabel}
              </button>
            )}
            {(decision.recommendation === 'submit' || decision.recommendation === 'consider') && (
              <button
                type="button"
                onClick={handleQueue}
                disabled={inQueue}
                className="btn-secondary"
              >
                <ListPlus className="h-4 w-4" />
                {inQueue ? 'In submission queue' : 'Add to submission queue'}
              </button>
            )}
            {onGradeAnother && (
              <button type="button" onClick={onGradeAnother} className="btn-secondary">
                <RefreshCw className="h-4 w-4" />
                Grade another
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className="btn-ghost"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
              >
                <MoreHorizontal className="h-4 w-4" />
                More
              </button>
              {moreOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-xl border border-border-subtle bg-surface-overlay p-1 shadow-elevated"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
                    onClick={() => {
                      void handleShare();
                      setMoreOpen(false);
                    }}
                  >
                    <Share2 className="h-4 w-4" />
                    Share notes
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
                    onClick={() => {
                      void handleFlag();
                      setMoreOpen(false);
                    }}
                  >
                    <Flag className="h-4 w-4" />
                    Flag detection
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-ink-secondary hover:text-ink-primary"
              aria-expanded={advancedOpen}
            >
              Advanced details
              <ChevronDown
                className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {advancedOpen && (
              <div className="mt-3 space-y-4">
                <p className="text-xs text-ink-muted">
                  Model output {formatScore(result.grade)}/10
                  {result.gradeLabel ? ` · ${result.gradeLabel}` : ''} — not a professional grade.
                </p>
                <MeasurementDetails result={result} />
                <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
                  {rows.map((row) => {
                    const active = row.key === category;
                    return (
                      <li key={row.key}>
                        <button
                          type="button"
                          onClick={() => selectCategory(row.key)}
                          className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                            active ? 'bg-surface-overlay' : 'hover:bg-surface-inset/50'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-ink-primary">
                                {row.label}
                              </span>
                              {row.limiting && (
                                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                                  Limiting
                                </span>
                              )}
                              {row.confidenceBand && (
                                <span className="text-[10px] uppercase tracking-wide text-ink-muted">
                                  {row.confidenceBand}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-sm text-ink-muted">{row.summary}</p>
                          </div>
                          <span
                            className={`font-mono text-sm tabular-nums ${
                              row.withheld ? 'text-ink-muted' : wearTextClass(row.score)
                            }`}
                          >
                            {row.withheld
                              ? row.scoreLow != null && row.scoreHigh != null
                                ? `${row.scoreLow}–${row.scoreHigh}`
                                : 'Unknown'
                              : formatScore(row.score)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <GradingReport
                  result={result}
                  side={side}
                  category={category}
                  selectedDefect={selectedDefect}
                  onSelectDefect={selectDefect}
                />
              </div>
            )}
          </div>

          {result.limitations && <p className="text-sm text-ink-muted">{result.limitations}</p>}
        </aside>
      </div>
    </motion.div>
  );
};

function multiFrameCaption(result: GradingResult): string | null {
  const mf = result.multiFrame;
  if (typeof mf?.message === 'string' && mf.message) return mf.message;
  const front = mf?.front as { message?: string } | undefined;
  if (typeof front?.message === 'string' && front.message) return front.message;
  if (result.frameCount && result.frameCount > 2) {
    return `Surface inspected across ${result.frameCount} frames.`;
  }
  if (result.scanMode === 'precision') {
    return 'Extra lighting angles were used on this older scan.';
  }
  return null;
}

function MeasurementDetails({ result }: { result: GradingResult }) {
  const tcg = result.tcgScore;
  const mm = result.centering?.deviations?.mm;
  const edgeProfiles = (result.edges?.deviations?.profiles ??
    (result.front?.edges as { deviations?: { profiles?: Record<string, unknown> } } | undefined)
      ?.deviations?.profiles) as
    | {
        left?: { coverage: number; maxDefectLengthMm: number };
        right?: { coverage: number; maxDefectLengthMm: number };
        top?: { coverage: number; maxDefectLengthMm: number };
        bottom?: { coverage: number; maxDefectLengthMm: number };
        summary?: { affectedEdges: number; worstCoverage: number; worstLengthMm: number };
      }
    | undefined;
  const corners = (result.corners?.deviations?.geometry ??
    (result.front?.corners as { deviations?: { geometry?: unknown } } | undefined)?.deviations
      ?.geometry) as
    | Array<{
        name: string;
        whiteningAreaMm2: number;
        maxRecessionMm: number;
        contourIntegrity: number;
      }>
    | undefined;
  const caption = multiFrameCaption(result);
  const cats = tcg?.categories || {};

  return (
    <div className="space-y-3 rounded-xl border border-border-subtle p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          TCGTracker condition score
        </p>
        <span className="text-xs text-ink-muted">Internal score</span>
      </div>
      {tcg ? (
        <>
          <p className="font-mono text-lg tabular-nums text-ink-primary">
            {tcg.overall} <span className="text-sm text-ink-muted">/ 1000</span>
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-secondary">
            {(['centering', 'corners', 'edges', 'surface'] as const).map((key) => (
              <li key={key} className="flex justify-between gap-2">
                <span className="capitalize">{key}</span>
                <span className="font-mono tabular-nums">
                  {cats[key] == null ? '—' : cats[key]}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">
            Internal measurement. The PSA range above is a translation of this score, not an average
            of the four categories.
          </p>
        </>
      ) : (
        <p className="text-xs text-ink-muted">Condition points were not stored for this scan.</p>
      )}
      {caption && <p className="text-xs text-ink-secondary">{caption}</p>}
      {mm && (
        <p className="text-xs text-ink-secondary">
          Centering {mm.leftRight} L/R, {mm.topBottom} T/B ({mm.leftMm.toFixed(2)} /{' '}
          {mm.rightMm.toFixed(2)} mm,
          {mm.topMm.toFixed(2)} / {mm.bottomMm.toFixed(2)} mm).
        </p>
      )}
      {edgeProfiles?.summary && (
        <p className="text-xs text-ink-secondary">
          Edges: {edgeProfiles.summary.affectedEdges} sides with whitening, longest run{' '}
          {edgeProfiles.summary.worstLengthMm} mm, coverage{' '}
          {Math.round(edgeProfiles.summary.worstCoverage * 100)}% on the worst side.
        </p>
      )}
      {corners && corners.length > 0 && (
        <p className="text-xs text-ink-secondary">
          Corners:{' '}
          {corners
            .map(
              (c) =>
                `${c.name.replace('-', ' ')} ${c.whiteningAreaMm2.toFixed(1)} mm², recession ${c.maxRecessionMm.toFixed(2)} mm`
            )
            .join(' · ')}
        </p>
      )}
    </div>
  );
}

function EconomicsBlock({
  decision,
  loading,
}: {
  decision: ReturnType<typeof buildGradeDecision>;
  loading: boolean;
}) {
  const e = decision.economics;
  if (loading && !e?.raw && !e?.psa10) {
    return <p className="text-sm text-ink-muted">Loading live PSA comps…</p>;
  }
  if (!e) return null;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-inset/40 p-3">
      <p className="text-sm font-medium text-ink-primary">Should I grade this copy?</p>
      {decision.showDistribution && e.spread9to10 != null && e.spread9to10 >= 400 && (
        <p className="mt-1 text-sm text-ink-secondary">
          This card has a {formatCurrency(e.spread9to10)} gap between PSA 9 and PSA 10. Surface
          condition is therefore especially important.
        </p>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
        {e.raw != null && (
          <>
            <dt className="text-ink-muted">Raw (NM comps)</dt>
            <dd className="font-mono tabular-nums text-ink-primary">{formatCurrency(e.raw)}</dd>
          </>
        )}
        {e.psa8 != null && (
          <>
            <dt className="text-ink-muted">PSA 8</dt>
            <dd className="font-mono tabular-nums text-ink-primary">{formatCurrency(e.psa8)}</dd>
          </>
        )}
        {e.psa9 != null && (
          <>
            <dt className="text-ink-muted">PSA 9</dt>
            <dd className="font-mono tabular-nums text-ink-primary">{formatCurrency(e.psa9)}</dd>
          </>
        )}
        {e.psa10 != null && (
          <>
            <dt className="text-ink-muted">PSA 10</dt>
            <dd className="font-mono tabular-nums text-ink-primary">{formatCurrency(e.psa10)}</dd>
          </>
        )}
        <dt className="text-ink-muted">Grading fee</dt>
        <dd className="font-mono tabular-nums text-ink-primary">
          {formatCurrency(e.fee)} {e.feeTier}
        </dd>
        {e.expectedSlab != null && (
          <>
            <dt className="text-ink-muted">Expected slab</dt>
            <dd className="font-mono tabular-nums text-ink-primary">
              {formatCurrency(e.expectedSlab)}
            </dd>
          </>
        )}
        {e.expectedUpside != null && (
          <>
            <dt className="text-ink-muted">Expected upside after fee</dt>
            <dd className="font-mono tabular-nums text-ink-primary">
              {formatCurrency(e.expectedUpside, { signed: true })}
            </dd>
          </>
        )}
      </dl>
      {decision.showDistribution && e.distribution && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
            Condition-adjusted PSA mass
          </p>
          <ul className="space-y-1">
            {e.distribution.map((row) => (
              <li key={row.grade} className="flex items-center gap-2 text-sm">
                <span className="w-14 text-ink-muted">PSA {row.grade}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-inset">
                  <span
                    className="block h-full rounded-full bg-foil/70"
                    style={{ width: `${row.pct}%` }}
                  />
                </span>
                <span className="w-10 text-right font-mono tabular-nums text-ink-secondary">
                  {row.pct}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
