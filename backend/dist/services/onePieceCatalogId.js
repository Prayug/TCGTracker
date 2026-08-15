"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOnePieceCatalogId = buildOnePieceCatalogId;
exports.isOnePieceCatalogId = isOnePieceCatalogId;
exports.parseOnePieceCatalogId = parseOnePieceCatalogId;
/** Stable unique id per OPTCG row (set + art + name). */
function buildOnePieceCatalogId(raw) {
    return `${raw.set_id}::${raw.card_image_id}::${raw.card_name}`;
}
function isOnePieceCatalogId(id) {
    return id.includes('::');
}
function parseOnePieceCatalogId(id) {
    if (!id.includes('::'))
        return null;
    const [setId, cardImageId, ...rest] = id.split('::');
    const cardName = rest.join('::');
    if (!setId || !cardImageId)
        return null;
    return { setId, cardImageId, cardName };
}
