import axios from 'axios';
import { buildApiUrl } from '../config/env';
import {
  GRADE_VALUE_MULTIPLIERS,
  GradingResult,
  GradingStats,
  gradeToVaultCondition,
} from '../types/grading';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const HISTORY_KEY = 'tcg_grading_history';

const SCANNER_BASE =
  import.meta.env.VITE_CARD_SCANNER_API_URL || 'http://localhost:5001';

const client = axios.create({
  withCredentials: true,
  timeout: 60_000,
});

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Unsupported file type: ${file.type}. Allowed: JPEG, PNG, WebP.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 10MB.`;
  }
  return null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function persistLocal(result: GradingResult): void {
  try {
    const existing = loadLocalHistory();
    existing.unshift(result);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(existing.slice(0, 100)));
  } catch {
    // ignore quota errors
  }
}

function loadLocalHistory(cardId?: string): GradingResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const all: GradingResult[] = raw ? JSON.parse(raw) : [];
    if (cardId) return all.filter((r) => r.cardId === cardId);
    return all;
  } catch {
    return [];
  }
}

export function calculateGradedValue(rawPrice: number, grade: number): number {
  if (!rawPrice || rawPrice <= 0) return 0;
  const mult = GRADE_VALUE_MULTIPLIERS[grade] ?? GRADE_VALUE_MULTIPLIERS[Math.round(grade)] ?? 1;
  return Math.round(rawPrice * mult * 100) / 100;
}

export function calculateGradingUplift(rawPrice: number, grade: number): number {
  const graded = calculateGradedValue(rawPrice, grade);
  return Math.round((graded - rawPrice) * 100) / 100;
}

export async function checkGradingBackendHealth(): Promise<boolean> {
  // Prefer Node proxy so the browser stays on same-origin (CSP connect-src 'self').
  try {
    const res = await client.get(buildApiUrl('/api/grading/health'), { timeout: 4000 });
    const status = res.data?.data?.status ?? res.data?.status;
    if (status === 'ok') return true;
  } catch {
    // fall through to direct scanner check (local only; may be CSP-blocked)
  }

  try {
    const res = await axios.get(`${SCANNER_BASE}/health`, { timeout: 4000 });
    return res.data?.status === 'ok';
  } catch {
    return false;
  }
}

export interface GradeCardOptions {
  cardId?: string;
  cardName?: string;
  game?: 'pokemon' | 'onepiece';
  rawPrice?: number;
  imageUrl?: string;
  backImage?: File | string;
}

function normalizeGradingResult(grading: GradingResult): GradingResult {
  const front = grading.front;
  return {
    ...grading,
    centering: grading.centering ?? front?.centering ?? {
      score: 0,
      details: '',
      deviations: { leftRight: 0, topBottom: 0 },
      defects: [],
    },
    corners: grading.corners ?? front?.corners ?? { score: 0, details: '', defects: [] },
    edges: grading.edges ?? front?.edges ?? { score: 0, details: '', defects: [] },
    surface: grading.surface ?? front?.surface ?? { score: 0, details: '', defects: [] },
  };
}

/** Legacy TAG score detection: if a stored category score is > 10, treat as old TAG. */
function hasLegacyScores(result: GradingResult): boolean {
  const cats = [result.centering, result.corners, result.edges, result.surface];
  return cats.some((c) => c?.score > 10);
}

/** Normalize legacy TAG scores in-place for display */
function normalizeLegacyResult(result: GradingResult): GradingResult {
  if (!hasLegacyScores(result)) return result;
  const divisor = result.centering?.score > 100 ? 100 : 25;
  const norm = (v: number | undefined) => (v != null && v > 10 ? Math.round((v / divisor) * 10) / 10 : v ?? 0);
  return {
    ...result,
    centering: { ...result.centering, score: norm(result.centering?.score) },
    corners: { ...result.corners, score: norm(result.corners?.score) },
    edges: { ...result.edges, score: norm(result.edges?.score) },
    surface: { ...result.surface, score: norm(result.surface?.score) },
  };
}

/**
 * Grade a card image. Prefers Node `/api/grading/analyze` (persists to SQLite),
 * falls back to Flask `/api/grade-card` + localStorage.
 */
export async function gradeCard(
  image: File | string,
  options: GradeCardOptions = {}
): Promise<GradingResult> {
  let base64: string;
  let previewUrl = options.imageUrl || '';
  let backBase64: string | undefined;

  if (typeof image === 'string') {
    base64 = image;
    if (!previewUrl && image.startsWith('data:')) previewUrl = image;
  } else {
    const err = validateFile(image);
    if (err) throw new Error(err);
    base64 = await fileToBase64(image);
    previewUrl = previewUrl || URL.createObjectURL(image);
  }

  // Encode back image if provided
  if (options.backImage) {
    if (typeof options.backImage === 'string') {
      backBase64 = options.backImage;
    } else {
      backBase64 = await fileToBase64(options.backImage);
    }
  }

  const payload: Record<string, unknown> = {
    image: base64,
    backImage: backBase64,
    cardId: options.cardId,
    cardName: options.cardName,
    game: options.game || 'pokemon',
    rawPrice: options.rawPrice,
    imageUrl: options.imageUrl,
  };

  // Prefer Node proxy (stores result)
  try {
    const res = await client.post(buildApiUrl('/api/grading/analyze'), payload);
    const grading = (res.data?.data?.grading || res.data?.grading) as GradingResult;
    if (grading) {
      const withImage = normalizeLegacyResult(normalizeGradingResult({
        ...grading,
        imageUrl: grading.imageUrl || previewUrl,
        estimatedGradedValue:
          grading.estimatedGradedValue ??
          (options.rawPrice != null
            ? calculateGradedValue(options.rawPrice, grading.grade)
            : undefined),
        suggestedCondition:
          grading.suggestedCondition || gradeToVaultCondition(grading.grade),
      }));
      persistLocal(withImage);
      return withImage;
    }
  } catch (nodeErr: unknown) {
    const ax = nodeErr as {
      response?: { status?: number; data?: { error?: string; code?: string; retakeRecommended?: boolean } };
      message?: string;
    };
    if (ax.response?.status === 422) {
      const msg = ax.response.data?.error || 'Photo quality check failed — please retake.';
      throw new Error(msg);
    }
    console.warn('Node grading proxy unavailable, trying Flask directly', nodeErr);
  }

  // Fallback: Flask CV service
  const flask = await axios.post(
    `${SCANNER_BASE}/api/grade-card`,
    payload,
    { timeout: 60_000, headers: { 'Content-Type': 'application/json' } }
  );

  if (!flask.data?.success || !flask.data?.grading) {
    throw new Error(flask.data?.error || 'Grading failed');
  }

  const grading = normalizeLegacyResult(normalizeGradingResult({
    ...flask.data.grading,
    imageUrl: flask.data.grading.imageUrl || previewUrl,
    estimatedGradedValue:
      flask.data.grading.estimatedGradedValue ??
      (options.rawPrice != null
        ? calculateGradedValue(options.rawPrice, flask.data.grading.grade)
        : undefined),
    suggestedCondition:
      flask.data.grading.suggestedCondition ||
      gradeToVaultCondition(flask.data.grading.grade),
  }));
  persistLocal(grading);
  return grading;
}

export async function getGradingHistory(cardId?: string): Promise<GradingResult[]> {
  try {
    const url = cardId
      ? buildApiUrl(`/api/grading/history/${encodeURIComponent(cardId)}`)
      : buildApiUrl('/api/grading/history');
    const res = await client.get(url);
    const history = (res.data?.data?.history || res.data?.history || []) as GradingResult[];
    if (history.length > 0) return history.map((h) => normalizeLegacyResult(normalizeGradingResult(h)));
  } catch {
    // fall through to local
  }
  return loadLocalHistory(cardId).map((h) => normalizeLegacyResult(normalizeGradingResult(h)));
}

export async function getGradingStats(): Promise<GradingStats | null> {
  try {
    const res = await client.get(buildApiUrl('/api/grading/stats'));
    return (res.data?.data?.stats || res.data?.stats || null) as GradingStats | null;
  } catch {
    const local = loadLocalHistory();
    if (local.length === 0) return null;
    const avgGrade = local.reduce((s, r) => s + r.grade, 0) / local.length;
    const avgTotal = local.reduce((s, r) => s + r.totalScore, 0) / local.length;
    const distMap = new Map<string, number>();
    for (const r of local) {
      distMap.set(r.gradeLabel, (distMap.get(r.gradeLabel) || 0) + 1);
    }
    return {
      total: local.length,
      avgGrade: Math.round(avgGrade * 10) / 10,
      avgTotalScore: Math.round(avgTotal),
      bestScore: Math.max(...local.map((r) => r.totalScore)),
      worstScore: Math.min(...local.map((r) => r.totalScore)),
      distribution: [...distMap.entries()].map(([gradeLabel, count]) => ({ gradeLabel, count })),
    };
  }
}

export const gradingService = {
  gradeCard,
  getGradingHistory,
  getGradingStats,
  calculateGradedValue,
  calculateGradingUplift,
  checkGradingBackendHealth,
  gradeToVaultCondition,
};
