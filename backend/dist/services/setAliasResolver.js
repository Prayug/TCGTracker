"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSetMappingWhereClause = exports.resolveSetSearchKeys = exports.normalizeSetKey = void 0;
const database_1 = require("../db/database");
const setCodeService_1 = require("./setCodeService");
const normalizeSetKey = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
exports.normalizeSetKey = normalizeSetKey;
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().all(sql, params, (err, rows) => {
        if (err)
            reject(err);
        else
            resolve(rows || []);
    });
});
/**
 * Catalog set IDs (Pokemon API: me4) often differ from TCGCSV mapping IDs (me04chaosrising).
 * Collect every ID/name variant so price_history + card_mappings can be joined.
 */
const resolveSetSearchKeys = async (setId, setName) => {
    var _a;
    await setCodeService_1.setCodeService.initialize();
    const setIds = new Set([setId]);
    const setNames = new Set();
    if (setName)
        setNames.add(setName);
    const apiMeta = setCodeService_1.setCodeService.resolveApiSet(setId, setName);
    if (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.id)
        setIds.add(apiMeta.id);
    if (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.name)
        setNames.add(apiMeta.name);
    const idPlaceholders = [...setIds].map(() => '?').join(',');
    const exactRows = await dbAll(`
    SELECT DISTINCT setId, setName
    FROM card_mappings
    WHERE setId IN (${idPlaceholders})
    `, [...setIds]);
    for (const row of exactRows) {
        setIds.add(row.setId);
        if (row.setName)
            setNames.add(row.setName);
    }
    for (const name of [...setNames]) {
        const likeRows = await dbAll(`
      SELECT DISTINCT setId, setName
      FROM card_mappings
      WHERE setName = ? OR setName LIKE ?
      `, [name, `%${name}%`]);
        for (const row of likeRows) {
            setIds.add(row.setId);
            if (row.setName)
                setNames.add(row.setName);
        }
    }
    const catalogRow = await dbAll(`SELECT DISTINCT setName FROM catalog_cards WHERE setId = ? OR setName = ? LIMIT 1`, [setId, setName || setId]);
    if ((_a = catalogRow[0]) === null || _a === void 0 ? void 0 : _a.setName) {
        setNames.add(catalogRow[0].setName);
        const catalogLike = await dbAll(`SELECT DISTINCT setId, setName FROM card_mappings WHERE setName LIKE ?`, [`%${catalogRow[0].setName}%`]);
        for (const row of catalogLike) {
            setIds.add(row.setId);
            if (row.setName)
                setNames.add(row.setName);
        }
    }
    return { setIds: [...setIds], setNames: [...setNames] };
};
exports.resolveSetSearchKeys = resolveSetSearchKeys;
const buildSetMappingWhereClause = (keys) => {
    const params = [];
    const parts = [];
    if (keys.setIds.length > 0) {
        parts.push(`cm.setId IN (${keys.setIds.map(() => '?').join(',')})`);
        params.push(...keys.setIds);
    }
    if (keys.setNames.length > 0) {
        const validNames = keys.setNames.filter((n) => n.trim().length > 0);
        if (validNames.length > 0) {
            parts.push(`cm.setName IN (${validNames.map(() => '?').join(',')})`);
            params.push(...validNames);
            for (const name of validNames) {
                parts.push(`cm.setName LIKE ?`);
                params.push(`%${name}%`);
            }
        }
    }
    if (parts.length === 0) {
        return { sql: '1=0', params: [] };
    }
    return { sql: `(${parts.join(' OR ')})`, params };
};
exports.buildSetMappingWhereClause = buildSetMappingWhereClause;
