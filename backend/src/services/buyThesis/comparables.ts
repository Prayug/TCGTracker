/**
 * Comparable-card analysis when enough peers exist.
 */

import { median, round2 } from './stats';
import type { ComparableSummary } from './types';

export interface PeerCard {
  cardId: string;
  rarity?: string | null;
  currentPrice: number | null;
  change30d: number | null;
  setId?: string | null;
}

/**
 * Peers: same rarity (preferred) with valid price + 30d change.
 * Relative value: how much cheaper this card is vs peer median price,
 * adjusted lightly by peer median momentum.
 */
export function analyzeComparables(
  subject: {
    currentPrice: number | null;
    change30d: number | null;
    rarity?: string | null;
    setId?: string | null;
  },
  peers: PeerCard[],
  minPeers = 5
): ComparableSummary | null {
  const rarity = (subject.rarity || '').toLowerCase().trim();
  let pool = peers.filter(
    (p) =>
      p.currentPrice != null &&
      p.currentPrice > 0 &&
      p.change30d != null &&
      Number.isFinite(p.change30d)
  );

  if (rarity) {
    const sameRarity = pool.filter(
      (p) =>
        (p.rarity || '').toLowerCase().includes(rarity) ||
        rarity.includes((p.rarity || '').toLowerCase())
    );
    if (sameRarity.length >= minPeers) pool = sameRarity;
  }

  // Prefer same set when enough
  if (subject.setId) {
    const sameSet = pool.filter((p) => p.setId === subject.setId);
    if (sameSet.length >= minPeers) pool = sameSet;
  }

  if (pool.length < minPeers) return null;

  const peerMedianPrice = median(pool.map((p) => p.currentPrice as number));
  const peerMedianChange30d = median(pool.map((p) => p.change30d as number));

  let relativeValuePct: number | null = null;
  if (subject.currentPrice != null && peerMedianPrice != null && peerMedianPrice > 0) {
    relativeValuePct = round2(((peerMedianPrice - subject.currentPrice) / peerMedianPrice) * 100);
  }

  const bits: string[] = [`${pool.length} peers`];
  if (peerMedianChange30d != null) {
    bits.push(
      `peer median 30d ${peerMedianChange30d >= 0 ? '+' : ''}${peerMedianChange30d.toFixed(1)}%`
    );
  }
  if (relativeValuePct != null) {
    bits.push(
      relativeValuePct > 0
        ? `${relativeValuePct.toFixed(1)}% below peer median price`
        : `${Math.abs(relativeValuePct).toFixed(1)}% above peer median price`
    );
  }

  return {
    peerCount: pool.length,
    peerMedianChange30d: peerMedianChange30d != null ? round2(peerMedianChange30d) : null,
    peerMedianPrice: peerMedianPrice != null ? round2(peerMedianPrice) : null,
    relativeValuePct,
    summary: bits.join('; '),
  };
}
