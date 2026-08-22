import {
  CategoryDetails,
  CornerDetail,
  CropImage,
  DefectRegion,
  GradingResult,
  SideGrading,
  gradeToVaultCondition,
  normalizeScore,
} from '../../types/grading';

export type CategoryKey = 'centering' | 'corners' | 'edges' | 'surface';

export type DefectBox = { x: number; y: number; width: number; height: number };

export const CATEGORY_KEYS: CategoryKey[] = ['centering', 'corners', 'edges', 'surface'];

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  centering: 'Centering',
  corners: 'Corners',
  edges: 'Edges',
  surface: 'Surface',
};

const PLACEHOLDER_NAMES = new Set(['graded card', 'unknown card', 'card', 'unidentified card']);

const SPECIALIST_JARGON =
  /specialist model|scratch index|hotspot|crease severity|continuity avg|corner condition avg|surface uniformity|worst axis/i;

const PROOF_CROP = /proof|full card|heatmap|detected crease|fold lines|centering proof/i;

const DEFECT_CROP = /defect|whiten|crease|scratch|scuff|wear|damage|chip|tear|fold/i;

export function isUnidentifiedCard(name?: string | null): boolean {
  const trimmed = name?.trim() ?? '';
  if (trimmed.length < 2) return true;
  return PLACEHOLDER_NAMES.has(trimmed.toLowerCase());
}

export function displayCardName(name?: string | null): string {
  return isUnidentifiedCard(name) ? 'Unidentified card' : name!.trim();
}

/** Five-step wear scale — scores and overall grade share this. */
export function wearHex(score: number | null | undefined): string {
  if (score == null) return '#94a3b8';
  const n = normalizeScore(score);
  if (n >= 10) return '#fbbf24';
  if (n >= 9) return '#34d399';
  if (n >= 8) return '#7dd3fc';
  if (n >= 6) return '#fbbf24';
  if (n >= 4) return '#fb923c';
  return '#f87171';
}

export function wearTextClass(score: number | null | undefined): string {
  if (score == null) return 'text-ink-muted';
  const n = normalizeScore(score);
  if (n >= 10) return 'text-amber-300';
  if (n >= 9) return 'text-gain';
  if (n >= 8) return 'text-sky-300';
  if (n >= 6) return 'text-amber-300';
  if (n >= 4) return 'text-orange-300';
  return 'text-red-300';
}

