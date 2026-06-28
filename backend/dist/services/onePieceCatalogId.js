"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOnePieceCatalogId = buildOnePieceCatalogId;
exports.isOnePieceCatalogId = isOnePieceCatalogId;
/** Stable unique id per OPTCG row (set + art + name). */
function buildOnePieceCatalogId(raw) {
    return `${raw.set_id}::${raw.card_image_id}::${raw.card_name}`;
}
function isOnePieceCatalogId(id) {
    return id.includes('::');
}
