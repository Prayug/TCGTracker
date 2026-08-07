import { OpRarity, OpenedPack, PullCard, RarityPools, Rng } from '../types';
import { BOXES_PER_CASE, OnePieceSetOddsConfig } from '../data/setConfigs';

/**
 * Pure odds engine — no I/O.
 *
 * English pack (12 cards), reveal order front→back:
 *   Standard: shuffled C×7, shuffled UC×3, Rare, Hit  (hit last)
 *   Extra (EB): shuffled C×10, Rare, Hit
 *
 * Hit-slot probabilities come from set config averages ÷ packs-per-box
 * (and case-level rarities ÷ packs-per-case). Remainder fills with Rare.
 *
 * Boxes use a soft budget (expected counts with fractional Bernoulli + light
 * variance) so SEC/LAA are not hard-guaranteed every box.
 */

export interface HitSlotOdds {
  rarity: OpRarity;
  probability: number;
}

export function computeHitSlotOdds(cfg: OnePieceSetOddsConfig, pools: RarityPools): HitSlotOdds[] {
  const box = cfg.boxPacks;
  const casePacks = box * BOXES_PER_CASE;
  const perPack = (countPerBox: number) => countPerBox / box;
  const perCase = (countPerCase: number) => countPerCase / casePacks;

  const odds: HitSlotOdds[] = [
    { rarity: 'L', probability: cfg.leadersPerBox > 0 && pools.L.length > 0 ? perPack(cfg.leadersPerBox) : 0 },
    { rarity: 'SR', probability: cfg.srPerBox > 0 && pools.SR.length > 0 ? perPack(cfg.srPerBox) : 0 },
    { rarity: 'AA', probability: cfg.aaPerBox > 0 && pools.AA.length > 0 ? perPack(cfg.aaPerBox) : 0 },
    { rarity: 'LAA', probability: cfg.laaPerBox > 0 && pools.LAA.length > 0 ? perPack(cfg.laaPerBox) : 0 },
    { rarity: 'SEC', probability: cfg.secPerBox > 0 && pools.SEC.length > 0 ? perPack(cfg.secPerBox) : 0 },
    { rarity: 'SP', probability: cfg.spPerCase > 0 && pools.SP.length > 0 ? perCase(cfg.spPerCase) : 0 },
    { rarity: 'TR', probability: cfg.trPerCase > 0 && pools.TR.length > 0 ? perCase(cfg.trPerCase) : 0 },
    {
      rarity: 'MANGA',
      probability:
        cfg.mangaPerCases > 0 && pools.MANGA.length > 0
          ? 1 / (cfg.mangaPerCases * casePacks)
          : 0,
    },
    {
      rarity: 'SAA',
      probability:
        cfg.saaPerBoxes > 0 && pools.SAA.length > 0 ? 1 / (cfg.saaPerBoxes * box) : 0,
    },
  ];

  const used = odds.reduce((sum, o) => sum + o.probability, 0);
  const remaining = Math.max(1 - used, 0);
  if (pools.R.length > 0 && remaining > 0) {
    odds.push({ rarity: 'R', probability: remaining });
  }
  return odds.filter((o) => o.probability > 0);
}

export function rollRarity(odds: HitSlotOdds[], rng: Rng): OpRarity {
  const roll = rng();
  let cumulative = 0;
  for (const o of odds) {
    cumulative += o.probability;
    if (roll <= cumulative) return o.rarity;
  }
  return odds[odds.length - 1]?.rarity ?? 'R';
}

export interface BoxBudget {
  L: number;
  SR: number;
  AA: number;
  LAA: number;
  SEC: number;
  SP: number;
  TR: number;
  MANGA: number;
  SAA: number;
}

/** Soft expected count: floor + Bernoulli fraction, then ±1 noise (~15%). */
export function softCount(expected: number, rng: Rng): number {
  if (expected <= 0) return 0;
  const base = Math.floor(expected);
  let n = base + (rng() < expected - base ? 1 : 0);
  if (rng() < 0.15) {
    n += rng() < 0.5 ? -1 : 1;
  }
  return Math.max(0, n);
}

/**
 * Soft box budget from expected averages. Case-level hits (SP/TR/Manga) are
 * Bernoulli at per-box odds derived from case rates.
 */