export function formatScore(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return '—';
  const n = normalizeScore(score);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function formatVaultCondition(result: GradingResult): string {
  const raw = result.suggestedCondition || gradeToVaultCondition(result.grade);
  return raw.replace(/-/g, ' ');
}

export function emptyCategory(): CategoryDetails {
  return { score: 0, details: '', defects: [] };
}

export function sideData(result: GradingResult, side: 'front' | 'back'): SideGrading | undefined {
  if (side === 'back') return result.back;
  return (
    result.front || {
      centering: result.centering,
      corners: result.corners,
      edges: result.edges,
      surface: result.surface,
    }
  );
}

export function categoryFromResult(result: GradingResult, key: CategoryKey): CategoryDetails {
  const top = result[key];
  if (top && (typeof top.score === 'number' || top.score === null || 'withheld' in top)) {
    return top as CategoryDetails;
  }
  return (result.front?.[key] as CategoryDetails | undefined) ?? emptyCategory();
}

export type RankedCategory = {
  key: CategoryKey;
  label: string;
  score: number;
  defects: string[];
  summary: string;
  limiting: boolean;
  withheld?: boolean;
  confidenceBand?: 'low' | 'moderate' | 'high';
  scoreLow?: number;
  scoreHigh?: number;
};

export function rankedCategories(result: GradingResult): RankedCategory[] {
  const limitingKey = limitingCategoryKey(result);
  return CATEGORY_KEYS.map((key) => {
    const data = categoryFromResult(result, key);
    const withheld = Boolean(data.withheld || data.score == null);
    return {
      key,
      label: CATEGORY_LABEL[key],
      score: withheld ? 99 : normalizeScore(data.score ?? 0),
      defects: withheld ? [] : data.defects || [],
      summary: withheld
        ? data.withheldReason || 'Not scored from this photo'
        : categorySummary(key, data),
      limiting: !withheld && key === limitingKey,
      withheld,
      confidenceBand: data.confidenceBand,
      scoreLow: data.scoreLow,
      scoreHigh: data.scoreHigh,
    };
  }).sort((a, b) => {
    if (a.withheld !== b.withheld) return a.withheld ? 1 : -1;
    return a.score - b.score || Number(b.limiting) - Number(a.limiting);
  });
}

function defectSeverity(data: CategoryDetails): number {
  const text = `${(data.defects || []).join(' ')} ${data.details || ''}`.toLowerCase();
  if (/crease|fold|tear|hole/.test(text)) return 4;
  if (/severe|major/.test(text)) return 3;
  if (/heavy/.test(text)) return 2;
  if ((data.defects || []).length > 0) return 1;
  return 0;
}

export function limitingCategoryKey(result: GradingResult): CategoryKey {
  let worst: CategoryKey = 'corners';
  let worstScore = Infinity;
  let worstSeverity = -1;
  let found = false;
  for (const key of CATEGORY_KEYS) {
    const data = categoryFromResult(result, key);
    if (data.withheld || data.score == null) continue;
    found = true;
    const score = normalizeScore(data.score);
    const severity = defectSeverity(data);
    if (score < worstScore || (score === worstScore && severity > worstSeverity)) {
      worstScore = score;
      worstSeverity = severity;
      worst = key;
    }
  }
  return found ? worst : 'surface';
}

export function whyThisGrade(result: GradingResult): string {
  const rows = rankedCategories(result);
  const limiting = rows[0];
  const centering = rows.find((r) => r.key === 'centering');
  if (!limiting) return `Estimated ${formatScore(result.grade)} · ${result.gradeLabel}.`;

  if (limiting.score >= 8.5 && limiting.defects.length === 0) {
    return `No major issues detected. Estimated ${formatScore(result.grade)} · ${result.gradeLabel}.`;
  }

  const reason = limitingReason(limiting);
  const centeringOk = centering && centering.score >= 8.5 && centering.key !== limiting.key;
  return centeringOk ? `${reason} Centering is fine.` : reason;
}

function limitingReason(row: RankedCategory): string {
  const defect = row.defects[0] || '';
  const d = defect.toLowerCase();
  if (d.includes('crease') || d.includes('fold')) {
    return 'Major crease damage is the limiting factor.';
  }
  if (d.includes('whiten') && row.key === 'corners') {
    return 'Corner whitening is the limiting factor.';
  }
  if (d.includes('whiten') && row.key === 'edges') {
    return 'Edge whitening is the limiting factor.';
  }
  if (d.includes('scratch') || d.includes('scuff')) {
    return 'Surface wear is the limiting factor.';
  }
  if (defect) {
    const cleaned = defect
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(/\.$/, '')
      .trim();
    return `${cleaned} is the limiting factor.`;
  }
  return `${row.label} is the weakest category.`;
}

export function categorySummary(key: CategoryKey, data: CategoryDetails): string {
  if (data.withheld || data.score == null) {
    return data.withheldReason || 'Not scored from this photo';
  }
  const defects = data.defects || [];
  if (defects.length === 0) {
    if (key === 'centering') return 'No centering issues';
    return `No ${key} issues`;
  }
  if (defects.length === 1) return defects[0];
  return defects[0];
}

export function humanCategoryNarrative(key: CategoryKey, data: CategoryDetails): string {
  if (data.withheld || data.score == null) {
    return (
      data.withheldReason || data.details || 'Not scored from this photo. Retake without glare.'
    );
  }
  const defects = data.defects || [];
  const details = (data.details || '').trim();
  if (defects.length === 0) {
    if (key === 'centering') return 'No centering issues.';
    return `No ${key} issues.`;
  }

  if (details && !SPECIALIST_JARGON.test(details) && details.length < 160) {
    return details;
  }

  if (details && SPECIALIST_JARGON.test(details)) {
    const sentences = details.split(/(?<=[.!?])\s+/).filter(Boolean);
    const human = sentences.find((s) => !SPECIALIST_JARGON.test(s) && s.length < 100);
    if (human) return human;
  }

  if (defects.length === 1) return defects[0].replace(/\.$/, '') + '.';
  return `${defects[0].replace(/\.$/, '')} — ${defects.length} issues in this category.`;
}

export function photoQualityCaption(
  confidence?: number,
  retakeRecommended?: boolean,
  surfaceMessage?: string | null
): string | null {
  if (surfaceMessage) return surfaceMessage;
  if (retakeRecommended) {
    return 'Photo quality is too low for a reliable estimate. Retake on a solid background with sharper focus.';
  }
  if (confidence == null) return null;
  if (confidence < 0.5) {
    return 'Photo quality is low. Treat this as a rough listing condition only.';
  }
  if (confidence < 0.8) {
    return 'Photo quality is moderate. Surface findings may include glare or print texture.';
  }
  return 'Photo quality looks good enough for an estimate.';
}

/** Stored value is the larger share (58 → 58/42). Legacy deviations are < 50. */
export function formatCenteringSplit(pct: number): {
  major: number;
  minor: number;
  off: boolean;
  text: string;
} {
  const share = pct < 50 ? Math.round(50 + pct / 2) : Math.round(pct);
  const other = 100 - share;
  const off = share > 55;
  return {
    major: share,
    minor: other,
    off,
    text: off ? `${share}/${other} (off)` : `${share}/${other} (acceptable)`,
  };
}

export function isProofOrDebugCrop(label: string): boolean {
  return PROOF_CROP.test(label);
}

export function isDefectCrop(label: string): boolean {
  if (isProofOrDebugCrop(label)) return false;
  return DEFECT_CROP.test(label);
}

export function selectEvidenceCrops(crops: CropImage[] | undefined, max = 3): CropImage[] {
  if (!crops?.length) return [];
  const defects = crops.filter((c) => isDefectCrop(c.label));
  if (defects.length > 0) return defects.slice(0, max);
  return crops.filter((c) => !isProofOrDebugCrop(c.label)).slice(0, max);
}

function isFullCardBox(box: DefectBox): boolean {
  const area = box.width * box.height;
  return area >= 0.4 || (box.width >= 0.72 && box.height >= 0.72);
}

export function wearMarkBoxes(
  data: CategoryDetails | undefined,
  regions: DefectRegion[] | undefined,
  category: CategoryKey,
  side: 'front' | 'back'
): DefectBox[] {
  const boxes: DefectBox[] = [];
  const push = (box?: DefectBox) => {
    if (!box || isFullCardBox(box)) return;
    boxes.push(box);
  };
  for (const crop of data?.crops || []) {
    if (!crop.location || isProofOrDebugCrop(crop.label)) continue;
    push(crop.location);
  }
  for (const det of data?.detections || []) {
    push(det.location);
  }
  for (const region of regions || []) {
    if (region.category !== category || (region.side && region.side !== side)) continue;
    if (!region.location || isProofOrDebugCrop(region.label)) continue;
    push(region.location);
  }
  return boxes;
}

const LOCATION_HINTS: Array<{ re: RegExp; keys: string[] }> = [
  { re: /top[-\s]?left/, keys: ['top left', 'top-left'] },
  { re: /top[-\s]?right/, keys: ['top right', 'top-right'] },
  { re: /bottom[-\s]?left/, keys: ['bottom left', 'bottom-left'] },
  { re: /bottom[-\s]?right/, keys: ['bottom right', 'bottom-right'] },
  { re: /left edge/, keys: ['left edge', 'left'] },
  { re: /right edge/, keys: ['right edge', 'right'] },
  { re: /top edge/, keys: ['top edge', 'top border'] },
  { re: /bottom edge/, keys: ['bottom edge', 'bottom border'] },
  { re: /crease|fold/, keys: ['crease', 'fold'] },
  { re: /scratch|scuff/, keys: ['scratch', 'scuff'] },
];

export function evidenceForDefect(
  defectText: string,
  category: CategoryKey,
  side: 'front' | 'back',
  data: CategoryDetails,
  regions?: DefectRegion[]
): { location?: DefectBox; crop?: CropImage } {
  const hay = defectText.toLowerCase();
  const hint = LOCATION_HINTS.find((h) => h.re.test(hay));

  const cropMatch = (label: string) => {
    const l = label.toLowerCase();
    if (hint) return hint.keys.some((k) => l.includes(k));
    return isDefectCrop(label);
  };

  const fromCrops = (data.crops || []).filter((c) => cropMatch(c.label));
  const preferredCrop =
    fromCrops.find((c) => isDefectCrop(c.label) && c.location && !isFullCardBox(c.location)) ||
    fromCrops.find((c) => c.location && !isFullCardBox(c.location)) ||
    fromCrops[0];

  const fromDetections = (data.detections || []).filter((d) => {
    const l = (d.label || '').toLowerCase();
    if (hint) return hint.keys.some((k) => l.includes(k) || hay.includes(k));
    return hay.includes(l) || l.includes(hay.slice(0, 24));
  });
  const detLoc = fromDetections.find((d) => d.location && !isFullCardBox(d.location))?.location;

  const fromRegions = (regions || []).filter((r) => {
    if (r.category !== category) return false;
    if (r.side && r.side !== side) return false;
    return cropMatch(r.label) || hay.includes(r.label.toLowerCase());
  });
  const region =
    fromRegions.find((r) => r.location && !isFullCardBox(r.location)) || fromRegions[0];

  return {
    location: detLoc || preferredCrop?.location || region?.location,
    crop:
      preferredCrop ||
      (region
        ? { label: region.label, image: region.cropImage, location: region.location }
        : undefined),
  };
}

export function cornerWearRows(data: CategoryDetails): Array<{ name: string; wear: number }> {
  const details = data.deviations?.cornerDetails as CornerDetail[] | undefined;
  if (!details?.length) return [];
  return details.map((c) => {
    const parts = [c.fray, c.fill].filter((n) => typeof n === 'number' && n >= 0 && n <= 10);
    if (typeof c.angle === 'number' && c.angle >= 0 && c.angle <= 10) parts.push(c.angle);
    const wear = parts.length ? Math.min(...parts) : 0;
    return {
      name: c.name.replace(/-/g, ' '),
      wear: Math.round(wear * 10) / 10,
    };
  });
}

export function psaWorthItCopy(grade: number, identified: boolean): string | null {
  if (!identified) return null;
  if (grade < 7) {
    return 'At this condition, sending the card to PSA is unlikely to add value.';
  }
  if (grade >= 9) {
    return 'This condition is in the range where professional grading can add value — if the card’s market supports it.';
  }
  return 'Borderline for professional grading. Whether it is worth submitting depends on this specific card’s market.';
}
