export type RarityTier = 'common' | 'uncommon' | 'rare' | 'holo' | 'ultra' | 'secret';

export function formatCurrency(value: number, options?: { signed?: boolean }): string {
  const abs = Math.abs(value);
  const formatted = `$${abs.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: abs >= 100 ? 0 : 2 })}`;
  if (!options?.signed) return formatted;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

export function formatPercent(value: number, options?: { signed?: boolean }): string {
  const abs = Math.abs(value).toFixed(1);
  if (!options?.signed) return `${abs}%`;
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `-${abs}%`;
  return `${abs}%`;
}

export function getRarityTier(rarity?: string): RarityTier {
  if (!rarity) return 'common';
  const key = rarity.toLowerCase();
  if (key.includes('secret')) return 'secret';
  if (key.includes('ultra') || key.includes('illustration') || key.includes('special')) return 'ultra';
  if (key.includes('holo') || key.includes('holofoil')) return 'holo';
  if (key.includes('rare')) return 'rare';
  if (key.includes('uncommon')) return 'uncommon';
  return 'common';
}

/** Premium rarities get holographic hover treatment */
export function isPremiumRarity(rarity?: string): boolean {
  const tier = getRarityTier(rarity);
  return tier === 'holo' || tier === 'ultra' || tier === 'secret';
}

export function getRarityBadgeClass(rarity?: string): string {
  const tier = getRarityTier(rarity);
  const map: Record<RarityTier, string> = {
    common: 'bg-white/10 text-slate-300 border-white/10',
    uncommon: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/25',
    rare: 'bg-sky-400/15 text-sky-300 border-sky-400/25',
    holo: 'bg-violet-400/15 text-violet-200 border-violet-400/30',
    ultra: 'bg-amber-400/15 text-amber-200 border-amber-400/30',
    secret: 'bg-rose-400/15 text-rose-200 border-rose-400/30',
  };
  return map[tier];
}

export function getPremiumBorderClass(rarity?: string): string {
  const tier = getRarityTier(rarity);
  const map: Record<RarityTier, string> = {
    common: 'group-hover:border-white/20',
    uncommon: 'group-hover:border-emerald-400/35',
    rare: 'group-hover:border-sky-400/35',
    holo: 'group-hover:border-violet-400/50 group-hover:shadow-[0_0_28px_rgba(139,92,246,0.25)]',
    ultra: 'group-hover:border-amber-400/50 group-hover:shadow-[0_0_28px_rgba(251,191,36,0.22)]',
    secret: 'group-hover:border-rose-400/55 group-hover:shadow-[0_0_32px_rgba(244,63,94,0.28)]',
  };
  return map[tier];
}