export function rollBoxBudget(cfg: OnePieceSetOddsConfig, pools: RarityPools, rng: Rng): BoxBudget {
  const budget: BoxBudget = {
    L: pools.L.length > 0 ? softCount(cfg.leadersPerBox, rng) : 0,
    SR: pools.SR.length > 0 ? softCount(cfg.srPerBox, rng) : 0,
    AA: pools.AA.length > 0 ? softCount(cfg.aaPerBox, rng) : 0,
    LAA: pools.LAA.length > 0 ? softCount(cfg.laaPerBox, rng) : 0,
    SEC: pools.SEC.length > 0 ? softCount(cfg.secPerBox, rng) : 0,
    SP: 0,
    TR: 0,
    MANGA: 0,
    SAA: 0,
  };
  // Per-box chance of a case-mapped hit ≈ countPerCase / boxesPerCase
  if (cfg.spPerCase > 0 && pools.SP.length > 0 && rng() < cfg.spPerCase / BOXES_PER_CASE) {
    budget.SP = 1;
  }
  if (cfg.trPerCase > 0 && pools.TR.length > 0 && rng() < cfg.trPerCase / BOXES_PER_CASE) {
    budget.TR = 1;
  }
  if (
    cfg.mangaPerCases > 0 &&
    pools.MANGA.length > 0 &&
    rng() < 1 / (cfg.mangaPerCases * BOXES_PER_CASE)
  ) {
    budget.MANGA = 1;
  }
  // Ultra chase: ≈1 / saaPerBoxes chance this box gets a Red Super Alt Art.
  if (cfg.saaPerBoxes > 0 && pools.SAA.length > 0 && rng() < 1 / cfg.saaPerBoxes) {
    budget.SAA = 1;
  }
  return budget;
}

function pickUniform<T>(items: T[], rng: Rng): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(rng() * items.length)];
}

/** Prefer unique picks; refill with replacement when the pool is thin. */
function pickRandom<T>(items: T[], count: number, rng: Rng): T[] {
  if (items.length === 0 || count <= 0) return [];
  const copy = [...items];
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    if (copy.length > 0) {
      const idx = Math.floor(rng() * copy.length);
      out.push(copy.splice(idx, 1)[0]);
    } else {
      out.push(items[Math.floor(rng() * items.length)]);
    }
  }
  return out;
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickFromPool(pool: PullCard[], rng: Rng, fallback: PullCard[]): PullCard | undefined {
  return pickUniform(pool, rng) ?? pickUniform(fallback, rng);
}

export function fanCardsForPack(pack: OpenedPack): PullCard[] {
  if (!pack.donCard) return pack.cards;
  if (pack.cards.some((c) => c.id === pack.donCard!.id)) return pack.cards;
  return [...pack.cards, pack.donCard];
}

export function packMarketValue(pack: OpenedPack): number {
  return fanCardsForPack(pack).reduce((sum, c) => sum + (c.marketPrice ?? 0), 0);
}

function poolForHit(pools: RarityPools, rarity: OpRarity): PullCard[] {
  const map: Partial<Record<OpRarity, PullCard[]>> = {
    R: pools.R,
    UC: pools.UC,
    L: pools.L,
    SR: pools.SR,
    AA: pools.AA,
    LAA: pools.LAA,
    SEC: pools.SEC,
    SP: pools.SP,
    TR: pools.TR,
    MANGA: pools.MANGA,
    SAA: pools.SAA,
  };
  return map[rarity] ?? [];
}

/** Build one 12-card pack. Hit slot is always last. */
export function buildPack(
  cfg: OnePieceSetOddsConfig,
  pools: RarityPools,
  rng: Rng,
  opts: { hitRarity?: OpRarity } = {}
): PullCard[] {
  const isExtra = cfg.packStructure === 'extra';
  const commons = pickRandom(pools.C, isExtra ? 10 : 7, rng);
  const uncommons = isExtra ? [] : pickRandom(pools.UC, 3, rng);
  const rare = pickFromPool(pools.R, rng, pools.UC) ?? pickFromPool(pools.C, rng, []);

  const hitRarity = opts.hitRarity ?? rollRarity(computeHitSlotOdds(cfg, pools), rng);
  let hit = pickUniform(poolForHit(pools, hitRarity), rng);
  if (!hit) {
    hit = pickFromPool(pools.R, rng, pools.UC) ?? pickFromPool(pools.C, rng, []);
  }

  // Shuffle within C / UC bands so pack order isn't deterministic by pool index.
  const cards = [
    ...shuffle(commons, rng),
    ...shuffle(uncommons, rng),
    ...(rare ? [rare] : []),
    ...(hit ? [hit] : []),
  ];

  const filler = [...pools.C, ...pools.UC, ...pools.R];
  while (cards.length < 12 && filler.length > 0) {
    const pad = pickUniform(filler, rng);
    if (!pad) break;
    // Insert pads before the hit so the hit stays last when possible.
    cards.splice(Math.max(0, cards.length - 1), 0, pad);
  }

  return cards.slice(0, 12);
}

