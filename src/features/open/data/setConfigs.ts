import { OddsRow } from '../types';

/**
 * Per-set simulator configuration.
 *
 * Rates follow community English OPTCG consensus (OP.LOG / case openings /
 * onepiecepacksimulator guides) — Bandai does not publish official odds:
 *
 * Pack structure (English, 12 cards):
 *  - Standard OP sets: 7C + 3UC + 1R + 1 hit slot (hit last)
 *  - Extra boosters (EB): 10C + 0 UC + 1R + 1 hit slot
 *
 * Typical English box (24 packs):
 *  - ~7 Leaders, ~7 Super Rares
 *  - ~1 non-leader Alternate Art, ~⅓ Leader Alternate Art (≈4 LAA / case)
 *  - ~⅔ Secret Rare (≈8 SEC / English case → ~1 in 36 packs)
 *  - SP: 1/case through OP-05, 2/case from OP-06+
 *  - TR: ~1/case where printed
 *  - Manga / Super Alternate Art: ~1 per N cases (often ~5)
 *  - Red Super Alternate Art (SAA, OP-13+): ~1 per ~200 boxes
 *  - DON!!: 1/box from OP-04+
 *
 * Case = 12 booster boxes.
 */
export type PackStructure = 'standard' | 'extra';

export interface GodPackConfig {
  kind: 'sec' | 'manga' | 'sp';
  /** Average cases between god packs. */
  perCases: number;
  /** Chase cards that replace the entire pack. */
  cardCount: number;
}

export interface OnePieceSetOddsConfig {
  code: string;
  name: string;
  catalogIds: string[];
  /** English pack layout. */
  packStructure: PackStructure;
  boxPacks: number;
  /** Soft expected averages per box (not hard guarantees). */
  leadersPerBox: number;
  srPerBox: number;
  aaPerBox: number;
  /** Leader alternate arts — typically ~4 per case. */
  laaPerBox: number;
  secPerBox: number;
  spPerCase: number;
  trPerCase: number;
  /** Manga / Super Alternate Art rares per N cases (0 = none). */
  mangaPerCases: number;
  /**
   * Red Super Alternate Art (and similar ultra treatments) — average boxes
   * between pulls (0 = none). OP-13 ≈ 1 in 200 boxes.
   */
  saaPerBoxes: number;
  hasDon: boolean;
  godPack?: GodPackConfig;
  releaseDate?: string;
}

const BOOSTER_DEFAULTS = {
  packStructure: 'standard' as PackStructure,
  boxPacks: 24,
  leadersPerBox: 7,
  srPerBox: 7,
  aaPerBox: 1,
  laaPerBox: 4 / 12, // ~0.333
  secPerBox: 8 / 12, // ~0.667 English case average
  spPerCase: 0,
  trPerCase: 0,
  mangaPerCases: 0,
  saaPerBoxes: 0,
  hasDon: true,
};

const base = (code: string, name: string, catalogIds: string[]): OnePieceSetOddsConfig => ({
  ...BOOSTER_DEFAULTS,
  code,
  name,
  catalogIds,
});

