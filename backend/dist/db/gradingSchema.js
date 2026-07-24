"use strict";
/**
 * SQL helpers and row mappers for the grading_results table.
 * Table is created by migration 19, extended in migration 20 (defect_regions) and 21 (fullResult).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CREATE_GRADING_RESULTS_SQL = exports.GRADING_RESULTS_TABLE = void 0;
exports.rowToGradingResult = rowToGradingResult;
exports.GRADING_RESULTS_TABLE = 'grading_results';
function parseJson(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch (_a) {
        return fallback;
    }
}
function rowToGradingResult(row) {
    var _a, _b, _c, _d, _e, _f;
    const defects = parseJson(row.defects, {});
    const deviations = parseJson(row.deviations, { leftRight: 0, topBottom: 0 });
    const defectRegions = parseJson(row.defect_regions, undefined);
    const fullResult = parseJson(row.full_result, null);
    // If fullResult has front/back structure, use it
    const front = fullResult === null || fullResult === void 0 ? void 0 : fullResult.front;
    const back = fullResult === null || fullResult === void 0 ? void 0 : fullResult.back;
    // Build category data from front (if available) or fall back to flat columns
    const frontCentering = front === null || front === void 0 ? void 0 : front.centering;
    const frontCorners = front === null || front === void 0 ? void 0 : front.corners;
    const frontEdges = front === null || front === void 0 ? void 0 : front.edges;
    const frontSurface = front === null || front === void 0 ? void 0 : front.surface;
    return {
        id: row.id,
        cardId: row.card_id || '',
        cardName: row.card_name,
        game: (row.game === 'onepiece' ? 'onepiece' : 'pokemon'),
        centering: {
            score: (_a = frontCentering === null || frontCentering === void 0 ? void 0 : frontCentering.score) !== null && _a !== void 0 ? _a : row.centering_score,
            details: (frontCentering === null || frontCentering === void 0 ? void 0 : frontCentering.details) || row.centering_details || '',
            deviations: (frontCentering === null || frontCentering === void 0 ? void 0 : frontCentering.deviations) ||
                deviations || { leftRight: 0, topBottom: 0 },
            defects: (frontCentering === null || frontCentering === void 0 ? void 0 : frontCentering.defects) || defects.centering || [],
            crops: frontCentering === null || frontCentering === void 0 ? void 0 : frontCentering.crops,
        },
        corners: {
            score: (_b = frontCorners === null || frontCorners === void 0 ? void 0 : frontCorners.score) !== null && _b !== void 0 ? _b : row.corners_score,
            details: (frontCorners === null || frontCorners === void 0 ? void 0 : frontCorners.details) || row.corners_details || '',
            defects: (frontCorners === null || frontCorners === void 0 ? void 0 : frontCorners.defects) || defects.corners || [],
            crops: frontCorners === null || frontCorners === void 0 ? void 0 : frontCorners.crops,
            deviations: frontCorners === null || frontCorners === void 0 ? void 0 : frontCorners.deviations,
        },
        edges: {
            score: (_c = frontEdges === null || frontEdges === void 0 ? void 0 : frontEdges.score) !== null && _c !== void 0 ? _c : row.edges_score,
            details: (frontEdges === null || frontEdges === void 0 ? void 0 : frontEdges.details) || row.edges_details || '',
            defects: (frontEdges === null || frontEdges === void 0 ? void 0 : frontEdges.defects) || defects.edges || [],
            crops: frontEdges === null || frontEdges === void 0 ? void 0 : frontEdges.crops,
            deviations: frontEdges === null || frontEdges === void 0 ? void 0 : frontEdges.deviations,
        },
        surface: {
            score: (_d = frontSurface === null || frontSurface === void 0 ? void 0 : frontSurface.score) !== null && _d !== void 0 ? _d : row.surface_score,
            details: (frontSurface === null || frontSurface === void 0 ? void 0 : frontSurface.details) || row.surface_details || '',
            defects: (frontSurface === null || frontSurface === void 0 ? void 0 : frontSurface.defects) || defects.surface || [],
            crops: frontSurface === null || frontSurface === void 0 ? void 0 : frontSurface.crops,
        },
        totalScore: row.total_score,
        grade: row.grade,
        gradeLabel: row.grade_label,
        imageUrl: row.image_url || '',
        backImageUrl: row.back_image_url || undefined,
        timestamp: row.created_at,
        estimatedGradedValue: (_e = row.estimated_value) !== null && _e !== void 0 ? _e : undefined,
        suggestedCondition: (_f = row.suggested_condition) !== null && _f !== void 0 ? _f : undefined,
        defectRegions,
        front: front !== null && front !== void 0 ? front : undefined,
        back: back !== null && back !== void 0 ? back : undefined,
    };
}
exports.CREATE_GRADING_RESULTS_SQL = `
CREATE TABLE IF NOT EXISTS grading_results (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  card_id TEXT,
  card_name TEXT NOT NULL,
  game TEXT NOT NULL DEFAULT 'pokemon',
  centering_score REAL NOT NULL,
  corners_score REAL NOT NULL,
  edges_score REAL NOT NULL,
  surface_score REAL NOT NULL,
  total_score REAL NOT NULL,
  grade REAL NOT NULL,
  grade_label TEXT NOT NULL,
  defects TEXT,
  image_url TEXT,
  estimated_value REAL,
  centering_details TEXT,
  corners_details TEXT,
  edges_details TEXT,
  surface_details TEXT,
  deviations TEXT,
  suggested_condition TEXT,
  defect_regions TEXT,
  full_result TEXT,
  back_image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`;
