"use strict";
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
const fetchRawSets = async () => {
    const catalogRows = await dbAll(`
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
};
const getEnrichedSets = async () => {
    await setCodeService_1.setCodeService.initialize();
    const rows = await fetchRawSets();
    const enriched = [];
    for (const row of rows) {
        const apiMeta = setCodeService_1.setCodeService.resolveApiSet(row.id, row.name);
        const normalizedId = (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.id) ||
            (await setCodeService_1.setCodeService.normalizeSetIdForImageUrl(row.id, row.name)) ||
            row.id;
        const series = (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.series) || '';
        const era = (0, setEra_1.classifySetEra)({
            id: (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.id) || row.id,
            name: row.name,
            series,
        });
        const imageSetId = (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.id) || normalizedId || row.id;
        const images = (0, setEra_1.resolveSetImages)(apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.images, imageSetId);
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
    // Catalog can emit multiple names under one setId (e.g. svp). Prefer the larger checklist.
    const deduped = new Map();
    for (const set of enriched) {
        const prev = deduped.get(set.id);
        if (!prev || set.total > prev.total)
            deduped.set(set.id, set);
    }
    return (0, setEra_1.sortSetsForDisplay)([...deduped.values()]);
};
exports.getEnrichedSets = getEnrichedSets;
const enrichSetById = async (setId) => {
    await setCodeService_1.setCodeService.initialize();
    const row = await new Promise((resolve, reject) => {
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
        (await setCodeService_1.setCodeService.normalizeSetIdForImageUrl(row.id, row.name)) ||
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
        images: (0, setEra_1.resolveSetImages)(apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.images, (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.id) || normalizedId || row.id),
    };
};
exports.enrichSetById = enrichSetById;
