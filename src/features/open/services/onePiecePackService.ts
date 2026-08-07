import { OnePieceCard, OnePieceSet } from '../../../types/onepiece';
import { onePieceApi } from '../../../services/onepieceApi';
import { cacheService } from '../../../services/cacheService';
import {
  getSetConfig,
  normalizeCode,
  DON_SET_IDS,
  OnePieceSetOddsConfig,
  ALL_SET_CONFIGS,
  buildOddsRows,
} from '../data/setConfigs';
import {
  BoxSession,
  BulkOpenSession,
  OpenedPack,
  PullCard,
  RarityPools,
  Rng,
  SavedPull,
  OddsRow,
  RarityPoolMeta,
} from '../types';
import {
  toPullCard,
  isPackableRarity,
  isExcludedFromPacks,
  normalizeNumber,
  isReprintInsert,
} from './rarityClassifier';
import { openBox, openBoxes, openPack, shuffle, packMarketValue } from './packOdds';
import { BOXES_PER_CASE } from '../data/setConfigs';

const PULLS_KEY = 'op_sim_pulls_v1';

/**
 * Drop SP price outliers caused by bad TCGPlayer matches (e.g. $4800 on a
 * phantom SP). Keeps the card but clamps price to a sane SP band.
 */
function sanitizeSpPoolPrices(pools: RarityPools): void {
  const ABSOLUTE_SP_CAP = 800;
  const priced = pools.SP.map((c) => c.marketPrice ?? 0).filter((p) => p > 0).sort((a, b) => a - b);
  const median = priced.length > 0 ? priced[Math.floor(priced.length / 2)] : 100;
  const cap =
    priced.length >= 3 ? Math.min(Math.max(median * 8, 250), ABSOLUTE_SP_CAP) : ABSOLUTE_SP_CAP;
  for (const card of pools.SP) {
    if ((card.marketPrice ?? 0) > cap) {
      card.marketPrice = Math.min(median, ABSOLUTE_SP_CAP);
    }
  }
}

class OnePiecePackService {
  private poolsCache = new Map<string, RarityPools>();
  private setsCache: OnePieceSet[] = [];
  private rng: Rng = Math.random;

  /** Override the RNG (tests). */
  setRng(rng: Rng): void {
    this.rng = rng;
  }

  async getSets(): Promise<OnePieceSet[]> {
    if (this.setsCache.length > 0) return this.setsCache;
    try {
      const sets = await onePieceApi.getSets();
      this.setsCache = sets;
      return sets;
    } catch (error) {
      console.error('Failed to load One Piece sets:', error);
      return [];
    }
  }

  /**
   * Sets surfaced in the UI: main boosters OP-01…OP-16 always, plus extra
   * sets (EB/PRB) when present in the catalog.
   */
  async getOpenableSets(): Promise<OnePieceSetOddsConfig[]> {
    const live = await this.getSets();
    const liveCodes = new Set(live.map((s) => normalizeCode(s.id)));
    const available = ALL_SET_CONFIGS.filter((cfg) =>
      cfg.catalogIds.some((id) => liveCodes.has(normalizeCode(id)))
    );
    const ordered = [...available].sort((a, b) => {
      const rank = (c: string) => (c.startsWith('OP-') ? Number(c.slice(3)) : 99);
      return rank(a.code) - rank(b.code);
    });
    return ordered;
  }

  async getSetConfigForCode(code: string): Promise<OnePieceSetOddsConfig | null> {
    const available = await this.getOpenableSets();
    return available.find((c) => normalizeCode(c.code) === normalizeCode(code)) ?? null;
  }

  private async fetchSetCards(code: string): Promise<OnePieceCard[]> {
    const cfg = getSetConfig(code);
    if (!cfg) return [];
    for (const catalogId of cfg.catalogIds) {
      try {
        const cards = await onePieceApi.getSetCards(catalogId);
        if (cards.length > 0) return cards;
      } catch {
        /* try next catalog id */
      }
    }
    return [];
  }

