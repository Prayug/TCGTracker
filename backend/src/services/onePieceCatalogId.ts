import { OPTCGCardResponse } from './providers/onePieceOptcgClient';

/** Stable unique id per OPTCG row (set + art + name). */
export function buildOnePieceCatalogId(raw: Pick<OPTCGCardResponse, 'set_id' | 'card_image_id' | 'card_name'>): string {
  return `${raw.set_id}::${raw.card_image_id}::${raw.card_name}`;
}

export function isOnePieceCatalogId(id: string): boolean {
  return id.includes('::');
}
