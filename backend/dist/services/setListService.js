"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichSetById = exports.getEnrichedSets = void 0;
const database_1 = require("../db/database");
const setCodeService_1 = require("./setCodeService");
const setEra_1 = require("../utils/setEra");
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().all(sql, params, (err, rows) => {
        if (err)
            reject(err);
        else
            resolve(rows || []);
    });
});
const fetchRawSets = () => __awaiter(void 0, void 0, void 0, function* () {
    const catalogRows = yield dbAll(`
    SELECT
      setId as id,
      setName as name,
      MAX(setReleaseDate) as releaseDate,
      COUNT(*) as total
    FROM catalog_cards
    GROUP BY setId, setName
    `);
    if (catalogRows.length > 0)
        return catalogRows;
    return dbAll(`
    SELECT
      setId as id,
      setName as name,
      NULL as releaseDate,
      COUNT(*) as total
    FROM card_mappings
    GROUP BY setId, setName
    `);
});
const getEnrichedSets = () => __awaiter(void 0, void 0, void 0, function* () {
    yield setCodeService_1.setCodeService.initialize();
    const rows = yield fetchRawSets();
    const enriched = [];
    for (const row of rows) {
        const apiMeta = setCodeService_1.setCodeService.resolveApiSet(row.id, row.name);
        const normalizedId = (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.id) ||
            (yield setCodeService_1.setCodeService.normalizeSetIdForImageUrl(row.id, row.name)) ||
            row.id;
        const series = (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.series) || '';
        const era = (0, setEra_1.classifySetEra)({
            id: (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.id) || row.id,
            name: row.name,
            series,
        });
        const images = (0, setEra_1.resolveSetImages)(apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.images);
        enriched.push({
            id: row.id,
            name: row.name,
            releaseDate: (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.releaseDate) || row.releaseDate || '1970-01-01',
            total: row.total,
            series,
            era,
            eraLabel: (0, setEra_1.getEraLabel)(era),
            images,
        });
    }
    return (0, setEra_1.sortSetsForDisplay)(enriched);
});
exports.getEnrichedSets = getEnrichedSets;
const enrichSetById = (setId) => __awaiter(void 0, void 0, void 0, function* () {
    yield setCodeService_1.setCodeService.initialize();
    const row = yield new Promise((resolve, reject) => {
        (0, database_1.getDb)().get(`
      SELECT setId as id, setName as name, MAX(setReleaseDate) as releaseDate, COUNT(*) as total
      FROM catalog_cards
      WHERE setId = ? OR setName = ?
      GROUP BY setId, setName
      LIMIT 1
      `, [setId, setId], (err, result) => {
            if (err)
                reject(err);
            else
                resolve(result);
        });
    });
    if (!row)
        return null;
    const apiMeta = setCodeService_1.setCodeService.resolveApiSet(row.id, row.name);
    const normalizedId = (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.id) ||
        (yield setCodeService_1.setCodeService.normalizeSetIdForImageUrl(row.id, row.name)) ||
        row.id;
    const series = (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.series) || '';
    const era = (0, setEra_1.classifySetEra)({
        id: (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.id) || row.id,
        name: row.name,
        series,
    });
    return {
        id: row.id,
        name: row.name,
        releaseDate: (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.releaseDate) || row.releaseDate || '1970-01-01',
        total: row.total,
        series,
        era,
        eraLabel: (0, setEra_1.getEraLabel)(era),
        images: (0, setEra_1.resolveSetImages)(apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.images),
    };
});
exports.enrichSetById = enrichSetById;
