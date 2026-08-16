export { PACK_ERA_BANDS, pickCandidateByEraBand } from '@tcgtracker/shared';
export type { PackEraBand } from '@tcgtracker/shared';

/**
 * Pack-shop classifier — label regex, not catalog classifySetEra.
 * Re-exported under the historical name so pack odds stay unchanged.
 */
export { packEraBandFromSetLabel as packEraBandFromSet } from '@tcgtracker/shared';