/** Replace a pack with an all-chase god pack. */
export function buildGodPack(
  cfg: OnePieceSetOddsConfig,
  pools: RarityPools,
  rng: Rng
): PullCard[] | null {
  if (!cfg.godPack) return null;
  const pool =
    cfg.godPack.kind === 'manga'
      ? pools.MANGA
      : cfg.godPack.kind === 'sp'
        ? pools.SP
        : pools.SEC;
  if (pool.length === 0) return null;
  const count = Math.min(cfg.godPack.cardCount, 12);
  const cards = pickRandom(pool, count, rng);
  // Pad to 12 with more from the same chase pool (with replacement).
  while (cards.length < 12) {
    const extra = pickUniform(pool, rng);
    if (!extra) break;
    cards.push(extra);
  }
  return cards;
}

export interface BuiltPack extends OpenedPack {
  hits: PullCard[];
}

export function openPack(
  cfg: OnePieceSetOddsConfig,
  pools: RarityPools,
  rng: Rng,
  openedAt: string,
  mode: 'pack' | 'box' = 'pack',
  boxIndex?: number,
  packIndexInBox?: number
): BuiltPack {
  const cards = buildPack(cfg, pools, rng);
  return {
    id: `${cfg.code}-${openedAt}-${rng().toString(36).slice(2, 8)}`,
    code: cfg.code,
    setName: cfg.name,
    cards,
    openedAt,
    mode,
    boxIndex,
    packIndexInBox,
    hits: cards.filter((c) => c.isChase),
  };
}

export function openBox(
  cfg: OnePieceSetOddsConfig,
  pools: RarityPools,
  rng: Rng,
  openedAt: string,
  donPool?: PullCard[],
  boxIndex = 0
): BuiltPack[] {
  const budget = rollBoxBudget(cfg, pools, rng);

  const assignments: OpRarity[] = [];
  (['SAA', 'MANGA', 'TR', 'SP', 'SEC', 'LAA', 'AA', 'SR', 'L'] as OpRarity[]).forEach((r) => {
    const key = r as keyof BoxBudget;
    for (let i = 0; i < budget[key]; i++) assignments.push(r);
  });
  while (assignments.length < cfg.boxPacks) assignments.push('R');
  const shuffledAssignments = shuffle(assignments, rng).slice(0, cfg.boxPacks);

  const packs = shuffledAssignments.map((rarity, index) => {
    const cards = buildPack(cfg, pools, rng, { hitRarity: rarity });
    return {
      id: `${cfg.code}-${openedAt}-box${rng().toString(36).slice(2, 8)}-${boxIndex}-${index}`,
      code: cfg.code,
      setName: cfg.name,
      cards,
      openedAt,
      mode: 'box' as const,
      boxIndex,
      packIndexInBox: index + 1,
      hits: cards.filter((c) => c.isChase),
    };
  });

  // God pack: replace one random pack with a full chase pack.
  if (cfg.godPack && rng() < 1 / (cfg.godPack.perCases * BOXES_PER_CASE)) {
    const godCards = buildGodPack(cfg, pools, rng);
    if (godCards) {
      const target = packs[Math.floor(rng() * packs.length)];
      target.cards = godCards;
      target.hits = godCards.filter((c) => c.isChase);
    }
  }

  if (cfg.hasDon && donPool && donPool.length > 0) {
    const don = pickUniform(donPool, rng);
    const target = packs[Math.floor(rng() * packs.length)];
    if (don) target.donCard = don;
  }

  return packs;
}

/** Open N boxes (case = 12). Returns flat pack list plus per-box groups. */
export function openBoxes(
  cfg: OnePieceSetOddsConfig,
  pools: RarityPools,
  rng: Rng,
  openedAt: string,
  boxCount: number,
  donPool?: PullCard[]
): BuiltPack[][] {
  const boxes: BuiltPack[][] = [];
  for (let i = 0; i < boxCount; i++) {
    boxes.push(openBox(cfg, pools, rng, openedAt, donPool, i));
  }
  return boxes;
}

export function boxExpectedHits(cfg: OnePieceSetOddsConfig): Record<string, string> {
  return {
    Leaders: `~${cfg.leadersPerBox}`,
    'Super Rares': `~${cfg.srPerBox}`,
    'Alt Arts': `~${cfg.aaPerBox}`,
    'Leader AAs': `~${cfg.laaPerBox.toFixed(2)}`,
    'Secret Rares': `~${cfg.secPerBox.toFixed(2)}`,
    'SP / TR / Manga': 'case odds',
  };
}
