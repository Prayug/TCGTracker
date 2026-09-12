import { CatalogCardSummary, CatalogProvider, CatalogSetSummary } from './contracts';
import { logger } from '../../utils/logger';
import { resolveMatchName } from '../../utils/matchName';

const TCGDEX_JA_BASE = 'https://api.tcgdex.net/v2/ja';
const REQUEST_TIMEOUT_MS = 12_000;
const DETAIL_CONCURRENCY = 8;

/** High-liquidity JP sets to sync first (PriceCharting coverage + investable). */
export const JA_PRIORITY_SET_IDS = [
  'SV2a', // ポケモンカード151
  'SV4a', // シャイニートレジャーex
  'S12a', // VSTARユニバース
  'SV5a', // クリムゾンヘイズ / related modern
  'SV6a', // ナイトワンダラー
  'SV7a', // 楽園ドラゴーナ
  'SV8a', // テラスタルフェスex
  'SV1a', // トリプレットビート
  'SV1S', // スカーレットex
  'SV1V', // バイオレットex
  'SV3a', // レイジングサーフ
  'SV5K', // ワイルドフォース
  'SV5M', // サイバージャッジ
];

interface TcgdexSetBrief {
  id: string;
  name: string;
  releaseDate?: string;
}

interface TcgdexCardBrief {
  id: string;
  localId?: string;
  name: string;
  image?: string;
}

