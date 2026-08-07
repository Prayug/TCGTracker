/** Simulated One Piece pack opening types. */

export type OpRarity =
  | 'C'
  | 'UC'
  | 'R'
  | 'L'
  | 'SR'
  | 'SEC'
  | 'AA'
  | 'LAA'
  | 'SP'
  | 'TR'
  | 'MANGA'
  | 'SAA'
  | 'DON';

export const OP_RARITY_ORDER: OpRarity[] = [
  'SAA',
  'MANGA',
  'TR',
  'SP',
  'SEC',
  'LAA',
  'AA',
  'SR',
  'L',
  'R',
  'UC',
  'C',
  'DON',
];

export interface PullCard {
  /** Catalog id used to dedupe / key cards. */
  id: string;
  /** Clean display name (suffixes like " (Parallel)" stripped). */
  name: string;
  /** Card number e.g. OP05-069. */
  number: string;
  rarity: OpRarity;
  /** Original catalog rarity symbol, e.g. SEC for a manga variant. */
  baseRarity?: string;
  imageUrl?: string;
  marketPrice?: number;
  /** Big hits (manga, TR, SP, SEC, AA) get special fanfare in the UI. */
  isChase: boolean;
}

export interface OpenedPack {
  id: string;
  code: string;
  setName: string;
  /** The 12 cards in reveal order — hit slot revealed last. */
  cards: PullCard[];
  /** Bonus DON!! card included in the pack (box-mode only, OP-04+). */
  donCard?: PullCard;
  openedAt: string;
  mode: 'pack' | 'box';
  boxIndex?: number;
  packIndexInBox?: number;
}

export interface BoxSession {
  id: string;
  code: string;
  setName: string;
  packs: OpenedPack[];
  openedAt: string;
  /** All chase cards pulled in the box, best-first. */
  hits: PullCard[];
  totalValue: number;
}

/** Aggregated multi-box / case rip (skip per-pack animation). */
export interface BulkOpenSession {
  id: string;
  code: string;
  setName: string;
  boxes: BoxSession[];
  boxCount: number;
  packCount: number;
  openedAt: string;
  hits: PullCard[];
  totalValue: number;
  /** True when this was a full 12-box case. */
  isCase: boolean;
}

export interface RarityPools {
  C: PullCard[];
  UC: PullCard[];
  R: PullCard[];
  L: PullCard[];
  SR: PullCard[];
  SEC: PullCard[];
  AA: PullCard[];
  LAA: PullCard[];
  SP: PullCard[];
  TR: PullCard[];
  MANGA: PullCard[];
  SAA: PullCard[];
  DON: PullCard[];
}

export interface OddsRow {
  label: string;
  /** Probability per single pack, 0-100. */
  perPack: number | null;
  /** Expected count per 24-pack box (or per box for box-level rarities). */
  perBox: string | null;
  /** Expected count per 12-box case. */
  perCase: string | null;
  note?: string;
}

export interface SavedPull {
  card: PullCard;
  code: string;
  setName: string;
  openedAt: string;
}

export type Rng = () => number;
