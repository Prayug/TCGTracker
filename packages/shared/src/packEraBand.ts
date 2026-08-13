import { classifySetEra } from './setEra';

export const PACK_ERA_BANDS = ['modern', 'sm_xy', 'bw_dp', 'vintage'] as const;
export type PackEraBand = (typeof PACK_ERA_BANDS)[number];

/** Split each era band into bulk vs chase so high-tier packs still see modern SIRs. */
export const PACK_POOL_CHASE_MIN = 25;

export function eraToPackBand(era: string): PackEraBand {
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

/** Backend / catalog path: classify via set-era rules, then map to a pack band. */
export function packEraBandFromSet(set: { id?: string; name?: string }): PackEraBand {
  return eraToPackBand(classifySetEra({ id: set.id || '', name: set.name || '' }));
}

/**
 * Frontend pack-shop path: regex over set id/name only.
 * Kept as a separate function so Browse/pack-open odds do not silently change.
 */
export function packEraBandFromSetLabel(set?: { id?: string; name?: string }): PackEraBand {
  const id = (set?.id || '').toLowerCase();
  const name = (set?.name || '').toLowerCase();
  const blob = `${id} ${name}`;

  if (
    /mega evolution|\bme\d|\bme:|scarlet|violet|\bsv[\s:_-]|\bsv\d|zsv|rsv|swsh|sword|shield|\bpgo\b|celebrations|black bolt|white flare/.test(
      blob
    )
  ) {
    return 'modern';
  }
  if (
    /\bsm[\s:_-]|\bsm\d|\bxy\b|\bxy[\s:_-]|\bxy\d|sun\s*&?\s*moon|sun and moon|generations/.test(
      blob
    )
  ) {
    return 'sm_xy';
  }
  if (
    /\bbw[\s:_-]|\bbw\d|black\s*&?\s*white|black and white|heartgold|soulsilver|\bhgss|\bcol\d|call of legends|\bdp[\s:_-]|\bdp\d|\bpl\d|diamond|pearl|platinum/.test(
      blob
    )
  ) {
    return 'bw_dp';
  }
  return 'vintage';
}

function randomIndex(length: number): number {
  if (length <= 1) return 0;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] % length;
  }
  return Math.floor(Math.random() * length);
}

export function pickCandidateByEraBand<T>(
  candidates: T[],
  bandOf: (candidate: T) => PackEraBand
): T {
  if (candidates.length === 0) {
    throw new Error('pickCandidateByEraBand requires at least one candidate');
  }
  if (candidates.length === 1) return candidates[0];

  const groups = new Map<PackEraBand, T[]>();
  for (const candidate of candidates) {
    const band = bandOf(candidate);
    const list = groups.get(band);
    if (list) list.push(candidate);
    else groups.set(band, [candidate]);
  }

  const bands = [...groups.keys()];
  const chosenBand = bands[randomIndex(bands.length)];
  const group = groups.get(chosenBand) || candidates;
  return group[randomIndex(group.length)];
}

/** SQL predicate against card_mappings alias (setId / setName). */
export function eraBandSql(alias: string, band: PackEraBand): string {
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

export function stratifiedPoolSliceSizes(poolLimit: number): { bulk: number; chase: number } {
  const bandSize = Math.max(2, Math.floor(poolLimit / PACK_ERA_BANDS.length));
  const chase = Math.max(1, Math.floor(bandSize * 0.4));
  const bulk = Math.max(1, bandSize - chase);
  return { bulk, chase };
}

/**
 * One materialized canonical card list, then equal-sized random slices per era
 * band (bulk + chase) so SV/SWSH chase is not drowned by EX-era PSA 10 fodder.
 */
export function buildStratifiedPackPoolSql(imageColumns: string, exclusionSql: string): string {
  const outerImages = imageColumns.replace(/cm\./g, '');
  const slices = PACK_ERA_BANDS.map((band) => {
    const pred = eraBandSql('canonical', band);
    return `
      SELECT * FROM (
        SELECT * FROM canonical
        WHERE ${pred} AND latestPrice < ${PACK_POOL_CHASE_MIN}
        ORDER BY RANDOM() LIMIT ?
      )
      UNION ALL
      SELECT * FROM (
        SELECT * FROM canonical
        WHERE ${pred} AND latestPrice >= ${PACK_POOL_CHASE_MIN}
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
