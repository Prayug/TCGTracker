/** Sources allowed when building a raw/ungraded series for forecasting. */
export const PREDICTION_PRICE_SOURCES = [
  'pricecharting_sold', // sold-guide comps (preferred)
  'tcgcsv',
  'tcgdex',
  'catalog_fallback',
] as const;

export type PredictionPriceSource = (typeof PREDICTION_PRICE_SOURCES)[number];

/** SQL IN-list fragment for prediction history queries. */
export const PREDICTION_SOURCES_SQL = PREDICTION_PRICE_SOURCES.map((s) => `'${s}'`).join(', ');

/**
 * Prefer sold-guide over listing feeds when deduping the same calendar day.
 * Lower rank = higher preference.
 */
export function predictionSourceRank(source: string | undefined): number {
  const idx = PREDICTION_PRICE_SOURCES.indexOf(source as PredictionPriceSource);
  return idx >= 0 ? idx : PREDICTION_PRICE_SOURCES.length + 1;
}
