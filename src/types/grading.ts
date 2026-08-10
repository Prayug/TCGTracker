export interface CropImage {
  label: string;
  image: string;
  location?: { x: number; y: number; width: number; height: number };
}

export interface CenteringDetails {
  /** PSA-style 1.0–10.0 half-point score */
  score: number;
  details: string;
  deviations: { leftRight: number; topBottom: number };
  defects?: string[];
  crops?: CropImage[];
}

export interface CornerDetail {
  name: string;
  /** PSA-style 1.0–10.0 */
  fray: number;
  fill: number;
  angle: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface CategoryDetails {
  /** PSA-style 1.0–10.0 half-point score */
  score: number;
  details: string;
  defects: string[];
  crops?: CropImage[];
  deviations?: Record<string, unknown>;
}

export interface DefectRegion {
  category: 'centering' | 'corners' | 'edges' | 'surface';
  side?: 'front' | 'back';
  label: string;
  severity: 'minor' | 'moderate' | 'severe';
  cropImage: string;
  location?: { x: number; y: number; width: number; height: number };
}

export interface SideGrading {
  centering: CenteringDetails;
  corners: CategoryDetails;
  edges: CategoryDetails;
  surface: CategoryDetails;
}

export interface GradingResult {
  id: string;
  cardId: string;
  cardName: string;
  game: 'pokemon' | 'onepiece';
  centering: CenteringDetails;
  corners: CategoryDetails;
  edges: CategoryDetails;
  surface: CategoryDetails;
  /** grade * 100 (e.g. 9.5 → 950) */
  totalScore: number;
  /** PSA-style 1.0–10.0 */
  grade: number;
  gradeLabel: string;
  imageUrl: string;
  backImageUrl?: string;
  timestamp: string;
  estimatedGradedValue?: number;
  suggestedCondition?: string;
  defectRegions?: DefectRegion[];
  /** Full front/back data from Python backend */
  front?: SideGrading;
  back?: SideGrading;
  /** 0–1 pipeline confidence */
  confidence?: number;
  retakeRecommended?: boolean;
  limitations?: string;
  quality?: { ok?: boolean; metrics?: Record<string, number>; code?: string; message?: string };
  extraction?: {
    found?: boolean;
    method?: string;
    confidence?: number;
    overlay?: string;
    tiltDeg?: number;
  };
  provider?: {
    onnxRuntime?: boolean;
    usingHeuristics?: boolean;
    models?: Record<string, boolean>;
  };
}

export interface GradingStats {
  total: number;
  avgGrade: number | null;
  avgTotalScore: number | null;
  bestScore: number | null;
  worstScore: number | null;
  distribution: Array<{ gradeLabel: string; count: number }>;
}

/** Multipliers used to estimate slab value from raw market price. */
export const GRADE_VALUE_MULTIPLIERS: Record<number, number> = {
  10: 3.5,
  9.5: 3.0,
  9: 2.5,
  8.5: 2.0,
  8: 1.75,
  7.5: 1.5,
  7: 1.3,
  6.5: 1.15,
  6: 1.1,
  5.5: 1.05,
  5: 1.0,
  4.5: 0.9,
  4: 0.85,
  3.5: 0.75,
  3: 0.7,
  2.5: 0.6,
  2: 0.5,
  1.5: 0.4,
  1: 0.35,
};

export function gradeToVaultCondition(grade: number): import('./pokemon').CardCondition {
  if (grade >= 9) return 'near-mint';
  if (grade >= 7) return 'lightly-played';
  if (grade >= 5) return 'moderately-played';
  if (grade >= 3) return 'heavily-played';
  return 'damaged';
}

export function gradeBadgeColor(grade: number): string {
  if (grade >= 10) return 'bg-amber-400/15 text-amber-200 border-amber-400/40';
  if (grade >= 9) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
  if (grade >= 8) return 'bg-sky-500/15 text-sky-300 border-sky-500/40';
  if (grade >= 7) return 'bg-blue-500/15 text-blue-300 border-blue-500/40';
  if (grade >= 6) return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40';
  if (grade >= 5) return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40';
  if (grade >= 3) return 'bg-orange-500/15 text-orange-300 border-orange-500/40';
  return 'bg-red-500/15 text-red-300 border-red-500/40';
}

/** Hex color of the grade band (used by grade medals, chips, and glows). */
export function gradeHex(grade: number): string {
  if (grade >= 10) return '#fbbf24';
  if (grade >= 9) return '#34d399';
  if (grade >= 8) return '#38bdf8';
  if (grade >= 7) return '#60a5fa';
  if (grade >= 6) return '#818cf8';
  if (grade >= 5) return '#facc15';
  if (grade >= 3) return '#fb923c';
  return '#f87171';
}

/** Tailwind text-color class for the grade band. */
export function gradeTextClass(grade: number): string {
  if (grade >= 10) return 'text-amber-300';
  if (grade >= 9) return 'text-emerald-300';
  if (grade >= 8) return 'text-sky-300';
  if (grade >= 7) return 'text-blue-300';
  if (grade >= 6) return 'text-indigo-300';
  if (grade >= 5) return 'text-yellow-300';
  if (grade >= 3) return 'text-orange-300';
  return 'text-red-300';
}

/**
 * Normalize legacy TAG-style scores (0–250) to PSA-style (1–10).
 * Call this when rendering gauge values from stored history.
 */
export function normalizeScore(score: number): number {
  if (score > 10 || score > 100) {
    // Legacy TAG: 0–250 scale → divide by 25
    if (score <= 250) return Math.round((score / 25) * 10) / 10;
    // TAG 0–1000 → divide by 100
    return Math.round((score / 100) * 10) / 10;
  }
  return score;
}
