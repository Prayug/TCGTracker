import { Router, Response } from 'express';
import { z } from 'zod';
import { request as undiciRequest } from 'undici';
import { getDb } from '../db/database';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { ok, fail } from '../utils/apiResponse';
import { logger } from '../utils/logger';
import {
  CREATE_GRADING_RESULTS_SQL,
  GradingResultDTO,
  GradingResultRow,
  rowToGradingResult,
} from '../db/gradingSchema';
import { randomUUID } from 'crypto';

const SCANNER_URL = (process.env.CARD_SCANNER_URL || 'http://localhost:5001').replace(/\/+$/, '');

const analyzeSchema = z.object({
  body: z.object({
    image: z.string().min(1),
    backImage: z.string().optional(),
    cardId: z.string().optional(),
    cardName: z.string().optional(),
    game: z.enum(['pokemon', 'onepiece']).optional(),
    rawPrice: z.number().optional(),
    imageUrl: z.string().optional(),
  }),
});

function ensureTable(): Promise<void> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(CREATE_GRADING_RESULTS_SQL, (err) => {
      if (err) reject(err);
      else {
        db.run(
          'CREATE INDEX IF NOT EXISTS idx_grading_results_card ON grading_results(card_id)',
          () => {
            db.run(
              'CREATE INDEX IF NOT EXISTS idx_grading_results_user ON grading_results(user_id)',
              (e2) => (e2 ? reject(e2) : resolve())
            );
          }
        );
      }
    });
  });
}

async function forwardToPython(body: {
  image: string;
  backImage?: string;
  cardId?: string;
  cardName?: string;
  game?: string;
  rawPrice?: number;
}): Promise<{
  success: boolean;
  grading?: GradingResultDTO & Record<string, unknown>;
  error?: string;
  code?: string;
  retakeRecommended?: boolean;
  statusCode?: number;
}> {
  // Primary path: specialist CV/ML pipeline (not Ollama)
  const res = await undiciRequest(`${SCANNER_URL}/api/grade-card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    headersTimeout: 90_000,
    bodyTimeout: 90_000,
  });

  const data = (await res.body.json()) as {
    success: boolean;
    grading?: GradingResultDTO & Record<string, unknown>;
    error?: string;
    code?: string;
    retakeRecommended?: boolean;
  };
  return { ...data, statusCode: res.statusCode };
}

/** Ensure nested category objects even if upstream returns a partial payload. */
function normalizeCategory(
  cat: unknown,
  fallbackScore = 0
): GradingResultDTO['centering'] | GradingResultDTO['corners'] {
  if (cat && typeof cat === 'object' && 'score' in (cat as object)) {
    const c = cat as Record<string, unknown>;
    return {
      score: Number(c.score ?? fallbackScore),
      details: String(c.details ?? ''),
      deviations: (c.deviations as { leftRight: number; topBottom: number }) || {
        leftRight: 0,
        topBottom: 0,
      },
      defects: Array.isArray(c.defects) ? (c.defects as string[]) : [],
      crops: c.crops as GradingResultDTO['centering']['crops'],
    };
  }
  if (typeof cat === 'number') {
    return {
      score: cat,
      details: '',
      deviations: { leftRight: 0, topBottom: 0 },
      defects: [],
    };
  }
  return {
    score: fallbackScore,
    details: '',
    deviations: { leftRight: 0, topBottom: 0 },
    defects: [],
  };
}

function persistResult(
  grading: GradingResultDTO,
  userId: string | null,
  imageUrl?: string,
  backImageUrl?: string,
  fullResult?: Record<string, unknown>
): Promise<GradingResultDTO> {
  const db = getDb();
  const id = grading.id || `grade-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const defects = JSON.stringify({
    centering: grading.centering?.defects || [],
    corners: grading.corners?.defects || [],
    edges: grading.edges?.defects || [],
    surface: grading.surface?.defects || [],
  });
  const deviations = JSON.stringify(
    grading.centering?.deviations || { leftRight: 0, topBottom: 0 }
  );
  const defectRegions = JSON.stringify(grading.defectRegions || []);
  const fullResultJson = fullResult ? JSON.stringify(fullResult) : null;
  const createdAt = grading.timestamp || new Date().toISOString();

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO grading_results (
        id, user_id, card_id, card_name, game,
        centering_score, corners_score, edges_score, surface_score,
        total_score, grade, grade_label, defects, image_url, estimated_value,
        centering_details, corners_details, edges_details, surface_details,
        deviations, suggested_condition, defect_regions, full_result, back_image_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        grading.cardId || null,
        grading.cardName || 'Unknown Card',
        grading.game || 'pokemon',
        grading.centering?.score ?? 0,
        grading.corners?.score ?? 0,
        grading.edges?.score ?? 0,
        grading.surface?.score ?? 0,
        grading.totalScore,
        grading.grade,
        grading.gradeLabel,
        defects,
        imageUrl || grading.imageUrl || null,
        grading.estimatedGradedValue ?? null,
        grading.centering?.details || null,
        grading.corners?.details || null,
        grading.edges?.details || null,
        grading.surface?.details || null,
        deviations,
        grading.suggestedCondition || null,
        defectRegions,
        fullResultJson,
        backImageUrl || grading.backImageUrl || null,
        createdAt,
      ],
      (err) => {
        if (err) reject(err);
        else
          resolve({
            ...grading,
            id,
            timestamp: createdAt,
            imageUrl: imageUrl || grading.imageUrl || '',
          });
      }
    );
  });
}