interface TcgdexCardDetail {
  id: string;
  name: string;
  localId?: string;
  category?: string;
  illustrator?: string;
  image?: string;
  rarity?: string;
  types?: string[];
  dexId?: number | number[];
  suffix?: string;
  set?: {
    id: string;
    name: string;
    releaseDate?: string;
    cardCount?: { official?: number; total?: number };
  };
  pricing?: {
    tcgplayer?: Record<
      string,
      {
        productId?: number;
        marketPrice?: number | null;
        midPrice?: number | null;
        lowPrice?: number | null;
        highPrice?: number | null;
      }
    >;
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`TCGdex JA fetch failed (${response.status}): ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

const toImageUrls = (imageBase?: string): { small?: string; large?: string } => {
  if (!imageBase) return {};
  return {
    small: `${imageBase}/low.webp`,
    large: `${imageBase}/high.webp`,
  };
};

const firstDexId = (dexId?: number | number[]): number | undefined => {
  if (dexId == null) return undefined;
  return Array.isArray(dexId) ? dexId[0] : dexId;
};

const mapCard = (
  brief: TcgdexCardBrief,
  detail: TcgdexCardDetail | null,
  setDetail: { id: string; name: string; releaseDate?: string }
): CatalogCardSummary => {
  const name = detail?.name || brief.name;
  const dexId = firstDexId(detail?.dexId);
  const matchName = resolveMatchName({
    language: 'ja',
    cardName: name,
    dexId,
    suffix: detail?.suffix,
    category: detail?.category,
  });
  const images = toImageUrls(detail?.image || brief.image);

  let tcgplayerProductId: string | undefined;
  let tcgplayerPrices: CatalogCardSummary['tcgplayerPrices'];
  if (detail?.pricing?.tcgplayer) {
    tcgplayerPrices = {};
    for (const [variant, entry] of Object.entries(detail.pricing.tcgplayer)) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.productId != null && !tcgplayerProductId) {
        tcgplayerProductId = String(entry.productId);
      }
      tcgplayerPrices[variant] = {
        low: entry.lowPrice ?? undefined,
        mid: entry.midPrice ?? undefined,
        high: entry.highPrice ?? undefined,
        market: entry.marketPrice ?? undefined,
      };
    }
  }

  return {
    cardId: (detail?.id || brief.id).toLowerCase(),
    cardName: name,
    setId: setDetail.id,
    setName: setDetail.name,
    setReleaseDate: setDetail.releaseDate || detail?.set?.releaseDate,
    cardNumber: detail?.localId || brief.localId,
    rarity: detail?.rarity,
    artist: detail?.illustrator,
    types: detail?.types,
    imageSmall: images.small,
    imageLarge: images.large,
    tcgplayerProductId,
    tcgplayerPrices,
    language: 'ja',
    matchName,
    dexId,
  };
};

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Catalog provider for Japanese Pokemon cards via TCGdex `/v2/ja`.
 * Prefer modern Scarlet/Violet-era sets first when syncing.
 */
export class TcgdexJaCatalogProvider implements CatalogProvider {
  async getSets(limit = 250): Promise<CatalogSetSummary[]> {
    const sets = (await fetchJson<TcgdexSetBrief[]>(`${TCGDEX_JA_BASE}/sets`)) || [];
    const priorityRank = new Map(
      JA_PRIORITY_SET_IDS.map((id, i) => [id.toLowerCase(), JA_PRIORITY_SET_IDS.length - i])
    );

    const scored = sets.map((s) => {
      const id = (s.id || '').toLowerCase();
      let score = priorityRank.get(id) ?? 0;
      if (/^sv/.test(id)) score += 100;
      if (/^s\d|^swsh|^svp/.test(id)) score += 50;
      if (/151|vstar|shiny|ex/.test(id + (s.name || '').toLowerCase())) score += 20;
      return { set: s, score };
    });
    scored.sort((a, b) => b.score - a.score || a.set.id.localeCompare(b.set.id));
    return scored.slice(0, limit).map(({ set }) => ({
      id: set.id,
      name: set.name,
      releaseDate: set.releaseDate,
    }));
  }

  /** Sync only the listed set IDs (used for fast bootstrap). */
  async getPrioritySets(limit = JA_PRIORITY_SET_IDS.length): Promise<CatalogSetSummary[]> {
    const all = await this.getSets(500);
    const byId = new Map(all.map((s) => [s.id.toLowerCase(), s]));
    const ordered: CatalogSetSummary[] = [];
    for (const id of JA_PRIORITY_SET_IDS) {
      const hit = byId.get(id.toLowerCase());
      if (hit) ordered.push(hit);
    }
    // Fill remainder with other high-scoring modern sets.
    for (const s of all) {
      if (ordered.length >= limit) break;
      if (!ordered.some((o) => o.id.toLowerCase() === s.id.toLowerCase())) {
        ordered.push(s);
      }
    }
    return ordered.slice(0, limit);
  }

  async getCardsForSet(setId: string): Promise<CatalogCardSummary[]> {
    const setUrl = `${TCGDEX_JA_BASE}/sets/${encodeURIComponent(setId)}`;
    const setDetail = await fetchJson<{
      id: string;
      name: string;
      releaseDate?: string;
      cards?: TcgdexCardBrief[];
    }>(setUrl);

    if (!setDetail?.cards?.length) {
      return [];
    }

    const briefs = setDetail.cards;
    const details = await mapPool(briefs, DETAIL_CONCURRENCY, async (brief) => {
      try {
        return await fetchJson<TcgdexCardDetail>(
          `${TCGDEX_JA_BASE}/cards/${encodeURIComponent(brief.id)}`
        );
      } catch (error) {
        logger.debug('TCGdex JA card detail failed', {
          cardId: brief.id,
          error: (error as Error).message,
        });
        return null;
      }
    });

    return briefs.map((brief, i) => mapCard(brief, details[i], setDetail));
  }

  /**
   * Live name search across the full JA catalog (includes unsynced sets/promos).
   * Uses TCGdex filters, then hydrates card details for Browse-ready rows.
   */
  async searchCardsByName(name: string, limit = 250): Promise<CatalogCardSummary[]> {
    const trimmed = name.trim();
    if (trimmed.length < 2) return [];

    const briefs =
      (await fetchJson<TcgdexCardBrief[]>(
        `${TCGDEX_JA_BASE}/cards?name=${encodeURIComponent(trimmed)}`
      )) || [];

    const capped = briefs.slice(0, Math.min(Math.max(limit, 1), 500));
    if (!capped.length) return [];

    const details = await mapPool(capped, DETAIL_CONCURRENCY, async (brief) => {
      try {
        return await fetchJson<TcgdexCardDetail>(
          `${TCGDEX_JA_BASE}/cards/${encodeURIComponent(brief.id)}`
        );
      } catch {
        return null;
      }
    });

    return capped.map((brief, i) => {
      const detail = details[i];
      const setMeta = {
        id: detail?.set?.id || brief.id.split('-').slice(0, -1).join('-') || brief.id,
        name: detail?.set?.name || '',
        releaseDate: detail?.set?.releaseDate,
      };
      return mapCard(brief, detail, setMeta);
    });
  }
}

export const tcgdexJaCatalogProvider = new TcgdexJaCatalogProvider();