export const ONE_PIECE_SET_CONFIGS: OnePieceSetOddsConfig[] = [
  {
    ...base('OP-01', 'Romance Dawn', ['OP-01', 'OP01']),
    spPerCase: 0,
    mangaPerCases: 5,
    hasDon: false,
    releaseDate: '2022-12-02',
  },
  {
    ...base('OP-02', 'Paramount War', ['OP-02', 'OP02']),
    spPerCase: 0,
    mangaPerCases: 5,
    hasDon: false,
    releaseDate: '2023-03-10',
  },
  {
    ...base('OP-03', 'Pillars of Strength', ['OP-03', 'OP03']),
    spPerCase: 0,
    mangaPerCases: 5,
    hasDon: false,
    releaseDate: '2023-06-30',
  },
  {
    ...base('OP-04', 'Kingdoms of Intrigue', ['OP-04', 'OP04']),
    spPerCase: 1,
    mangaPerCases: 5,
    releaseDate: '2023-09-22',
  },
  {
    ...base('OP-05', 'Awakening of the New Era', ['OP-05', 'OP05']),
    spPerCase: 1,
    mangaPerCases: 2,
    releaseDate: '2023-12-08',
  },
  {
    ...base('OP-06', 'Wings of the Captain', ['OP-06', 'OP06']),
    spPerCase: 2,
    trPerCase: 1,
    mangaPerCases: 5,
    releaseDate: '2024-03-15',
  },
  {
    ...base('OP-07', '500 Years in the Future', ['OP-07', 'OP07']),
    spPerCase: 2,
    mangaPerCases: 5,
    releaseDate: '2024-05-31',
  },
  {
    ...base('OP-08', 'Two Legends', ['OP-08', 'OP08']),
    spPerCase: 2,
    trPerCase: 1,
    mangaPerCases: 5,
    releaseDate: '2024-09-13',
  },
  {
    ...base('OP-09', 'Emperors in the New World', ['OP-09', 'OP09']),
    spPerCase: 2,
    mangaPerCases: 3,
    releaseDate: '2024-11-15',
  },
  {
    ...base('OP-10', 'Royal Blood', ['OP-10', 'OP10']),
    spPerCase: 2,
    trPerCase: 1,
    mangaPerCases: 5,
    releaseDate: '2025-02-14',
  },
  {
    ...base('OP-11', 'The Invasion of Onigashima', ['OP-11', 'OP11']),
    spPerCase: 2,
    trPerCase: 1,
    mangaPerCases: 5,
    releaseDate: '2025-04-11',
  },
  {
    ...base('OP-12', 'Legacy of the Master', ['OP-12', 'OP12']),
    spPerCase: 2,
    trPerCase: 1,
    mangaPerCases: 5,
    releaseDate: '2025-08-22',
  },
  {
    ...base('OP-13', "Carrying on His Will", ['OP-13', 'OP13']),
    spPerCase: 2,
    trPerCase: 1,
    mangaPerCases: 5,
    // Red Super Parallel Luffy/Ace/Sabo — community ≈ 1 per 200+ boxes.
    saaPerBoxes: 200,
    godPack: { kind: 'sec', perCases: 15, cardCount: 6 },
    releaseDate: '2025-10-31',
  },
  {
    ...base('OP-14', 'The Silver Age of Pirates', ['OP14-EB04', 'OP-14', 'OP14']),
    spPerCase: 2,
    trPerCase: 1,
    mangaPerCases: 5,
    releaseDate: '2025-12-12',
  },
  {
    ...base('OP-15', "Adventure on Kami's Island", ['OP15-EB04', 'OP-15', 'OP15']),
    spPerCase: 2,
    trPerCase: 1,
    mangaPerCases: 3,
    releaseDate: '2026-02-13',
  },
  {
    ...base('OP-16', 'The Time of Battle', ['OP-16', 'OP16']),
    spPerCase: 2,
    trPerCase: 1,
    mangaPerCases: 2,
    releaseDate: '2026-04-24',
  },
];

/** Extra booster / reprint sets. */
export const EXTRA_SET_CONFIGS: OnePieceSetOddsConfig[] = [
  {
    ...base('EB-01', 'Memorial Collection', ['EB-01', 'EB01']),
    packStructure: 'extra',
    spPerCase: 0,
    mangaPerCases: 0,
    hasDon: false,
    releaseDate: '2024-01-26',
  },
  {
    ...base('EB-02', 'Anime 25th Collection', ['EB-02', 'EB02']),
    packStructure: 'extra',
    spPerCase: 1,
    mangaPerCases: 0,
    hasDon: false,
    releaseDate: '2024-08-09',
  },
  {
    ...base('EB-03', 'Heroines Edition', ['EB-03']),
    packStructure: 'extra',
    spPerCase: 2,
    mangaPerCases: 0,
    hasDon: false,
    godPack: { kind: 'sp', perCases: 15, cardCount: 6 },
    releaseDate: '2025-07-18',
  },
  {
    ...base('EB-04', 'Extra Booster', ['EB-04', 'EB04']),
    packStructure: 'extra',
    spPerCase: 2,
    mangaPerCases: 0,
    hasDon: false,
    releaseDate: '2026-01-30',
  },
  {
    ...base('PRB-01', 'The Best', ['PRB-01', 'PRB01']),
    boxPacks: 20,
    spPerCase: 0,
    trPerCase: 1,
    mangaPerCases: 4,
    hasDon: false,
    godPack: { kind: 'manga', perCases: 15, cardCount: 10 },
    releaseDate: '2024-07-19',
  },
  {
    ...base('PRB-02', 'The Best Vol. 2', ['PRB-02', 'PRB02']),
    boxPacks: 20,
    spPerCase: 0,
    trPerCase: 1,
    mangaPerCases: 0,
    hasDon: true,
    releaseDate: '2025-07-11',
  },
];

export const ALL_SET_CONFIGS = [...ONE_PIECE_SET_CONFIGS, ...EXTRA_SET_CONFIGS];

export const BOXES_PER_CASE = 12;

export function getSetConfig(code: string): OnePieceSetOddsConfig | undefined {
  const normalized = normalizeCode(code);
  return ALL_SET_CONFIGS.find((c) => normalizeCode(c.code) === normalized);
}

export function normalizeCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export const DON_SET_IDS = ['DON', 'DON!!'];

export interface RarityPoolMeta {
  count: number;
}

