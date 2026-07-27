"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const undici_1 = require("undici");
const database_1 = require("../db/database");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const apiResponse_1 = require("../utils/apiResponse");
const logger_1 = require("../utils/logger");
const gradingSchema_1 = require("../db/gradingSchema");
const crypto_1 = require("crypto");
const SCANNER_URL = (process.env.CARD_SCANNER_URL || 'http://localhost:5001').replace(/\/+$/, '');
const analyzeSchema = zod_1.z.object({
    body: zod_1.z.object({
        image: zod_1.z.string().min(1),
        backImage: zod_1.z.string().optional(),
        cardId: zod_1.z.string().optional(),
        cardName: zod_1.z.string().optional(),
        game: zod_1.z.enum(['pokemon', 'onepiece']).optional(),
        rawPrice: zod_1.z.number().optional(),
        imageUrl: zod_1.z.string().optional(),
    }),
});
function ensureTable() {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.run(gradingSchema_1.CREATE_GRADING_RESULTS_SQL, (err) => {
            if (err)
                reject(err);
            else {
                db.run('CREATE INDEX IF NOT EXISTS idx_grading_results_card ON grading_results(card_id)', () => {
                    db.run('CREATE INDEX IF NOT EXISTS idx_grading_results_user ON grading_results(user_id)', (e2) => (e2 ? reject(e2) : resolve()));
                });
            }
        });
    });
}
async function forwardToPython(body) {
    // Primary path: specialist CV/ML pipeline (not Ollama)
    const res = await (0, undici_1.request)(`${SCANNER_URL}/api/grade-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        headersTimeout: 90000,
        bodyTimeout: 90000,
    });
    const data = (await res.body.json());
    return { ...data, statusCode: res.statusCode };
}
/** Ensure nested category objects even if upstream returns a partial payload. */
function normalizeCategory(cat, fallbackScore = 0) {
    var _a, _b;
    if (cat && typeof cat === 'object' && 'score' in cat) {
        const c = cat;
        return {
            score: Number((_a = c.score) !== null && _a !== void 0 ? _a : fallbackScore),
            details: String((_b = c.details) !== null && _b !== void 0 ? _b : ''),
            deviations: c.deviations || {
                leftRight: 0,
                topBottom: 0,
            },
            defects: Array.isArray(c.defects) ? c.defects : [],
            crops: c.crops,
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
function persistResult(grading, userId, imageUrl, backImageUrl, fullResult) {
    var _a, _b, _c, _d, _e;
    const db = (0, database_1.getDb)();
    const id = grading.id || `grade-${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 12)}`;
    const defects = JSON.stringify({
        centering: ((_a = grading.centering) === null || _a === void 0 ? void 0 : _a.defects) || [],
        corners: ((_b = grading.corners) === null || _b === void 0 ? void 0 : _b.defects) || [],
        edges: ((_c = grading.edges) === null || _c === void 0 ? void 0 : _c.defects) || [],
        surface: ((_d = grading.surface) === null || _d === void 0 ? void 0 : _d.defects) || [],
    });
    const deviations = JSON.stringify(((_e = grading.centering) === null || _e === void 0 ? void 0 : _e.deviations) || { leftRight: 0, topBottom: 0 });
    const defectRegions = JSON.stringify(grading.defectRegions || []);
    const fullResultJson = fullResult ? JSON.stringify(fullResult) : null;
    const createdAt = grading.timestamp || new Date().toISOString();
    return new Promise((resolve, reject) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        db.run(`INSERT INTO grading_results (
        id, user_id, card_id, card_name, game,
        centering_score, corners_score, edges_score, surface_score,
        total_score, grade, grade_label, defects, image_url, estimated_value,
        centering_details, corners_details, edges_details, surface_details,
        deviations, suggested_condition, defect_regions, full_result, back_image_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            userId,
            grading.cardId || null,
            grading.cardName || 'Unknown Card',
            grading.game || 'pokemon',
            (_b = (_a = grading.centering) === null || _a === void 0 ? void 0 : _a.score) !== null && _b !== void 0 ? _b : 0,
            (_d = (_c = grading.corners) === null || _c === void 0 ? void 0 : _c.score) !== null && _d !== void 0 ? _d : 0,
            (_f = (_e = grading.edges) === null || _e === void 0 ? void 0 : _e.score) !== null && _f !== void 0 ? _f : 0,
            (_h = (_g = grading.surface) === null || _g === void 0 ? void 0 : _g.score) !== null && _h !== void 0 ? _h : 0,
            grading.totalScore,
            grading.grade,
            grading.gradeLabel,
            defects,
            imageUrl || grading.imageUrl || null,
            (_j = grading.estimatedGradedValue) !== null && _j !== void 0 ? _j : null,
            ((_k = grading.centering) === null || _k === void 0 ? void 0 : _k.details) || null,
            ((_l = grading.corners) === null || _l === void 0 ? void 0 : _l.details) || null,
            ((_m = grading.edges) === null || _m === void 0 ? void 0 : _m.details) || null,
            ((_o = grading.surface) === null || _o === void 0 ? void 0 : _o.details) || null,
            deviations,
            grading.suggestedCondition || null,
            defectRegions,
            fullResultJson,
            backImageUrl || grading.backImageUrl || null,
            createdAt,
        ], (err) => {
            if (err)
                reject(err);
            else
                resolve({
                    ...grading,
                    id,
                    timestamp: createdAt,
                    imageUrl: imageUrl || grading.imageUrl || '',
                });
        });
    });
}
const router = (0, express_1.Router)();
router.get('/health', async (_req, res) => {
    try {
        const upstream = await (0, undici_1.request)(`${SCANNER_URL}/health`, {
            method: 'GET',
            headersTimeout: 4000,
            bodyTimeout: 4000,
        });
        const data = (await upstream.body.json());
        const okStatus = upstream.statusCode >= 200 && upstream.statusCode < 300 && (data === null || data === void 0 ? void 0 : data.status) === 'ok';
        if (!okStatus) {
            return (0, apiResponse_1.fail)(res, (data === null || data === void 0 ? void 0 : data.message) || 'Scanner unhealthy', 502);
        }
        (0, apiResponse_1.ok)(res, {
            status: 'ok',
            scanner: data,
            scannerUrl: SCANNER_URL,
        });
    }
    catch (error) {
        logger_1.logger.warn('Grading scanner health check failed', { error: error === null || error === void 0 ? void 0 : error.message, scannerUrl: SCANNER_URL });
        (0, apiResponse_1.fail)(res, (error === null || error === void 0 ? void 0 : error.message) || 'Scanner unreachable', 503);
    }
});
router.post('/analyze', auth_1.optionalAuth, (0, validation_1.validate)(analyzeSchema), async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
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
            const status = python.statusCode === 422 ? 422 : python.statusCode && python.statusCode >= 400
                ? python.statusCode
                : 502;
            return (0, apiResponse_1.fail)(res, python.error || 'Grading analysis failed', status, {
                code: python.code,
                retakeRecommended: (_a = python.retakeRecommended) !== null && _a !== void 0 ? _a : status === 422,
            });
        }
        const userId = req.user ? String(req.user.id) : null;
        const backImageUrl = ((_b = python.grading) === null || _b === void 0 ? void 0 : _b.backImageUrl) || '';
        const fullResult = ((_c = python.grading) === null || _c === void 0 ? void 0 : _c.front)
            ? {
                front: python.grading.front,
                back: python.grading.back,
                confidence: python.grading.confidence,
                extraction: python.grading.extraction,
                provider: python.grading.provider,
                retakeRecommended: python.grading.retakeRecommended,
            }
            : undefined;
        const front = python.grading.front;
        const centering = normalizeCategory((_d = python.grading.centering) !== null && _d !== void 0 ? _d : front === null || front === void 0 ? void 0 : front.centering);
        const corners = normalizeCategory((_e = python.grading.corners) !== null && _e !== void 0 ? _e : front === null || front === void 0 ? void 0 : front.corners);
        const edges = normalizeCategory((_f = python.grading.edges) !== null && _f !== void 0 ? _f : front === null || front === void 0 ? void 0 : front.edges);
        const surface = normalizeCategory((_g = python.grading.surface) !== null && _g !== void 0 ? _g : front === null || front === void 0 ? void 0 : front.surface);
        if (centering.score == null ||
            corners.score == null ||
            edges.score == null ||
            surface.score == null) {
            return (0, apiResponse_1.fail)(res, 'Grading response missing category scores', 502);
        }
        const stored = await persistResult({
            ...python.grading,
            cardId: cardId || ((_h = python.grading) === null || _h === void 0 ? void 0 : _h.cardId) || '',
            cardName: cardName || ((_j = python.grading) === null || _j === void 0 ? void 0 : _j.cardName) || 'Unknown Card',
            game: game || ((_k = python.grading) === null || _k === void 0 ? void 0 : _k.game) || 'pokemon',
            imageUrl: imageUrl || ((_l = python.grading) === null || _l === void 0 ? void 0 : _l.imageUrl) || '',
            backImageUrl,
            centering,
            corners,
            edges,
            surface,
            defectRegions: (((_m = python.grading) === null || _m === void 0 ? void 0 : _m.defectRegions) || []).map((r) => ({
                category: r.category,
                side: r.side,
                label: r.label,
                severity: r.severity,
                location: r.location,
            })),
            front: (_o = python.grading) === null || _o === void 0 ? void 0 : _o.front,
            back: (_p = python.grading) === null || _p === void 0 ? void 0 : _p.back,
        }, userId, imageUrl || ((_q = python.grading) === null || _q === void 0 ? void 0 : _q.imageUrl) || '', backImageUrl, fullResult);
        (0, apiResponse_1.ok)(res, {
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
    }
    catch (error) {
        logger_1.logger.error('Grading analyze failed', { error: error === null || error === void 0 ? void 0 : error.message });
        (0, apiResponse_1.fail)(res, (error === null || error === void 0 ? void 0 : error.message) || 'Grading failed', 500);
    }
});
router.get('/history', auth_1.optionalAuth, async (req, res) => {
    try {
        await ensureTable();
        const db = (0, database_1.getDb)();
        const cardId = req.query.cardId;
        const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
        const params = [];
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
        const rows = await new Promise((resolve, reject) => {
            db.all(sql, params, (err, r) => (err ? reject(err) : resolve(r || [])));
        });
        (0, apiResponse_1.ok)(res, { history: rows.map(gradingSchema_1.rowToGradingResult), count: rows.length });
    }
    catch (error) {
        (0, apiResponse_1.fail)(res, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to load grading history');
    }
});
router.get('/history/:cardId', auth_1.optionalAuth, async (req, res) => {
    try {
        await ensureTable();
        const db = (0, database_1.getDb)();
        const { cardId } = req.params;
        const rows = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM grading_results WHERE card_id = ? ORDER BY created_at DESC LIMIT 50', [cardId], (err, r) => (err ? reject(err) : resolve(r || [])));
        });
        (0, apiResponse_1.ok)(res, { history: rows.map(gradingSchema_1.rowToGradingResult), count: rows.length });
    }
    catch (error) {
        (0, apiResponse_1.fail)(res, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to load grading history');
    }
});
router.get('/stats', auth_1.authenticate, async (req, res) => {
    var _a, _b;
    try {
        await ensureTable();
        const db = (0, database_1.getDb)();
        const userId = String(req.user.id);
        const stats = await new Promise((resolve, reject) => {
            db.get(`SELECT
          COUNT(*) AS total,
          AVG(grade) AS avgGrade,
          AVG(total_score) AS avgTotalScore,
          MAX(total_score) AS bestScore,
          MIN(total_score) AS worstScore
         FROM grading_results
         WHERE user_id = ?`, [userId], (err, row) => (err ? reject(err) : resolve(row || {})));
        });
        const distribution = await new Promise((resolve, reject) => {
            db.all(`SELECT grade_label AS gradeLabel, COUNT(*) AS count
           FROM grading_results
           WHERE user_id = ?
           GROUP BY grade_label
           ORDER BY count DESC`, [userId], (err, rows) => (err ? reject(err) : resolve(rows || [])));
        });
        (0, apiResponse_1.ok)(res, {
            stats: {
                total: stats.total || 0,
                avgGrade: stats.avgGrade != null ? Math.round(stats.avgGrade * 10) / 10 : null,
                avgTotalScore: stats.avgTotalScore != null ? Math.round(stats.avgTotalScore) : null,
                bestScore: (_a = stats.bestScore) !== null && _a !== void 0 ? _a : null,
                worstScore: (_b = stats.worstScore) !== null && _b !== void 0 ? _b : null,
                distribution,
            },
        });
    }
    catch (error) {
        (0, apiResponse_1.fail)(res, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to load grading stats');
    }
});
exports.default = router;
