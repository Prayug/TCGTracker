"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PACK_POOL_CHASE_MIN = exports.PACK_ERA_BANDS = void 0;
exports.eraToPackBand = eraToPackBand;
exports.packEraBandFromSet = packEraBandFromSet;
exports.eraBandSql = eraBandSql;
exports.stratifiedPoolSliceSizes = stratifiedPoolSliceSizes;
exports.buildStratifiedPackPoolSql = buildStratifiedPackPoolSql;
const setEra_1 = require("./setEra");
exports.PACK_ERA_BANDS = ['modern', 'sm_xy', 'bw_dp', 'vintage'];
/** Split each era band into bulk vs chase so high-tier packs still see modern SIRs. */
exports.PACK_POOL_CHASE_MIN = 25;
function eraToPackBand(era) {
    switch (era) {
        case 'mega':
        case 'sv':
        case 'swsh':
            return 'modern';
        case 'sm':
        case 'xy':
            return 'sm_xy';
        case 'bw':
        case 'col':
        case 'hgss':
        case 'dp':
            return 'bw_dp';
        default:
            return 'vintage';
    }
}
function packEraBandFromSet(set) {
    return eraToPackBand((0, setEra_1.classifySetEra)({ id: set.id || '', name: set.name || '' }));
}
/** SQL predicate against card_mappings alias (setId / setName). */
function eraBandSql(alias, band) {
    const id = `lower(${alias}.setId)`;
    const name = `lower(${alias}.setName)`;
    const modern = `(
    ${id} LIKE 'sv%' OR ${id} LIKE 'zsv%' OR ${id} LIKE 'rsv%' OR ${id} LIKE 'me%'
    OR ${id} LIKE 'swsh%' OR ${id} LIKE 'pgo%' OR ${id} LIKE 'cel%'
    OR ${name} LIKE '%scarlet%' OR ${name} LIKE '%violet%'
    OR ${name} LIKE '%sword%' OR ${name} LIKE '%shield%'
    OR ${name} LIKE 'sv:%' OR ${name} LIKE 'sv -%' OR ${name} LIKE 'swsh%'
    OR ${name} LIKE 'me:%' OR ${name} LIKE '%mega evolution%'
    OR ${name} LIKE '%black bolt%' OR ${name} LIKE '%white flare%'
    OR ${name} LIKE '%celebrations%'
  )`;
    const smXy = `(
    ${id} LIKE 'sm%' OR ${id} LIKE 'xy%' OR ${id} LIKE 'g1%' OR ${id} LIKE 'dc1%'
    OR ${name} LIKE 'sm -%' OR ${name} LIKE 'sm:%' OR ${name} LIKE 'xy%'
    OR ${name} LIKE '%sun & moon%' OR ${name} LIKE '%sun and moon%'
    OR ${name} LIKE '%generations%'
  )`;
    const bwDp = `(
    ${id} LIKE 'bw%' OR ${id} LIKE 'col%' OR ${id} LIKE 'hgss%'
    OR ${id} LIKE 'dp%' OR ${id} LIKE 'pl%'
    OR ${name} LIKE 'bw -%' OR ${name} LIKE 'bw:%'
    OR ${name} LIKE '%black & white%' OR ${name} LIKE '%black and white%'
    OR ${name} LIKE '%heartgold%' OR ${name} LIKE '%soulsilver%'
    OR ${name} LIKE '%diamond%' OR ${name} LIKE '%pearl%' OR ${name} LIKE '%platinum%'
    OR ${name} LIKE '%call of legends%'
  )`;
    switch (band) {
        case 'modern':
            return modern;
        case 'sm_xy':
            return smXy;
        case 'bw_dp':
            return bwDp;
        case 'vintage':
            return `NOT ${modern} AND NOT ${smXy} AND NOT ${bwDp}`;
    }
}
function stratifiedPoolSliceSizes(poolLimit) {
    const bandSize = Math.max(2, Math.floor(poolLimit / exports.PACK_ERA_BANDS.length));
    const chase = Math.max(1, Math.floor(bandSize * 0.4));
    const bulk = Math.max(1, bandSize - chase);
    return { bulk, chase };
}
/**
 * One materialized canonical card list, then equal-sized random slices per era
 * band (bulk + chase) so SV/SWSH chase is not drowned by EX-era PSA 10 fodder.
 */
function buildStratifiedPackPoolSql(imageColumns, exclusionSql) {
    const outerImages = imageColumns.replace(/cm\./g, '');
    const slices = exports.PACK_ERA_BANDS.map((band) => {
        const pred = eraBandSql('canonical', band);
        return `
      SELECT * FROM (
        SELECT * FROM canonical
        WHERE ${pred} AND latestPrice < ${exports.PACK_POOL_CHASE_MIN}
        ORDER BY RANDOM() LIMIT ?
      )
      UNION ALL
      SELECT * FROM (
        SELECT * FROM canonical
        WHERE ${pred} AND latestPrice >= ${exports.PACK_POOL_CHASE_MIN}
        ORDER BY RANDOM() LIMIT ?
      )`;
    });
    return `
    WITH ranked AS MATERIALIZED (
      SELECT
        cm.cardId,
        cm.cardName,
        cm.setId,
        cm.setName,
        cm.cardNumber,
        cm.rarity,
        cm.tcgplayerProductId,
        cm.uniqueIdentifier,
        ${imageColumns}
        ph.marketPrice as latestPrice,
        ph.date as priceDate,
        ROW_NUMBER() OVER (
          PARTITION BY lower(trim(cm.cardName)), lower(trim(cm.setName)), lower(trim(cm.cardNumber))
          ORDER BY CASE WHEN cm.cardId LIKE 'tcgcsv-%' THEN 1 ELSE 0 END,
                   ph.marketPrice DESC
        ) AS packRn
      FROM card_mappings cm
      JOIN (
        SELECT ph1.uniqueIdentifier, ph1.marketPrice, ph1.date
        FROM price_history ph1
        JOIN (
          SELECT uniqueIdentifier, MAX(date) AS maxDate
          FROM price_history
          WHERE source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
          GROUP BY uniqueIdentifier
        ) latest ON ph1.uniqueIdentifier = latest.uniqueIdentifier AND ph1.date = latest.maxDate
        WHERE ph1.marketPrice IS NOT NULL
      ) ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
      WHERE ph.marketPrice >= ? AND ph.marketPrice <= ?
        AND cm.cardName IS NOT NULL AND TRIM(cm.cardName) <> ''
        AND cm.setId IS NOT NULL AND TRIM(cm.setId) <> ''
        AND cm.cardNumber IS NOT NULL AND TRIM(cm.cardNumber) <> ''
        AND ${exclusionSql}
    ),
    canonical AS MATERIALIZED (
      SELECT
        cardId,
        cardName,
        setId,
        setName,
        cardNumber,
        rarity,
        tcgplayerProductId,
        uniqueIdentifier,
        ${outerImages}
        latestPrice,
        priceDate
      FROM ranked
      WHERE packRn = 1
    )
    ${slices.join('\n      UNION ALL')}
  `;
}
