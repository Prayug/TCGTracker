export type RarityTier = 'common' | 'uncommon' | 'rare' | 'holo' | 'ultra' | 'secret';

/**
 * Rewrite Pokemon TCG image URLs to go through the Vite dev proxy,
 * avoiding CORS errors in the browser.
 */
export function proxyImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace('https://images.pokemontcg.io', '/images/pokemontcg');
}

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

export function isPremiumRarity(rarity?: string): boolean {
  const tier = getRarityTier(rarity);
  return tier === 'holo' || tier === 'ultra' || tier === 'secret';
}

export function getRarityBadgeClass(rarity?: string): string {
  const tier = getRarityTier(rarity);
  const map: Record<RarityTier, string> = {
    common: 'bg-surface-hover text-ink-secondary border-border-subtle',
    uncommon: 'bg-gain-muted text-gain border-gain/25',
    rare: 'bg-accent-muted text-accent border-accent/25',
    holo: 'bg-accent-muted text-gold border-gold/30',
    ultra: 'bg-accent-muted text-gold border-gold/35',
    secret: 'bg-loss-muted text-loss border-loss/25',
  };
  return map[tier];
}

export function getSevenDayDeltaPct(card: {
  cardmarket?: { prices?: { trendPrice?: number; averageSellPrice?: number; avg7?: number } };
}): number | null {
  const prices = card.cardmarket?.prices;
  if (!prices) return null;
  const current = prices.trendPrice ?? prices.averageSellPrice;
  const avg7 = prices.avg7;
  if (!current || !avg7 || avg7 <= 0) return null;
  return ((current - avg7) / avg7) * 100;
}

export function getPremiumBorderClass(rarity?: string): string {
  const tier = getRarityTier(rarity);
  const map: Record<RarityTier, string> = {
    common: 'group-hover:border-border-strong',
    uncommon: 'group-hover:border-gain/35',
    rare: 'group-hover:border-accent/35',
    holo: 'group-hover:border-gold/40',
    ultra: 'group-hover:border-gold/50',
    secret: 'group-hover:border-loss/40',
  };
  return map[tier];
}
