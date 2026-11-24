import type { DealCardPayload, DealGame } from './ebayDealService';

/**
 * Pure rules for the background deal watcher: which deals are worth an email,
 * which sets count as "new", and how the alert email reads. No DB or network
 * here so it can be unit tested.
 */

export interface DealAlertRules {
  /** Minimum % below market for a normal card. */
  minDiscountPercent: number;
  /** Minimum $ saved (all-in vs market) for a normal card. */
  minSavings: number;
  /** Looser bar for cards from newly released sets, where prices move fastest. */
  newSetMinDiscountPercent: number;
  newSetMinSavings: number;
  /** Ignore cards whose market value is below this. */
  minMarketValue: number;
  /** Optional cap on all-in cost. */
  maxPrice: number | null;
}

export const DEFAULT_ALERT_RULES: DealAlertRules = {
  minDiscountPercent: 25,
  minSavings: 15,
  newSetMinDiscountPercent: 15,
  newSetMinSavings: 10,
  minMarketValue: 20,
  maxPrice: null,
};

function num(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function alertRulesFromEnv(e: NodeJS.ProcessEnv = process.env): DealAlertRules {
  const d = DEFAULT_ALERT_RULES;
  const maxPrice = num(e.DEAL_ALERT_MAX_PRICE, 0);
  return {
    minDiscountPercent: num(e.DEAL_ALERT_MIN_DISCOUNT, d.minDiscountPercent),
    minSavings: num(e.DEAL_ALERT_MIN_SAVINGS, d.minSavings),
    newSetMinDiscountPercent: num(e.DEAL_ALERT_NEW_SET_MIN_DISCOUNT, d.newSetMinDiscountPercent),
    newSetMinSavings: num(e.DEAL_ALERT_NEW_SET_MIN_SAVINGS, d.newSetMinSavings),
    minMarketValue: num(e.DEAL_ALERT_MIN_MARKET, d.minMarketValue),
    maxPrice: maxPrice > 0 ? maxPrice : null,
  };
}

export type AlertRejection =
  | 'review_feed'
  | 'live_auction'
  | 'stale_market'
  | 'weak_match'
  | 'market_too_low'
  | 'over_max_price'
  | 'discount_too_small'
  | 'savings_too_small';

type AlertDealFields = Pick<
  DealCardPayload,
  | 'feed'
  | 'liveAuction'
  | 'marketStale'
  | 'matchConfidenceTier'
  | 'marketValue'
  | 'allInCost'
  | 'discountPercent'
  | 'discountAmount'
>;

/** Why a scored deal should not be emailed, or null when it should. */
export function alertRejection(
  deal: AlertDealFields,
  isNewSet: boolean,
  rules: DealAlertRules
): AlertRejection | null {
  // 'review' means the scanner saw a red flag (lot, proxy, damaged, wrong grade, ...).
  if (deal.feed !== 'deal') return 'review_feed';
  // An auction with hours left only shows the current bid, not a real price.
  if (deal.liveAuction) return 'live_auction';
  if (deal.marketStale) return 'stale_market';
  if (deal.matchConfidenceTier === 'low' || deal.matchConfidenceTier === 'unresolved') {
    return 'weak_match';
  }
  if (deal.marketValue < rules.minMarketValue) return 'market_too_low';
  if (rules.maxPrice != null && deal.allInCost > rules.maxPrice) return 'over_max_price';
  const minPct = isNewSet ? rules.newSetMinDiscountPercent : rules.minDiscountPercent;
  const minSave = isNewSet ? rules.newSetMinSavings : rules.minSavings;
  if (deal.discountPercent < minPct) return 'discount_too_small';
  if (deal.discountAmount < minSave) return 'savings_too_small';
  return null;
}

export interface NewSetIndex {
  /** Lowercased set ids (card_mappings / onepiece_catalog setId). */
  setIds: Set<string>;
  /** Lowercased set names. Only filled for Pokémon: OP promo sets share one name. */
  setNames: Set<string>;
  /** Extra eBay searches aimed at these sets, e.g. "Pokemon Pitch Black" or "One Piece OP15". */
  searches: string[];
  /** Human labels for logs and the email footer. */
  labels: string[];
}

export function emptyNewSetIndex(): NewSetIndex {
  return { setIds: new Set(), setNames: new Set(), searches: [], labels: [] };
}

export function isNewSetDeal(
  deal: Pick<DealCardPayload, 'setId' | 'setName'>,
  index: NewSetIndex
): boolean {
  if (deal.setId && index.setIds.has(deal.setId.toLowerCase())) return true;
  const name = (deal.setName || '').trim().toLowerCase();
  return Boolean(name) && index.setNames.has(name);
}

function parseReleaseDate(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(raw.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

/**
 * Pokémon sets released in the last `days` days (or announced for the next 30,
 * since preorders and early singles hit eBay before release day).
 */
export function pickRecentPokemonSets(
  rows: Array<{ setId: string; setName: string; setReleaseDate: string | null }>,
  now: Date,
  days: number,
  maxSearches = 3
): NewSetIndex {
  const index = emptyNewSetIndex();
  const nowMs = now.getTime();
  const recent = rows
    .map((r) => ({ ...r, released: parseReleaseDate(r.setReleaseDate) }))
    .filter(
      (r): r is typeof r & { released: number } =>
        r.released != null &&
        r.released >= nowMs - days * 86_400_000 &&
        r.released <= nowMs + 30 * 86_400_000
    )
    .sort((a, b) => b.released - a.released);
  const searchedNames = new Set<string>();
  for (const r of recent) {
    index.setIds.add(r.setId.toLowerCase());
    const name = r.setName.trim();
    index.setNames.add(name.toLowerCase());
    // "30th Celebration: Classic Collection" searches the same as its parent set.
    const base = name.split(':')[0].trim();
    if (!searchedNames.has(base.toLowerCase()) && index.searches.length < maxSearches) {
      searchedNames.add(base.toLowerCase());
      index.searches.push(`Pokemon ${base}`);
      index.labels.push(name);
    }
  }
  return index;
}

/**
 * One Piece has no release dates in the catalog, so "new" is the highest set
 * numbers: the two newest OP boosters plus the newest EB and PRB.
 * Ids look like "OP-14", "OP15-EB04", "OP14" (promos), "EB-03", "PRB-02".
 */
export function pickNewestOnePieceSets(
  sets: Array<{ setId: string; setName: string }>,
  keep: { OP: number; EB: number; PRB: number } = { OP: 2, EB: 1, PRB: 1 }
): NewSetIndex {
  const index = emptyNewSetIndex();
  const groups: Record<
    'OP' | 'EB' | 'PRB',
    Map<number, Array<{ setId: string; setName: string }>>
  > = { OP: new Map(), EB: new Map(), PRB: new Map() };
  for (const s of sets) {
    const m = /^(OP|EB|PRB)-?(\d+)/i.exec(s.setId.trim());
    if (!m) continue;
    const kind = m[1].toUpperCase() as 'OP' | 'EB' | 'PRB';
    const n = Number(m[2]);
    const list = groups[kind].get(n) ?? [];
    list.push(s);
    groups[kind].set(n, list);
  }
  for (const kind of ['OP', 'EB', 'PRB'] as const) {
    const numbers = [...groups[kind].keys()].sort((a, b) => b - a).slice(0, keep[kind]);
    for (const n of numbers) {
      const code = `${kind}${String(n).padStart(2, '0')}`;
      const members = groups[kind].get(n) ?? [];
      for (const s of members) index.setIds.add(s.setId.toLowerCase());
      index.searches.push(`One Piece ${code}`);
      const named = members.find((s) => !/promotion/i.test(s.setName));
      index.labels.push(named ? `${code} ${named.setName}` : code);
    }
  }
  return index;
}

export interface DealAlert {
  game: DealGame;
  isNewSet: boolean;
  deal: DealCardPayload;
}

/** New-set deals first, then the scanner's own deal score. */
export function sortAlerts(alerts: DealAlert[]): DealAlert[] {
  return [...alerts].sort((a, b) => {
    if (a.isNewSet !== b.isNewSet) return a.isNewSet ? -1 : 1;
    return b.deal.dealScore - a.deal.dealScore;
  });
}

const money = (n: number) => `$${n.toFixed(2)}`;

function describeTiming(deal: DealCardPayload): string {
  if (deal.listingType !== 'auction') return 'Buy It Now';
  const h = deal.hoursRemaining;
  if (h == null) return 'Auction';
  if (h < 1) return `Auction, ends in ${Math.max(1, Math.round(h * 60))} min`;
  return `Auction, ends in ${h.toFixed(1)} h`;
}

export function formatDealAlertEmail(
  alerts: DealAlert[],
  opts: { appUrl?: string; newSetLabels?: Partial<Record<DealGame, string[]>> } = {}
): { subject: string; text: string } {
  const sorted = sortAlerts(alerts);
  const top = sorted[0]?.deal;
  const tag = sorted[0]?.isNewSet ? 'NEW SET ' : '';
  const subject =
    sorted.length === 1 && top
      ? `eBay deal: ${tag}${top.cardName} ${Math.round(top.discountPercent)}% off (${money(top.allInCost)})`
      : `${sorted.length} new eBay deals · best: ${tag}${top?.cardName ?? ''} ${Math.round(top?.discountPercent ?? 0)}% off`;

  const lines: string[] = [];
  sorted.forEach(({ deal, game, isNewSet }, i) => {
    const gameLabel = game === 'onepiece' ? 'One Piece' : 'Pokémon';
    const num = deal.cardNumber ? ` #${deal.cardNumber}` : '';
    lines.push(
      `${i + 1}. ${isNewSet ? '[NEW SET] ' : ''}${gameLabel} · ${deal.cardName} (${deal.setName}${num}) · ${deal.gradeLabel}`
    );
    lines.push(
      `   ${money(deal.allInCost)} all-in (${describeTiming(deal)}) vs market ${money(deal.marketValue)}: ${deal.discountPercent.toFixed(0)}% off, save ${money(deal.discountAmount)}`
    );
    const feedback = [
      deal.sellerFeedbackPct != null ? `${deal.sellerFeedbackPct}%` : null,
      deal.sellerFeedbackScore != null ? `${deal.sellerFeedbackScore} ratings` : null,
    ]
      .filter(Boolean)
      .join(', ');
    const seller = deal.sellerUsername
      ? `Seller ${deal.sellerUsername}${feedback ? ` (${feedback})` : ''}`
      : 'Seller unknown';
    lines.push(
      `   ${seller} · match ${deal.matchConfidenceTier} · market from ${deal.marketSource}`
    );
    if (deal.riskFlags.length) lines.push(`   Flags: ${deal.riskFlags.join(', ')}`);
    lines.push(`   ${deal.listingUrl}`);
    lines.push('');
  });

  const newSets = Object.entries(opts.newSetLabels ?? {})
    .filter(([, labels]) => labels && labels.length)
    .map(([g, labels]) => `${g === 'onepiece' ? 'One Piece' : 'Pokémon'}: ${labels!.join(', ')}`);
  if (newSets.length) lines.push(`New sets being watched: ${newSets.join(' | ')}`);
  if (opts.appUrl) lines.push(`All deals: ${opts.appUrl.replace(/\/$/, '')}/deals`);
  lines.push('', 'Always check photos and the seller before buying. — TCGTracker deal watcher');
  return { subject, text: lines.join('\n') };
}
