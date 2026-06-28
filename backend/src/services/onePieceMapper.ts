import { OPTCGCardResponse } from './providers/onePieceOptcgClient';
import { buildOnePieceCatalogId } from './onePieceCatalogId';

export interface OnePieceCatalogRow {
  catalogId: string;
  cardSetId: string;
  cardImageId: string;
  cardName: string;
  setId: string;
  setName: string;
  rarity: string | null;
  cardColor: string | null;
  cardType: string | null;
  cardCost: string | null;
  cardPower: string | null;
  counterAmount: number | null;
  life: string | null;
  subTypes: string | null;
  attribute: string | null;
  cardText: string | null;
  imageUrl: string | null;
  marketPrice: number | null;
  inventoryPrice: number | null;
  latestMarketPrice?: number | null;
  latestInventoryPrice?: number | null;
}

export function mapRawToCatalogFields(raw: OPTCGCardResponse) {
  return {
    catalogId: buildOnePieceCatalogId(raw),
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
    counterAmount: raw.counter_amount ?? null,
    life: raw.life || null,
    subTypes: raw.sub_types || null,
    attribute: raw.attribute || null,
    cardText: raw.card_text || null,
    imageUrl: raw.card_image || null,
    marketPrice: raw.market_price ?? null,
    inventoryPrice: raw.inventory_price ?? null,
  };
}

export function mapRawToApiCard(raw: OPTCGCardResponse, source = 'optcg_live') {
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
    counterAmount: fields.counterAmount ?? undefined,
    life: fields.life || undefined,
    subTypes: fields.subTypes || undefined,
    attribute: fields.attribute || undefined,
    cardText: fields.cardText || undefined,
    marketPrice: fields.marketPrice ?? undefined,
    inventoryPrice: fields.inventoryPrice ?? undefined,
    source,
  };
}

export function mapRowToApiCard(row: OnePieceCatalogRow, source = 'local_database') {
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
    counterAmount: row.counterAmount ?? undefined,
    life: row.life || undefined,
    subTypes: row.subTypes || undefined,
    attribute: row.attribute || undefined,
    cardText: row.cardText || undefined,
    marketPrice:
      typeof row.latestMarketPrice === 'number'
        ? row.latestMarketPrice
        : row.marketPrice ?? undefined,
    inventoryPrice:
      typeof row.latestInventoryPrice === 'number'
        ? row.latestInventoryPrice
        : row.inventoryPrice ?? undefined,
    source,
  };
}

export function cardMatchesQuery(raw: OPTCGCardResponse, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return false;

  // Match card name, number, set, and crew/subtype — NOT card_text (effect text
  // references other characters, e.g. Boa Hancock mentioning Monkey.D.Luffy).
  return (
    raw.card_name.toLowerCase().includes(q) ||
    raw.card_set_id.toLowerCase().includes(q) ||
    raw.set_name.toLowerCase().includes(q) ||
    Boolean(raw.sub_types?.toLowerCase().includes(q))
  );
}
