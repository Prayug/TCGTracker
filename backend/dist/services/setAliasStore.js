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
exports.syncSetIdAliases = syncSetIdAliases;
exports.getCatalogSetIdsForSource = getCatalogSetIdsForSource;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const setCodeService_1 = require("./setCodeService");
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().all(sql, params, (err, rows) => {
        if (err)
            reject(err);
        else
            resolve(rows || []);
    });
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().run(sql, params, function (err) {
        if (err)
            reject(err);
        else
            resolve(this.changes);
    });
});
/** Persist TCGPlayer/TCGCSV set IDs → Pokemon catalog set IDs for SQL joins. */
function syncSetIdAliases() {
    return __awaiter(this, void 0, void 0, function* () {
        yield setCodeService_1.setCodeService.initialize();
        const distinctSets = yield dbAll(`SELECT DISTINCT setId, setName
     FROM card_mappings
     WHERE setId IS NOT NULL AND TRIM(setId) <> ''`);
        let upserted = 0;
        for (const { setId, setName } of distinctSets) {
            const catalogSetId = yield setCodeService_1.setCodeService.normalizeSetIdForImageUrl(setId, setName);
            if (!catalogSetId)
                continue;
            yield dbRun(`INSERT INTO set_id_aliases (sourceSetId, sourceSetName, catalogSetId, updatedAt)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(sourceSetId) DO UPDATE SET
         sourceSetName = excluded.sourceSetName,
         catalogSetId = excluded.catalogSetId,
         updatedAt = datetime('now')`, [setId, setName || null, catalogSetId]);
            upserted += 1;
        }
        logger_1.logger.info(`Synced ${upserted} set ID aliases`);
        return upserted;
    });
}
function getCatalogSetIdsForSource(sourceSetId, setName) {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = yield dbAll(`SELECT catalogSetId FROM set_id_aliases WHERE sourceSetId = ?`, [sourceSetId]);
        const ids = new Set(rows.map((row) => row.catalogSetId));
        if (ids.size === 0) {
            yield setCodeService_1.setCodeService.initialize();
            const normalized = yield setCodeService_1.setCodeService.normalizeSetIdForImageUrl(sourceSetId, setName);
            if (normalized)
                ids.add(normalized);
        }
        return [...ids];
    });
}
