import { OPTCGCardResponse } from './providers/onePieceOptcgClient';

/** Stable unique id per OPTCG row (set + art + name). */
export function buildOnePieceCatalogId(raw: Pick<OPTCGCardResponse, 'set_id' | 'card_image_id' | 'card_name'>): string {
  return `${raw.set_id}::${raw.card_image_id}::${raw.card_name}`;
}

export function isOnePieceCatalogId(id: string): boolean {
  return id.includes('::');
}

export function parseOnePieceCatalogId(
  id: string
): { setId: string; cardImageId: string; cardName: string } | null {
  if (!id.includes('::')) return null;
  const [setId, cardImageId, ...rest] = id.split('::');
  const cardName = rest.join('::');
  if (!setId || !cardImageId) return null;
  return { setId, cardImageId, cardName };
}
