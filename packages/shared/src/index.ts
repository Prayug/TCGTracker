export { normalizeVariantKey, canonicalFinishVariantKey } from './normalizeVariantKey';

export { scoreVariantMatch } from './variantMatch';

export { queryContainsCjk, queryContainsNonEnglishScript } from './scriptDetection';

export type { ListingPriceFields } from './resolveListingPrice';
export {
  isCoherentMarketPrice,
  isAskWallPrice,
  resolveListingPrice,
  resolveHistoryPointPrice,
  extractBestListingPrice,
} from './resolveListingPrice';

export type { EraGroup } from './setEra';
export {
  ERA_GROUPS,
  ERA_ORDER,
  classifySetEra,
  getEraLabel,
  parseReleaseDate,
  compareSetsByEraAndRelease,
  sortSetsForDisplay,
  resolveSetImages,
  formatReleaseYear,
} from './setEra';

export type { PackEraBand } from './packEraBand';
export {
  PACK_ERA_BANDS,
  PACK_POOL_CHASE_MIN,
  eraToPackBand,
  packEraBandFromSet,
  packEraBandFromSetLabel,
  pickCandidateByEraBand,
  eraBandSql,
  stratifiedPoolSliceSizes,
  buildStratifiedPackPoolSql,
} from './packEraBand';