const router = Router();

router.get('/health', async (_req, res: Response) => {
  try {
    const upstream = await undiciRequest(`${SCANNER_URL}/health`, {
      method: 'GET',
      headersTimeout: 4_000,
      bodyTimeout: 4_000,
    });
    const data = (await upstream.body.json()) as { status?: string; message?: string };
    const okStatus = upstream.statusCode >= 200 && upstream.statusCode < 300 && data?.status === 'ok';
    if (!okStatus) {
      return fail(res, data?.message || 'Scanner unhealthy', 502);
    }
    ok(res, {
      status: 'ok',
      scanner: data,
      scannerUrl: SCANNER_URL,
    });
  } catch (error: any) {
    logger.warn('Grading scanner health check failed', { error: error?.message, scannerUrl: SCANNER_URL });
    fail(res, error?.message || 'Scanner unreachable', 503);
  }
});

router.post(
  '/analyze',
  optionalAuth,
  validate(analyzeSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      await ensureTable();
      const { image, backImage, cardId, cardName, game, rawPrice, imageUrl } = req.body;

      const python = await forwardToPython({
        image,
        backImage,
        cardId,
        cardName,
        game,
        rawPrice,
      });

      if (!python.success || !python.grading) {
        const status =
          python.statusCode === 422 ? 422 : python.statusCode && python.statusCode >= 400
            ? python.statusCode
            : 502;
        return fail(res, python.error || 'Grading analysis failed', status, {
          code: python.code,
          retakeRecommended: python.retakeRecommended ?? status === 422,
        });
      }

      const userId = req.user ? String(req.user.id) : null;
      const backImageUrl = python.grading?.backImageUrl || '';
      const fullResult = python.grading?.front
        ? {
            front: python.grading.front,
            back: python.grading.back,
            confidence: python.grading.confidence,
            extraction: python.grading.extraction,
            provider: python.grading.provider,
            retakeRecommended: python.grading.retakeRecommended,
          }
        : undefined;

      const front = python.grading.front as GradingResultDTO['front'] | undefined;
      const centering = normalizeCategory(
        python.grading.centering ?? (front as any)?.centering
      ) as GradingResultDTO['centering'];
      const corners = normalizeCategory(
        python.grading.corners ?? (front as any)?.corners
      ) as GradingResultDTO['corners'];
      const edges = normalizeCategory(
        python.grading.edges ?? (front as any)?.edges
      ) as GradingResultDTO['edges'];
      const surface = normalizeCategory(
        python.grading.surface ?? (front as any)?.surface
      ) as GradingResultDTO['surface'];

      if (
        centering.score == null ||
        corners.score == null ||
        edges.score == null ||
        surface.score == null
      ) {
        return fail(res, 'Grading response missing category scores', 502);
      }

      const stored = await persistResult(
        {
          ...python.grading,
          cardId: cardId || python.grading?.cardId || '',
          cardName: cardName || python.grading?.cardName || 'Unknown Card',
          game: game || python.grading?.game || 'pokemon',
          imageUrl: imageUrl || python.grading?.imageUrl || '',
          backImageUrl,
          centering,
          corners,
          edges,
          surface,
          defectRegions: (python.grading?.defectRegions || []).map((r: any) => ({
            category: r.category,
            side: r.side,
            label: r.label,
            severity: r.severity,
            location: r.location,
          })),
          front: python.grading?.front,
          back: python.grading?.back,
        },
        userId,
        imageUrl || python.grading?.imageUrl || '',
        backImageUrl,
        fullResult
      );

      ok(res, {
        grading: {
          ...stored,
          confidence: python.grading.confidence,
          extraction: python.grading.extraction,
          provider: python.grading.provider,
          retakeRecommended: python.grading.retakeRecommended,
          quality: python.grading.quality,
          limitations: python.grading.limitations,
        },
      });
    } catch (error: any) {
      logger.error('Grading analyze failed', { error: error?.message });
      fail(res, error?.message || 'Grading failed', 500);
    }
  }
);