export function buildOddsRows(cfg: OnePieceSetOddsConfig, pools: RarityPoolMeta): OddsRow[] {
  const box = cfg.boxPacks;
  const pct = (p: number) => p * 100;
  const oneIn = (p: number) => (p > 0 ? Math.round(1 / p) : 0);
  const commons = cfg.packStructure === 'extra' ? 10 : 7;
  const uncommons = cfg.packStructure === 'extra' ? 0 : 3;

  const rows: OddsRow[] = [
    {
      label: 'Common',
      perPack: null,
      perBox: `${commons} per pack`,
      perCase: 'guaranteed',
      note: cfg.packStructure === 'extra' ? 'Extra booster layout (no UC).' : undefined,
    },
    {
      label: 'Uncommon',
      perPack: null,
      perBox: uncommons > 0 ? `${uncommons} per pack` : 'none',
      perCase: uncommons > 0 ? 'guaranteed' : '—',
    },
    {
      label: 'Rare',
      perPack: null,
      perBox: '1 per pack + hit fill',
      perCase: 'guaranteed',
      note: 'Hit slot rolls Rare when no bigger hit lands.',
    },
    {
      label: 'Leader',
      perPack: pct(cfg.leadersPerBox / box),
      perBox: `~${cfg.leadersPerBox.toFixed(cfg.leadersPerBox % 1 ? 1 : 0)} per box`,
      perCase: `~${Math.round(cfg.leadersPerBox * BOXES_PER_CASE)} per case`,
    },
    {
      label: 'Super Rare',
      perPack: pct(cfg.srPerBox / box),
      perBox: `~${cfg.srPerBox} per box`,
      perCase: `~${cfg.srPerBox * BOXES_PER_CASE} per case`,
    },
    {
      label: 'Alternate Art',
      perPack: pct(cfg.aaPerBox / box),
      perBox: `~${cfg.aaPerBox} per box`,
      perCase: `~${Math.round(cfg.aaPerBox * BOXES_PER_CASE)} per case`,
      note: pools.count > 0 ? 'Non-leader parallels.' : 'No parallel cards in catalog for this set.',
    },
    {
      label: 'Leader Alternate Art',
      perPack: pct(cfg.laaPerBox / box),
      perBox: `~${cfg.laaPerBox.toFixed(2)} per box`,
      perCase: `~${Math.round(cfg.laaPerBox * BOXES_PER_CASE)} per case`,
      note: '≈4 per case on most main sets.',
    },
  ];

  if (cfg.secPerBox > 0) {
    rows.push({
      label: 'Secret Rare',
      perPack: pct(cfg.secPerBox / box),
      perBox: `~${cfg.secPerBox.toFixed(2)} per box`,
      perCase: `~${Math.round(cfg.secPerBox * BOXES_PER_CASE)} per case`,
      note: 'Not guaranteed — some boxes have 0.',
    });
  }
  if (cfg.spPerCase > 0) {
    const perPack = cfg.spPerCase / (box * BOXES_PER_CASE);
    rows.push({
      label: 'Special Rare',
      perPack: pct(perPack),
      perBox: `≈1 in ${oneIn(perPack)} packs`,
      perCase: `~${cfg.spPerCase} per case`,
    });
  }
  if (cfg.trPerCase > 0) {
    const perPack = cfg.trPerCase / (box * BOXES_PER_CASE);
    rows.push({
      label: 'Treasure Rare',
      perPack: pct(perPack),
      perBox: `≈1 in ${oneIn(perPack) || '—'} packs`,
      perCase: `~${cfg.trPerCase} per case`,
    });
  }
  if (cfg.mangaPerCases > 0) {
    const perPack = 1 / (cfg.mangaPerCases * box * BOXES_PER_CASE);
    rows.push({
      label: 'Manga / Super Alt Art',
      perPack: pct(perPack),
      perBox: `≈1 in ${oneIn(perPack) || '—'} packs`,
      perCase: `≈1 in ${cfg.mangaPerCases} cases`,
      note: pools.count > 0 ? 'Includes "(Super Alternate Art)" / "(Manga)".' : 'No manga cards in catalog for this set yet.',
    });
  }
  if (cfg.saaPerBoxes > 0) {
    const perPack = 1 / (cfg.saaPerBoxes * box);
    rows.push({
      label: 'Red Super Alternate Art',
      perPack: pct(perPack),
      perBox: `≈1 in ${cfg.saaPerBoxes} boxes`,
      perCase: `≈1 in ${Math.max(1, Math.round(cfg.saaPerBoxes / BOXES_PER_CASE))} cases`,
      note: 'Ultra chase (e.g. OP-13 Red Super Parallel).',
    });
  }
  if (cfg.hasDon) {
    rows.push({ label: 'DON!!', perPack: null, perBox: '1 per box', perCase: '~12 per case' });
  }
  if (cfg.godPack) {
    rows.push({
      label: 'God pack',
      perPack: null,
      perBox: `≈1 in ${cfg.godPack.perCases * BOXES_PER_CASE} boxes`,
      perCase: `≈1 in ${cfg.godPack.perCases} cases`,
      note: `Full ${cfg.godPack.cardCount}-card ${cfg.godPack.kind.toUpperCase()} pack replaces a normal pack.`,
    });
  }

  return rows;
}
