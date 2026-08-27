import { Pack, PackPull, PackTier, ValueRange } from '../../types/pokemon';
import { formatCurrency } from '../../utils/cardDisplay';

export type PullVisualKind = 'raw' | 'psa' | 'cgc' | 'bgs';

export interface PullTheme {
  kind: PullVisualKind;
  label: string;
  hitLabel: string;
  resultEyebrow: string;
  accent: string;
  badge: string;
  glow: string;
  glowRgb: string;
  bar: string;
  border: string;
  modalRing: string;
}

export interface PackTierTheme {
  text: string;
  bar: string;
  gradient: string;
  soft: string;
}

const PULL_THEMES: Record<PullVisualKind, PullTheme> = {
  raw: {
    kind: 'raw',
    label: 'Raw',
    hitLabel: 'CARD PULLED',
    resultEyebrow: 'PACK PULL',
    accent: 'text-foil',
    badge: 'border-foil/40 bg-foil/10 text-foil',
    glow: 'bg-[radial-gradient(circle_at_50%_42%,rgba(91,196,212,0.22),transparent_62%)]',
    glowRgb: '91,196,212',
    bar: 'bg-foil/30',
    border: 'border-foil/35',
    modalRing: 'ring-1 ring-foil/25',
  },
  psa: {
    kind: 'psa',
    label: 'PSA 10',
    hitLabel: 'PSA 10 HIT',
    resultEyebrow: 'PSA 10 PULL',
    accent: 'text-amber-300',
    badge: 'border-amber-400/45 bg-amber-500/12 text-amber-300',
    glow: 'bg-[radial-gradient(circle_at_50%_42%,rgba(251,191,36,0.22),transparent_62%)]',
    glowRgb: '251,191,36',
    bar: 'bg-amber-400/35',
    border: 'border-amber-400/40',
    modalRing: 'ring-1 ring-amber-400/30',
  },
  cgc: {
    kind: 'cgc',
    label: 'CGC 10',
    hitLabel: 'CGC 10 HIT',
    resultEyebrow: 'CGC 10 PULL',
    accent: 'text-cyan-300',
    badge: 'border-cyan-400/45 bg-cyan-500/12 text-cyan-300',
    glow: 'bg-[radial-gradient(circle_at_50%_42%,rgba(34,211,238,0.22),transparent_62%)]',
    glowRgb: '34,211,238',
    bar: 'bg-cyan-400/35',
    border: 'border-cyan-400/40',
    modalRing: 'ring-1 ring-cyan-400/30',
  },
  bgs: {
    kind: 'bgs',
    label: 'BGS 10',
    hitLabel: 'BGS 10 HIT',
    resultEyebrow: 'BGS 10 PULL',
    accent: 'text-[#d4b483]',
    badge: 'border-[#d4b483]/45 bg-[#d4b483]/12 text-[#e0c49a]',
    glow: 'bg-[radial-gradient(circle_at_50%_42%,rgba(212,180,131,0.24),transparent_62%)]',
    glowRgb: '212,180,131',
    bar: 'bg-[#d4b483]/35',
    border: 'border-[#d4b483]/40',
    modalRing: 'ring-1 ring-[#d4b483]/30',
  },
};

export function packTierTheme(tier: PackTier | string): PackTierTheme {
  switch (tier) {
    case 'bronze':
      return {
        text: 'text-orange-300',
        bar: 'bg-orange-400/40',
        gradient: 'from-orange-400 to-orange-600',
        soft: 'from-[#1a222c] to-[#0b0f14]',
      };
    case 'silver':
      return {
        text: 'text-slate-200',
        bar: 'bg-slate-300/40',
        gradient: 'from-slate-300 to-slate-500',
        soft: 'from-[#12201c] to-[#0b0f14]',
      };
    case 'gold':
      return {
        text: 'text-amber-300',
        bar: 'bg-amber-400/40',
        gradient: 'from-amber-400 to-yellow-600',
        soft: 'from-[#1c2410] via-[#121820] to-[#0b0f14]',
      };
    case 'platinum':
      return {
        text: 'text-violet-300',
        bar: 'bg-violet-400/40',
        gradient: 'from-violet-400 to-purple-600',
        soft: 'from-[#102428] via-[#0b0f14] to-[#05060a]',
      };
    default:
      return {
        text: 'text-ink-secondary',
        bar: 'bg-white/25',
        gradient: 'from-slate-400 to-slate-600',
        soft: 'from-surface-overlay to-surface-raised',
      };
  }
}

export function pullVisualKind(pull: Pick<PackPull, 'pullKind' | 'grader' | 'grade'>): PullVisualKind {
  if (pull.pullKind !== 'slab') return 'raw';
  const grader = (pull.grader || 'PSA').toUpperCase();
  if (grader === 'CGC') return 'cgc';
  if (grader === 'BGS' || grader === 'BECKETT') return 'bgs';
  return 'psa';
}

export function getPullTheme(pull: Pick<PackPull, 'pullKind' | 'grader' | 'grade'>): PullTheme {
  const kind = pullVisualKind(pull);
  const theme = PULL_THEMES[kind];
  const grade = pull.grade || (kind === 'raw' ? '' : '10');
  if (kind === 'raw' || !grade || grade === '10') return theme;
  const grader = (pull.grader || 'PSA').toUpperCase();
  return {
    ...theme,
    label: `${grader} ${grade}`,
    hitLabel: `${grader} ${grade} HIT`,
    resultEyebrow: `${grader} ${grade} PULL`,
  };
}

export function activePackRanges(pack: Pack, boosted: boolean): ValueRange[] {
  return boosted && pack.boostedValueRanges ? pack.boostedValueRanges : pack.valueRanges;
}

export function formatOddsLabel(range: ValueRange): string {
  const compact = (n: number) => formatCurrency(n).replace(/\.00$/, '').replace(/^\$/, '');
  return `$${compact(range.min)}–${compact(range.max)}`;
}

export interface PackIdentityStats {
  floor: number;
  top: number;
  jackpotChance: number;
  beatCostChance: number;
}

export function packIdentityStats(ranges: ValueRange[], packPrice: number): PackIdentityStats {
  if (ranges.length === 0) {
    return { floor: 0, top: 0, jackpotChance: 0, beatCostChance: 0 };
  }
  const last = ranges[ranges.length - 1];
  return {
    floor: ranges[0].min,
    top: last.max,
    jackpotChance: last.probability,
    beatCostChance: ranges
      .filter((range) => range.min >= packPrice)
      .reduce((sum, range) => sum + range.probability, 0),
  };
}

export function formatGradePremium(gradedValue: number, rawPrice: number): string | null {
  if (!(rawPrice > 0) || !(gradedValue > 0)) return null;
  const ratio = gradedValue / rawPrice;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const digits = ratio >= 10 ? 0 : 1;
  return `${ratio.toFixed(digits)}× raw`;
}