router.get('/history', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const db = getDb();
    const cardId = req.query.cardId as string | undefined;
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);

    const params: (string | number)[] = [];
    let sql = 'SELECT * FROM grading_results WHERE 1=1';

    if (req.user) {
      sql += ' AND (user_id = ? OR user_id IS NULL)';
      params.push(String(req.user.id));
    }
    if (cardId) {
      sql += ' AND card_id = ?';
      params.push(cardId);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows: GradingResultRow[] = await new Promise((resolve, reject) => {
      db.all(sql, params, (err, r) => (err ? reject(err) : resolve((r as GradingResultRow[]) || [])));
    });

    ok(res, { history: rows.map(rowToGradingResult), count: rows.length });
  } catch (error: any) {
    fail(res, error?.message || 'Failed to load grading history');
  }
});

router.get('/history/:cardId', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const db = getDb();
    const { cardId } = req.params;

    const rows: GradingResultRow[] = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM grading_results WHERE card_id = ? ORDER BY created_at DESC LIMIT 50',
        [cardId],
        (err, r) => (err ? reject(err) : resolve((r as GradingResultRow[]) || []))
      );
    });

    ok(res, { history: rows.map(rowToGradingResult), count: rows.length });
  } catch (error: any) {
    fail(res, error?.message || 'Failed to load grading history');
  }
});

router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const db = getDb();
    const userId = String(req.user!.id);

    const stats: any = await new Promise((resolve, reject) => {
      db.get(
        `SELECT
          COUNT(*) AS total,
          AVG(grade) AS avgGrade,
          AVG(total_score) AS avgTotalScore,
          MAX(total_score) AS bestScore,
          MIN(total_score) AS worstScore
         FROM grading_results
         WHERE user_id = ?`,
        [userId],
        (err, row) => (err ? reject(err) : resolve(row || {}))
      );
    });

    const distribution: Array<{ gradeLabel: string; count: number }> = await new Promise(
      (resolve, reject) => {
        db.all(
          `SELECT grade_label AS gradeLabel, COUNT(*) AS count
           FROM grading_results
           WHERE user_id = ?
           GROUP BY grade_label
           ORDER BY count DESC`,
          [userId],
          (err, rows) => (err ? reject(err) : resolve((rows as any[]) || []))
        );
      }
    );

    ok(res, {
      stats: {
        total: stats.total || 0,
        avgGrade: stats.avgGrade != null ? Math.round(stats.avgGrade * 10) / 10 : null,
        avgTotalScore: stats.avgTotalScore != null ? Math.round(stats.avgTotalScore) : null,
        bestScore: stats.bestScore ?? null,
        worstScore: stats.worstScore ?? null,
        distribution,
      },
    });
  } catch (error: any) {
    fail(res, error?.message || 'Failed to load grading stats');
  }
});

export default router;