  private async fetchDonCards(): Promise<OnePieceCard[]> {
    for (const id of DON_SET_IDS) {
      try {
        const cards = await onePieceApi.getSetCards(id);
        if (cards.length > 0) return cards;
      } catch {
        /* try next */
      }
    }
    return [];
  }

  /** Build rarity pools for a set from the catalog. */
  async getPools(code: string): Promise<RarityPools> {
    const cached = this.poolsCache.get(code);
    if (cached) return cached;

    const cards = await this.fetchSetCards(code);
    const pools: RarityPools = {
      C: [],
      UC: [],
      R: [],
      L: [],
      SR: [],
      SEC: [],
      AA: [],
      LAA: [],
      SP: [],
      TR: [],
      MANGA: [],
      SAA: [],
      DON: [],
    };
    const seen = new Set<string>();
    const pulls: PullCard[] = [];

    for (const card of cards) {
      if (!isPackableRarity(card.rarity)) continue;
      if (isExcludedFromPacks(card.name)) continue;
      const pull = toPullCard({
        id: card.id,
        name: card.name,
        number: card.number,
        rarity: card.rarity,
        imageUrl: card.images?.small || card.images?.large,
        marketPrice: card.marketPrice,
      });
      const key = `${pull.rarity}::${normalizeNumber(pull.number)}::${normalizeNumber(pull.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pulls.push(pull);
    }

    // Numbers that already have a real Red Super / manga / SAA entry in this set.
    const ultraChaseNumbers = new Set(
      pulls
        .filter((p) => p.rarity === 'SAA' || p.rarity === 'MANGA')
        .map((p) => normalizeNumber(p.number))
    );

    for (const pull of pulls) {
      // Catalog junk: native "Sabo (120) (SP)" that steals Red SAA / manga price & art.
      // Real reprint SPs (OP07-118 etc.) keep their SP slot.
      if (
        pull.rarity === 'SP' &&
        !isReprintInsert(pull.number, code) &&
        ultraChaseNumbers.has(normalizeNumber(pull.number))
      ) {
        continue;
      }
      if (pools[pull.rarity]) pools[pull.rarity].push(pull);
    }

    // Cap absurd SP outliers (bad price matches) so one $4800 listing can't dominate EV.
    sanitizeSpPoolPrices(pools);

    this.poolsCache.set(code, pools);
    return pools;
  }

  async getDonPool(): Promise<PullCard[]> {
    const cards = await this.fetchDonCards();
    return cards.map((c) =>
      toPullCard({
        id: c.id,
        name: c.name,
        number: c.number,
        rarity: c.rarity,
        imageUrl: c.images?.small || c.images?.large,
        marketPrice: c.marketPrice,
      })
    );
  }

  /** Drop cached pools so classifier / price fixes apply without a full reload. */
  invalidatePools(code?: string): void {
    if (code) this.poolsCache.delete(code);
    else this.poolsCache.clear();
  }

  async openSinglePack(code: string): Promise<OpenedPack> {
    const cfg = getSetConfig(code);
    if (!cfg) throw new Error(`Unknown set: ${code}`);
    this.invalidatePools(code);
    const pools = await this.getPools(code);
    return openPack(cfg, pools, this.rng, new Date().toISOString(), 'pack');
  }

  private toBoxSession(
    code: string,
    setName: string,
    packs: OpenedPack[],
    openedAt: string,
    boxIndex = 0
  ): BoxSession {
    const hits = packs
      .flatMap((p) => p.hits)
      .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
    const totalValue = packs.reduce((sum, p) => sum + packMarketValue(p), 0);
    return {
      id: `${code}-${openedAt}-box${boxIndex}`,
      code,
      setName,
      packs,
      openedAt,
      hits,
      totalValue,
    };
  }

  async openBoosterBox(code: string): Promise<BoxSession> {
    const cfg = getSetConfig(code);
    if (!cfg) throw new Error(`Unknown set: ${code}`);
    this.invalidatePools(code);
    const pools = await this.getPools(code);
    const donPool = cfg.hasDon ? await this.getDonPool() : [];
    const openedAt = new Date().toISOString();
    const packs = openBox(cfg, pools, this.rng, openedAt, donPool);
    return this.toBoxSession(code, cfg.name, packs, openedAt);
  }

  /** Open N boxes at once (skip animation). Case = 12 boxes. */
  async openBulkBoxes(code: string, boxCount: number): Promise<BulkOpenSession> {
    const cfg = getSetConfig(code);
    if (!cfg) throw new Error(`Unknown set: ${code}`);
    const n = Math.max(1, Math.min(48, Math.floor(boxCount)));
    this.invalidatePools(code);
    const pools = await this.getPools(code);
    const donPool = cfg.hasDon ? await this.getDonPool() : [];
    const openedAt = new Date().toISOString();
    const boxPacks = openBoxes(cfg, pools, this.rng, openedAt, n, donPool);
    const boxes = boxPacks.map((packs, i) =>
      this.toBoxSession(code, cfg.name, packs, openedAt, i)
    );
    const hits = boxes
      .flatMap((b) => b.hits)
      .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
    const totalValue = boxes.reduce((sum, b) => sum + b.totalValue, 0);
    return {
      id: `${code}-${openedAt}-bulk${n}`,
      code,
      setName: cfg.name,
      boxes,
      boxCount: n,
      packCount: boxes.reduce((s, b) => s + b.packs.length, 0),
      openedAt,
      hits,
      totalValue,
      isCase: n === BOXES_PER_CASE,
    };
  }

  async openCase(code: string): Promise<BulkOpenSession> {
    return this.openBulkBoxes(code, BOXES_PER_CASE);
  }

  async getOdds(code: string): Promise<{ rows: OddsRow[]; meta: RarityPoolMeta }> {
    const cfg = getSetConfig(code);
    if (!cfg) return { rows: [], meta: { count: 0 } };
    let pools: RarityPools;
    try {
      pools = await this.getPools(code);
    } catch {
      pools = {
        C: [],
        UC: [],
        R: [],
        L: [],
        SR: [],
        SEC: [],
        AA: [],
        LAA: [],
        SP: [],
        TR: [],
        MANGA: [],
        SAA: [],
        DON: [],
      };
    }
    const meta: RarityPoolMeta = {
      count:
        pools.AA.length +
        pools.SP.length +
        pools.TR.length +
        pools.MANGA.length +
        pools.SEC.length,
    };
    return { rows: buildOddsRows(cfg, meta), meta };
  }

  // ---- Saved pulls collection (localStorage) ----

  getSavedPulls(): SavedPull[] {
    try {
      const raw = localStorage.getItem(PULLS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SavedPull[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  savePulls(pulls: PullCard[], code: string, setName: string, openedAt?: string): void {
    try {
      const existing = this.getSavedPulls();
      const entries: SavedPull[] = pulls.map((card) => ({
        card,
        code,
        setName,
        openedAt: openedAt ?? new Date().toISOString(),
      }));
      localStorage.setItem(PULLS_KEY, JSON.stringify([...entries, ...existing]));
    } catch (error) {
      console.error('Failed to save pulls:', error);
    }
  }

  removePull(pullId: string): void {
    try {
      const existing = this.getSavedPulls();
      localStorage.setItem(
        PULLS_KEY,
        JSON.stringify(existing.filter((p) => p.card.id !== pullId))
      );
    } catch {
      /* noop */
    }
  }

  clearPulls(): void {
    try {
      localStorage.removeItem(PULLS_KEY);
    } catch {
      /* noop */
    }
  }
}

export function rarityRank(rarity: string): number {
  const order: Record<string, number> = {
    SAA: 0,
    MANGA: 1,
    TR: 2,
    SP: 3,
    SEC: 4,
    LAA: 5,
    AA: 6,
    SR: 7,
    L: 8,
    R: 9,
    UC: 10,
    C: 11,
    DON: 12,
  };
  return order[rarity] ?? 99;
}

export function sortPullsBestFirst<T extends { rarity: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
}

export function shuffleSessionPacks(packs: OpenedPack[]): OpenedPack[] {
  return shuffle(packs, Math.random);
}

export const onePiecePackService = new OnePiecePackService();

/** Load odds for the default set on first visit. */
export function getDefaultSetCode(): string {
  return 'OP-05';
}

export { cacheService };
