/**
 * Pack-shop pool identity. Pokemon API ids (pop3-1) and TCGCSV ids
 * (tcgcsv-83891) are often the same physical card with different cardIds.
 */

export function normalizePackToken(value: string | undefined | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizePackNumber(value: string | undefined | null): string {
  const raw = normalizePackToken(value);
  const stripped = raw.replace(/^0+/, '');
  return stripped || raw || '';
}

export function packCardIdentity(card: {
  id?: string;
  name?: string;
  number?: string;
  set?: { id?: string; name?: string };
}): string {
  const name = normalizePackToken(card.name);
  const setName = normalizePackToken(card.set?.name);
  const number = normalizePackNumber(card.number);
  if (name && setName) {
    return `${setName}|${number}|${name}`;
  }
  return card.id || `${normalizePackToken(card.set?.id)}|${number}|${name}`;
}

type PoolCard = {
  id?: string;
  name?: string;
  number?: string;
  marketPrice?: number;
  psa10Price?: number;
  images?: { small?: string; large?: string };
  set?: { id?: string; name?: string };
};

export function preferPackPoolCard<T extends PoolCard>(a: T, b: T): T {
  const aTcg = String(a.id || '').startsWith('tcgcsv-');
  const bTcg = String(b.id || '').startsWith('tcgcsv-');
  if (aTcg !== bTcg) return aTcg ? b : a;

  const aImg = Boolean(a.images?.small || a.images?.large);
  const bImg = Boolean(b.images?.small || b.images?.large);
  if (aImg !== bImg) return aImg ? a : b;

  const aPrice = Math.max(a.marketPrice || 0, a.psa10Price || 0);
  const bPrice = Math.max(b.marketPrice || 0, b.psa10Price || 0);
  return bPrice > aPrice ? b : a;
}

export function dedupePackPoolCards<T extends PoolCard>(cards: T[]): T[] {
  const byKey = new Map<string, T>();

  for (const card of cards) {
    const key = packCardIdentity(card);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, card);
      continue;
    }

    const winner = preferPackPoolCard(existing, card);
    const psa10Price = winner.psa10Price || existing.psa10Price || card.psa10Price;
    byKey.set(key, psa10Price ? { ...winner, psa10Price } : winner);
  }

  return [...byKey.values()];
}
