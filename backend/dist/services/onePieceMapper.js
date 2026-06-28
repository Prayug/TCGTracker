"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapRawToCatalogFields = mapRawToCatalogFields;
exports.mapRawToApiCard = mapRawToApiCard;
exports.mapRowToApiCard = mapRowToApiCard;
exports.cardMatchesQuery = cardMatchesQuery;
const onePieceCatalogId_1 = require("./onePieceCatalogId");
function mapRawToCatalogFields(raw) {
    var _a, _b, _c;
    return {
        catalogId: (0, onePieceCatalogId_1.buildOnePieceCatalogId)(raw),
        cardSetId: raw.card_set_id,
        cardImageId: raw.card_image_id,
        cardName: raw.card_name,
        setId: raw.set_id,
        setName: raw.set_name,
        rarity: raw.rarity || null,
        cardColor: raw.card_color || null,
        cardType: raw.card_type || null,
        cardCost: raw.card_cost || null,
        cardPower: raw.card_power || null,
        counterAmount: (_a = raw.counter_amount) !== null && _a !== void 0 ? _a : null,
        life: raw.life || null,
        subTypes: raw.sub_types || null,
        attribute: raw.attribute || null,
        cardText: raw.card_text || null,
        imageUrl: raw.card_image || null,
        marketPrice: (_b = raw.market_price) !== null && _b !== void 0 ? _b : null,
        inventoryPrice: (_c = raw.inventory_price) !== null && _c !== void 0 ? _c : null,
    };
}
function mapRawToApiCard(raw, source = 'optcg_live') {
    var _a, _b, _c;
    const fields = mapRawToCatalogFields(raw);
    return {
        id: fields.catalogId,
        catalogId: fields.catalogId,
        cardSetId: fields.cardSetId,
        name: fields.cardName,
        images: {
            small: fields.imageUrl || '',
            large: fields.imageUrl || '',
        },
        set: {
            id: fields.setId,
            name: fields.setName,
        },
        number: fields.cardSetId,
        rarity: fields.rarity || undefined,
        cardColor: fields.cardColor || undefined,
        cardType: fields.cardType || undefined,
        cardCost: fields.cardCost || undefined,
        cardPower: fields.cardPower || undefined,
        counterAmount: (_a = fields.counterAmount) !== null && _a !== void 0 ? _a : undefined,
        life: fields.life || undefined,
        subTypes: fields.subTypes || undefined,
        attribute: fields.attribute || undefined,
        cardText: fields.cardText || undefined,
        marketPrice: (_b = fields.marketPrice) !== null && _b !== void 0 ? _b : undefined,
        inventoryPrice: (_c = fields.inventoryPrice) !== null && _c !== void 0 ? _c : undefined,
        source,
    };
}
function mapRowToApiCard(row, source = 'local_database') {
    var _a, _b, _c;
    return {
        id: row.catalogId,
        catalogId: row.catalogId,
        cardSetId: row.cardSetId,
        name: row.cardName,
        images: {
            small: row.imageUrl || '',
            large: row.imageUrl || '',
        },
        set: {
            id: row.setId,
            name: row.setName,
        },
        number: row.cardSetId,
        rarity: row.rarity || undefined,
        cardColor: row.cardColor || undefined,
        cardType: row.cardType || undefined,
        cardCost: row.cardCost || undefined,
        cardPower: row.cardPower || undefined,
        counterAmount: (_a = row.counterAmount) !== null && _a !== void 0 ? _a : undefined,
        life: row.life || undefined,
        subTypes: row.subTypes || undefined,
        attribute: row.attribute || undefined,
        cardText: row.cardText || undefined,
        marketPrice: typeof row.latestMarketPrice === 'number'
            ? row.latestMarketPrice
            : (_b = row.marketPrice) !== null && _b !== void 0 ? _b : undefined,
        inventoryPrice: typeof row.latestInventoryPrice === 'number'
            ? row.latestInventoryPrice
            : (_c = row.inventoryPrice) !== null && _c !== void 0 ? _c : undefined,
        source,
    };
}
function cardMatchesQuery(raw, query) {
    var _a;
    const q = query.trim().toLowerCase();
    if (q.length < 2)
        return false;
    // Match card name, number, set, and crew/subtype — NOT card_text (effect text
    // references other characters, e.g. Boa Hancock mentioning Monkey.D.Luffy).
    return (raw.card_name.toLowerCase().includes(q) ||
        raw.card_set_id.toLowerCase().includes(q) ||
        raw.set_name.toLowerCase().includes(q) ||
        Boolean((_a = raw.sub_types) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(q)));
}
