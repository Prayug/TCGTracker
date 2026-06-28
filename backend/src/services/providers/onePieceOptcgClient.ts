import { buildOnePieceCatalogId } from '../onePieceCatalogId';

const BASE_URL = 'https://optcgapi.com/api';

export interface OPTCGSetResponse {
  set_name: string;
  set_id: string;
}

export interface OPTCGDeckResponse {
  structure_deck_name: string;
  structure_deck_id: string;
}

export interface OPTCGCardResponse {
  inventory_price: number;
  market_price: number;
  card_name: string;
  set_name: string;
  card_text: string;
  set_id: string;
  rarity: string;
  card_set_id: string;
  card_color: string;
  card_type: string;
  life: string | null;
  card_cost: string | null;
  card_power: string | null;
  sub_types: string | null;
  counter_amount: number | null;
  attribute: string | null;
  date_scraped: string;
  card_image_id: string;
  card_image: string;
}

interface OPTCGDonResponse {
  inventory_price: number;
  market_price: number;
  card_name: string;
  card_text: string;
  rarity: string;
  card_type: string;
  don_id: string | null;
  date_scraped: string;
  card_image_id: string;
  card_image: string;
  optcg_don_name?: string;
}

const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000;
let cachedCatalog: { fetchedAt: number; cards: OPTCGCardResponse[] } | null = null;

export async function fetchOptcgJson<T>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`OPTCG API ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

const normalizeDonCard = (raw: OPTCGDonResponse): OPTCGCardResponse => ({
  inventory_price: raw.inventory_price,
  market_price: raw.market_price,
  card_name: raw.card_name,
  set_name: "Don!! Cards",
  card_text: raw.card_text || '',
  set_id: 'DON',
  rarity: raw.rarity || 'DON!!',
  card_set_id: raw.card_image_id || raw.optcg_don_name || raw.card_name,
  card_color: '',
  card_type: raw.card_type || 'DON!!',
  life: null,
  card_cost: null,
  card_power: null,
  sub_types: null,
  counter_amount: null,
  attribute: null,
  date_scraped: raw.date_scraped,
  card_image_id: raw.card_image_id,
  card_image: raw.card_image,
});

const dedupeCards = (cards: OPTCGCardResponse[]): OPTCGCardResponse[] => {
  const seen = new Map<string, OPTCGCardResponse>();
  for (const card of cards) {
    seen.set(buildOnePieceCatalogId(card), card);
  }
  return Array.from(seen.values());
};

/**
 * Fetch the complete English OPTCG catalog:
 * booster sets + starter decks + promos + Don!! cards (~5,300+ rows).
 */
export async function getAllOptcgCards(forceRefresh = false): Promise<OPTCGCardResponse[]> {
  if (!forceRefresh && cachedCatalog && Date.now() - cachedCatalog.fetchedAt < CATALOG_CACHE_TTL_MS) {
    return cachedCatalog.cards;
  }

  const [setCards, stCards, promoCards, donCards] = await Promise.all([
    fetchOptcgJson<OPTCGCardResponse[]>('/allSetCards/'),
    fetchOptcgJson<OPTCGCardResponse[]>('/allSTCards/'),
    fetchOptcgJson<OPTCGCardResponse[]>('/promos/filtered/?card_name='),
    fetchOptcgJson<OPTCGDonResponse[]>('/allDonCards/').then((rows) => rows.map(normalizeDonCard)),
  ]);

  const merged = dedupeCards([...setCards, ...stCards, ...promoCards, ...donCards]);
  cachedCatalog = { fetchedAt: Date.now(), cards: merged };
  return merged;
}

export async function getOptcgSets(): Promise<OPTCGSetResponse[]> {
  const [boosters, decks] = await Promise.all([
    fetchOptcgJson<OPTCGSetResponse[]>('/allSets/'),
    fetchOptcgJson<OPTCGDeckResponse[]>('/allDecks/'),
  ]);

  const starterSets: OPTCGSetResponse[] = decks.map((d) => ({
    set_id: d.structure_deck_id,
    set_name: d.structure_deck_name,
  }));

  return [
    ...boosters,
    ...starterSets,
    { set_id: 'PROMO', set_name: 'Promo Cards' },
    { set_id: 'DON', set_name: 'Don!! Cards' },
  ];
}

export async function getOptcgSetCards(setId: string): Promise<OPTCGCardResponse[]> {
  if (setId === 'PROMO') {
    return fetchOptcgJson<OPTCGCardResponse[]>('/promos/filtered/?card_name=');
  }
  if (setId === 'DON') {
    const don = await fetchOptcgJson<OPTCGDonResponse[]>('/allDonCards/');
    return don.map(normalizeDonCard);
  }
  if (setId.startsWith('ST-')) {
    const all = await fetchOptcgJson<OPTCGCardResponse[]>('/allSTCards/');
    return all.filter((c) => c.set_id === setId);
  }

  return fetchOptcgJson<OPTCGCardResponse[]>(`/sets/${encodeURIComponent(setId)}/`);
}

export async function getOptcgCardVariants(cardSetId: string): Promise<OPTCGCardResponse[]> {
  const all = await getAllOptcgCards();
  const matches = all.filter((c) => c.card_set_id === cardSetId);
  if (matches.length > 0) return matches;

  try {
    const data = await fetchOptcgJson<OPTCGCardResponse | OPTCGCardResponse[]>(
      `/sets/card/${encodeURIComponent(cardSetId)}/`
    );
    return Array.isArray(data) ? data : [data];
  } catch {
    try {
      const promo = await fetchOptcgJson<OPTCGCardResponse | OPTCGCardResponse[]>(
        `/promos/card/${encodeURIComponent(cardSetId)}/`
      );
      return Array.isArray(promo) ? promo : [promo];
    } catch {
      return [];
    }
  }
}

export function clearOptcgCatalogCache(): void {
  cachedCatalog = null;
}
