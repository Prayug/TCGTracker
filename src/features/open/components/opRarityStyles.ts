import { OpRarity } from '../types';

export const OP_RARITY_LABELS: Record<OpRarity, string> = {
  C: 'Common',
  UC: 'Uncommon',
  R: 'Rare',
  L: 'Leader',
  SR: 'Super Rare',
  SEC: 'Secret Rare',
  AA: 'Alternate Art',
  LAA: 'Leader Alternate Art',
  SP: 'Special Rare',
  TR: 'Treasure Rare',
  MANGA: 'Manga Rare',
  SAA: 'Red Super Alt Art',
  DON: 'DON!!',
};

export const OP_RARITY_SHORT: Record<OpRarity, string> = {
  C: 'C',
  UC: 'UC',
  R: 'R',
  L: 'L',
  SR: 'SR',
  SEC: 'SEC',
  AA: 'AA',
  LAA: 'LAA',
  SP: 'SP',
  TR: 'TR',
  MANGA: 'Manga',
  SAA: 'SAA',
  DON: 'DON',
};

interface RarityStyle {
  badge: string;
  border: string;
  glow: string;
  text: string;
  bar: string;
}

export function opRarityStyle(rarity: OpRarity): RarityStyle {
  switch (rarity) {
    case 'SAA':
      return {
        badge: 'border-red-500/50 bg-red-600/20 text-red-300',
        border: 'border-red-500/70',
        glow: 'shadow-[0_0_28px_-4px_rgba(239,68,68,0.65)]',
        text: 'text-red-300',
        bar: 'from-red-600 to-rose-400',
      };
    case 'MANGA':
      return {
        badge: 'border-rose-400/40 bg-rose-500/15 text-rose-300',
        border: 'border-rose-400/60',
        glow: 'shadow-[0_0_24px_-4px_rgba(251,113,133,0.55)]',
        text: 'text-rose-300',
        bar: 'from-rose-500 to-rose-300',
      };
    case 'TR':
      return {
        badge: 'border-cyan-400/40 bg-cyan-500/15 text-cyan-300',
        border: 'border-cyan-400/60',
        glow: 'shadow-[0_0_24px_-4px_rgba(34,211,238,0.55)]',
        text: 'text-cyan-300',
        bar: 'from-cyan-500 to-cyan-300',
      };
    case 'SP':
      return {
        badge: 'border-violet-400/40 bg-violet-500/15 text-violet-300',
        border: 'border-violet-400/60',
        glow: 'shadow-[0_0_24px_-4px_rgba(167,139,250,0.55)]',
        text: 'text-violet-300',
        bar: 'from-violet-500 to-violet-300',
      };
    case 'SEC':
      return {
        badge: 'border-amber-400/40 bg-amber-500/15 text-amber-300',
        border: 'border-amber-400/60',
        glow: 'shadow-[0_0_24px_-4px_rgba(251,191,36,0.5)]',
        text: 'text-amber-300',
        bar: 'from-amber-500 to-yellow-300',
      };
    case 'LAA':
      return {
        badge: 'border-orange-400/40 bg-orange-500/15 text-orange-300',
        border: 'border-orange-400/60',
        glow: 'shadow-[0_0_24px_-4px_rgba(251,146,60,0.5)]',
        text: 'text-orange-300',
        bar: 'from-orange-500 to-amber-300',
      };
    case 'AA':
      return {
        badge: 'border-gold/40 bg-gold/15 text-gold',
        border: 'border-gold/60',
        glow: 'shadow-[0_0_24px_-4px_rgba(233,196,106,0.5)]',
        text: 'text-gold',
        bar: 'from-gold to-amber-300',
      };
    case 'SR':
      return {
        badge: 'border-slate-400/40 bg-slate-500/15 text-slate-300',
        border: 'border-slate-400/60',
        glow: 'shadow-[0_0_24px_-6px_rgba(203,213,225,0.45)]',
        text: 'text-slate-300',
        bar: 'from-slate-400 to-slate-200',
      };
    case 'L':
      return {
        badge: 'border-teal-400/40 bg-teal-500/15 text-teal-300',
        border: 'border-teal-400/60',
        glow: 'shadow-[0_0_20px_-6px_rgba(45,212,191,0.45)]',
        text: 'text-teal-300',
        bar: 'from-teal-500 to-teal-300',
      };
    case 'R':
      return {
        badge: 'border-accent/40 bg-accent/15 text-accent',
        border: 'border-accent/60',
        glow: 'shadow-[0_0_16px_-8px_rgba(96,165,250,0.4)]',
        text: 'text-accent',
        bar: 'from-accent to-sky-300',
      };
    case 'UC':
      return {
        badge: 'border-gain/40 bg-gain/15 text-gain',
        border: 'border-gain/60',
        glow: '',
        text: 'text-gain',
        bar: 'from-gain to-emerald-300',
      };
    case 'DON':
      return {
        badge: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300',
        border: 'border-emerald-400/60',
        glow: '',
        text: 'text-emerald-300',
        bar: 'from-emerald-500 to-emerald-300',
      };
    default:
      return {
        badge: 'border-border-subtle bg-surface-hover text-ink-secondary',
        border: 'border-border-subtle',
        glow: '',
        text: 'text-ink-secondary',
        bar: 'from-surface-hover to-surface-raised',
      };
  }
}

export const CHASE_RARITIES: OpRarity[] = ['SAA', 'MANGA', 'TR', 'SP', 'SEC', 'LAA', 'AA'];

export function isChaseRarity(rarity: OpRarity): boolean {
  return CHASE_RARITIES.includes(rarity);
}
