/**
 * Enriches scraped external_market_signals rows into actionable investment
 * signal cards with market metrics, scoring, and human-readable interpretation.
 */

import { getDb } from '../db/database';
import { scoreLiquidity, type LiquidityTier } from './liquidityScore';
import {
  applyBulkAndEconomicScoring,
  buildBulkAwareWhy,
} from './opportunityBulkScoring';

interface SeriesPoint {
  date: string;
  price: number;
}

function computeChange(
  current: number,
  prev: number
): { changeAbs: number; changePct: number } {
  const changeAbs = round2(current - prev);
  const changePct = prev > 0 ? round2(((current - prev) / prev) * 100) : 0;
  return { changeAbs, changePct };
}

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []) as T[]);
    });
  });

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export type SignalDirection = 'bullish' | 'bearish' | 'neutral' | 'watch' | 'high_risk';

export type SignalCategory =
  | 'set_release'
  | 'buyout'
  | 'tournament'
  | 'reddit'
  | 'youtube'
  | 'news'
  | 'supply'
  | 'price_movement'
  | 'reprint'
  | 'rotation'
  | 'grading'
  | 'ban_list';

export interface RawExternalSignal {
  id: number;
  cardId: string | null;
  cardName: string | null;
  setName: string | null;
  imageSmall: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  title: string | null;
  summary: string | null;
  sentiment: number;
  relevance: number;
  riskType: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  cardNetSentiment: number | null;
}

export interface SignalMetrics {
  price7dPct: number | null;
  price30dPct: number | null;
  volumeChangePct: number | null;
  liquidityTier: LiquidityTier | null;
  liquidityLabel: string | null;
}

export interface SignalDriver {
  key: string;
  label: string;
  level: 'up' | 'down' | 'flat' | 'up_strong';
}

export interface TopAffectedCard {
  cardId: string;
  cardName: string;
  imageSmall: string | null;
  change7dPct: number | null;
  changeAbs: number | null;
}

export interface SignalEvidence {
  totalSources: number;
  byType: Record<string, number>;
  sources: SignalSourceItem[];
}

export interface SignalSourceItem {
  id: number | null;
  url: string;
  title: string;
  type: string;
  typeLabel: string;
  thumbnailUrl: string | null;
  summary: string | null;
  publishedAt: string | null;
}

export type SignalEntityType = 'set' | 'card' | 'sealed' | 'theme';
export type SignalTier = 'actionable' | 'emerging' | 'monitor';

export interface InvestmentSignal {
  id: number;
  /** Interpreted headline — the model's conclusion, not the raw source title. */
  signalTitle: string;
  /** Primary entity label, e.g. "Destined Rivals (Set)". */
  entityLabel: string;
  entityType: SignalEntityType;
  /** Raw source headline — shown only in expanded view. */
  sourceTitle: string | null;
  /** Feed section: actionable vs emerging vs monitor. */
  signalTier: SignalTier;
  hasMarketConfirmation: boolean;
  /** Short bullet reasons the signal matters. */
  whyItMatters: string[];
  /** Compact source line, e.g. "YouTube (2) · Reddit (1)". */
  sourceSummary: string;
  eventTitle: string;
  eventDetail: string;
  category: SignalCategory;
  categoryLabel: string;
  observedEffect: string;
  interpretation: string;
  opportunity: string;
  explanation: string;
  direction: SignalDirection;
  directionLabel: string;
  opportunityScore: number;
  confidence: number;
  horizon: string;
  metrics: SignalMetrics;
  sparkline: number[];
  cardId: string | null;
  cardName: string | null;
  setName: string | null;
  topAffectedCard: TopAffectedCard | null;
  sourceUrl: string | null;
  createdAt: string | null;
  /** Linked sources with thumbnails for the signal drawer. */
  sources: SignalSourceItem[];
  evidence: SignalEvidence;
  drivers: SignalDriver[];
}

export interface MarketPulse {
  bullish: number;
  bearish: number;
  watch: number;
  neutral: number;
  highRisk: number;
  total: number;
  analyzedLast24h: number;
  bullishInsight: string | null;
  watchInsight: string | null;
  highRiskInsight: string | null;
  strongestSignal: {
    signalTitle: string;
    entityLabel: string;
    detail: string;
    score: number;
    confidence: number;
    sourceCount: number;
  } | null;
  highestRisk: { signalTitle: string; entityLabel: string; detail: string; score: number } | null;
}

const CATEGORY_LABELS: Record<SignalCategory, string> = {
  set_release: 'Set Release',
  buyout: 'Buyout',
  tournament: 'Tournament',
  reddit: 'Reddit',
  youtube: 'YouTube',
  news: 'News',
  supply: 'Supply',
  price_movement: 'Price Movement',
  reprint: 'Reprint',
  rotation: 'Rotation',
  grading: 'Grading',
  ban_list: 'Ban List',
};

const DIRECTION_LABELS: Record<SignalDirection, string> = {
  bullish: 'Bullish',
  bearish: 'Bearish',
  neutral: 'Neutral',
  watch: 'Watching',
  high_risk: 'High Risk',
};

const HORIZON_BY_CATEGORY: Partial<Record<SignalCategory, string>> = {
  tournament: '1–4 weeks',
  reddit: '1–2 weeks',
  youtube: '1–3 weeks',
  news: '2–6 weeks',
  set_release: '1–3 months',
  ban_list: '3–6 months',
  buyout: '1–4 weeks',
  reprint: '2–6 months',
  supply: '1–3 months',
  price_movement: '2–8 weeks',
};

export function mapSignalCategory(
  sourceType: string | null,
  riskType: string | null
): SignalCategory {
  const src = (sourceType ?? '').toLowerCase();
  const risk = (riskType ?? '').toLowerCase();

  if (src === 'social') return 'reddit';
  if (src === 'youtube') return 'youtube';
  if (src === 'news') return 'news';
  if (src === 'tournament') return 'tournament';
  if (src === 'ban_list') return 'ban_list';
  if (src === 'set_release' || risk === 'set_release' || risk === 'upcoming_set') return 'set_release';

  if (/buyout/i.test(risk)) return 'buyout';
  if (/supply|listing/i.test(risk)) return 'supply';
  if (/reprint/i.test(risk)) return 'reprint';
  if (/rotation|format/i.test(risk)) return 'rotation';
  if (/grad/i.test(risk)) return 'grading';
  if (/price|spike|move/i.test(risk)) return 'price_movement';

  return 'news';
}

export function parseReleaseDaysAgo(eventDetail: string): number | null {
  const m = /Released (\d+) days ago/i.exec(eventDetail);
  return m ? parseInt(m[1], 10) : null;
}

export function staleReleasePenalty(days: number | null, category: SignalCategory): number {
  if (category !== 'set_release' || days == null) return 0;
  if (days > 365) return 42;
  if (days > 180) return 28;
  if (days > 90) return 14;
  if (days > 45) return 6;
  return 0;
}

const ENTITY_TYPE_LABELS: Record<SignalEntityType, string> = {
  set: 'Set',
  card: 'Card',
  sealed: 'Sealed',
  theme: 'Trend',
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  social: 'Reddit',
  reddit: 'Reddit',
  news: 'News',
  tournament: 'Tournament',
  set_release: 'Set Release',
  ban_list: 'Ban List',
};

export function hasMarketConfirmation(
  metrics: SignalMetrics,
  sparkline: number[]
): boolean {
  return (
    metrics.price30dPct != null ||
    metrics.price7dPct != null ||
    (metrics.volumeChangePct != null && metrics.liquidityLabel != null) ||
    sparkline.length >= 4
  );
}

function extractSetFromContent(title: string | null, summary: string | null): string | null {
  const text = `${title ?? ''} ${summary ?? ''}`.trim();
  if (!text) return null;

  const fromMatch = /\bfrom\s+([A-Za-z0-9][A-Za-z0-9\s&':-]{2,42}?)(?:\s*[!?.#]|$)/i.exec(text);
  if (fromMatch?.[1]) {
    const name = fromMatch[1].trim().replace(/\s+(Set|SET)$/i, '').trim();
    if (name.length >= 3 && !/^(the|this|pokemon|tcg|revealing)$/i.test(name)) return name;
  }

  const patterns = [
    /(?:recent|upcoming)\s+set:\s*(.+)$/i,
    /set\s+"([^"]+)"/i,
    /([\w\s&':-]+?)\s+(?:booster box|elite trainer box|\betb\b|booster bundle)/i,
    /(?:new|huge)\s+([A-Za-z0-9][\w\s&':-]{2,32})\s+set\b/i,
  ];

  for (const re of patterns) {
    const m = re.exec(text);
    const candidate = m?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (candidate && candidate.length >= 3 && !/^(the|this|a|an|pokemon|tcg|revealing)$/i.test(candidate)) {
      return candidate.replace(/\s+(Set|SET)$/i, '').trim();
    }
  }
  return null;
}

function detectSealedProduct(text: string): string | null {
  if (/booster box/i.test(text)) return 'Booster Box';
  if (/elite trainer box|\betb\b/i.test(text)) return 'ETB';
  if (/booster bundle/i.test(text)) return 'Booster Bundle';
  if (/collection box|ultra premium/i.test(text)) return 'Collection Box';
  if (/sealed|booster pack/i.test(text)) return 'Sealed Product';
  return null;
}

export function resolveSignalEntity(input: {
  title: string | null;
  summary: string | null;
  setName: string | null;
  cardName: string | null;
  category: SignalCategory;
}): { entityType: SignalEntityType; entityName: string } {
  const text = `${input.title ?? ''} ${input.summary ?? ''}`;
  const setFromFields = extractSetName(input.title, input.summary, input.setName);
  const setFromContent = extractSetFromContent(input.title, input.summary);
  const resolvedSet = setFromFields ?? setFromContent;
  const sealed = detectSealedProduct(text);

  if (sealed) {
    return {
      entityType: 'sealed',
      entityName: resolvedSet ? `${resolvedSet} ${sealed}` : sealed,
    };
  }

  if (input.cardName && input.category !== 'set_release') {
    return { entityType: 'card', entityName: input.cardName };
  }

  if (resolvedSet) {
    return { entityType: 'set', entityName: resolvedSet };
  }

  const themeMatch =
    /(?:new|huge|best)\s+(mega\s+[\w]+|[\w\s&'-]{3,30})\s+set/i.exec(input.title ?? '') ??
    /(mega\s+[\w]+)\s+(?:set|theme|hype)/i.exec(text);
  if (themeMatch?.[1]) {
    return { entityType: 'theme', entityName: themeMatch[1].trim() };
  }

  const fallback = cleanEventTitle(input.title, null);
  return {
    entityType: 'theme',
    entityName: fallback.length > 48 ? `${fallback.slice(0, 45)}…` : fallback,
  };
}

export function buildEntityLabel(entityType: SignalEntityType, entityName: string): string {
  return `${entityName} (${ENTITY_TYPE_LABELS[entityType]})`;
}

export function buildSignalTitle(input: {
  entityName: string;
  entityType: SignalEntityType;
  direction: SignalDirection;
  category: SignalCategory;
  hasMarketConfirmation: boolean;
  metrics: SignalMetrics;
}): string {
  const { entityName, entityType, direction, category, hasMarketConfirmation, metrics } = input;

  if (hasMarketConfirmation && metrics.price30dPct != null) {
    const verb = metrics.price30dPct >= 0 ? 'rising' : 'softening';
    if (entityType === 'sealed') return `${entityName} prices ${verb}`;
    if (entityType === 'set') return `${entityName} market ${verb}`;
    return `${entityName} price ${verb}`;
  }

  if (category === 'youtube' || category === 'reddit') {
    if (direction === 'bullish') return `${entityName} content momentum rising`;
    if (direction === 'bearish') return `${entityName} negative sentiment building`;
    return `${entityName} early content interest detected`;
  }

  if (category === 'set_release') {
    if (direction === 'bullish') return `${entityName} release demand strengthening`;
    return `${entityName} post-release price discovery`;
  }

  if (direction === 'bullish') return `${entityName} demand signals strengthening`;
  if (direction === 'bearish') return `${entityName} facing market headwinds`;
  if (direction === 'high_risk') return `${entityName} elevated volatility`;
  if (direction === 'watch') return `${entityName} — signal forming`;
  return `${entityName} — monitoring`;
}

export function buildSourceSummary(
  byType: Record<string, number>,
  sources: SignalSourceItem[] = []
): string {
  const counts = { ...byType };
  if (Object.keys(counts).length === 0 && sources.length > 0) {
    for (const s of sources) {
      counts[s.type] = (counts[s.type] ?? 0) + 1;
    }
  }
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${SOURCE_TYPE_LABELS[k] ?? k.replace(/_/g, ' ')} (${v})`);
  return parts.length ? parts.join(' · ') : 'No corroborating sources yet';
}

export function buildWhyItMatters(input: {
  category: SignalCategory;
  direction: SignalDirection;
  metrics: SignalMetrics;
  evidence: SignalEvidence;
  hasMarketConfirmation: boolean;
  eventDetail: string;
}): string[] {
  const bullets: string[] = [];
  const { metrics, evidence, hasMarketConfirmation, category, direction, eventDetail } = input;

  const yt = evidence.byType.youtube ?? 0;
  const social = (evidence.byType.social ?? 0) + (evidence.byType.reddit ?? 0);
  const news = evidence.byType.news ?? 0;

  if (yt >= 1) {
    bullets.push(
      yt >= 2
        ? `${yt} YouTube videos referencing this in recent coverage`
        : 'YouTube coverage detected in the last analysis window'
    );
  }
  if (social >= 1) {
    bullets.push(`${social} Reddit/social mention${social > 1 ? 's' : ''} contributing to signal`);
  }
  if (news >= 1) {
    bullets.push(`${news} news source${news > 1 ? 's' : ''} flagged this theme`);
  }

  if (metrics.price30dPct != null && Math.abs(metrics.price30dPct) >= 3) {
    bullets.push(
      `30-day price ${metrics.price30dPct >= 0 ? 'up' : 'down'} ${Math.abs(round1(metrics.price30dPct))}%`
    );
  } else if (metrics.price7dPct != null && Math.abs(metrics.price7dPct) >= 2) {
    bullets.push(`7-day price move of ${formatSignedPct(metrics.price7dPct)}`);
  }

  if (metrics.volumeChangePct != null && Math.abs(metrics.volumeChangePct) >= 5) {
    bullets.push(
      `Sales volume ${metrics.volumeChangePct >= 0 ? 'above' : 'below'} baseline (${formatSignedPct(metrics.volumeChangePct)})`
    );
  }

  if (!hasMarketConfirmation && (category === 'youtube' || category === 'reddit')) {
    bullets.push('No reliable market follow-through yet — treat as early source signal');
  }

  if (category === 'set_release' && /released/i.test(eventDetail)) {
    bullets.push(`Release timing: ${eventDetail.toLowerCase()}`);
  }

  if (direction === 'high_risk') {
    bullets.push('Elevated timing risk — size positions carefully');
  }

  return bullets.slice(0, 4);
}

function formatSignedPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${round1(n)}%`;
}

export function classifySignalTier(input: {
  opportunityScore: number;
  confidence: number;
  hasMarketConfirmation: boolean;
  direction: SignalDirection;
}): SignalTier {
  if (input.opportunityScore <= 0 || input.direction === 'neutral') return 'monitor';
  if (
    input.hasMarketConfirmation &&
    input.opportunityScore >= 38 &&
    input.confidence >= 42
  ) {
    return 'actionable';
  }
  if (input.opportunityScore >= 52 && input.confidence >= 55) return 'actionable';
  if (input.opportunityScore >= 18 || input.confidence >= 28) return 'emerging';
  return 'monitor';
}

export function boostSourceOnlyScore(
  score: number,
  category: SignalCategory,
  relevance: number,
  sentiment: number
): number {
  if (score >= 18) return score;
  if (!['youtube', 'reddit', 'news'].includes(category)) return score;
  if (relevance < 0.25) return score;
  const boosted = Math.round(relevance * 35 + Math.abs(sentiment) * 25 + 12);
  return clamp(Math.max(score, boosted), 0, 100);
}

function summarizeDirectionInsight(
  signals: InvestmentSignal[],
  direction: SignalDirection
): string | null {
  const subset = signals.filter((s) => s.direction === direction);
  if (subset.length === 0) return null;

  const categories = new Map<string, number>();
  for (const s of subset) {
    categories.set(s.entityType, (categories.get(s.entityType) ?? 0) + 1);
  }

  const top = [...categories.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;

  const typeLabel =
    top[0] === 'sealed'
      ? 'sealed product'
      : top[0] === 'set'
        ? 'set release'
        : top[0] === 'card'
          ? 'single-card'
          : 'content-driven trend';

  if (direction === 'bullish') return `Strongest in ${typeLabel} signals`;
  if (direction === 'watch') return `Mostly early YouTube or Reddit trend detections`;
  if (direction === 'high_risk') return `${subset.length} flagged with elevated volatility`;
  if (direction === 'bearish') return `Headwinds concentrated in ${typeLabel} signals`;
  return null;
}

/** Prefer chase cards over commons when picking a set's showcase card. */
export function collectibilityWeight(
  rarity: string | null,
  cardName: string,
  psaPrice?: number | null
): number {
  const r = (rarity ?? '').toLowerCase();
  const name = cardName.toLowerCase();
  if (/secret|hyper rare|special illustration|sir\b/i.test(r + ' ' + name)) return 1.6;
  if (/double rare|ultra rare|illustration rare|rare holo/i.test(r)) return 1.35;
  if (/ex\b|gx\b|vmax|vstar|\sv\b|radiant|prism star/i.test(name)) return 1.25;
  if (r === 'rare' || r.includes('holo')) return 1.1;
  if (r === 'uncommon') return 0.35;
  if (r === 'common') return 0.12;
  // Missing rarity: use PSA price tier + name shape.
  if (!r.trim()) {
    if (psaPrice != null && psaPrice >= 250) return 1.2;
    if (/ex\b|gx\b|vmax|vstar|\sv\b/i.test(name)) return 1.2;
    if (psaPrice != null && psaPrice < 80) return 0.15;
    return 0.45;
  }
  return 0.75;
}

export function economicMoveScore(changePct: number, psaPrice: number): number {
  const absGain = Math.abs((psaPrice * changePct) / 100);
  // Favor dollar impact; tiny PSA prices still down-ranked.
  return absGain * clamp(psaPrice / 40, 0.25, 2.5);
}

export function dedupeInvestmentSignals(signals: InvestmentSignal[]): InvestmentSignal[] {
  const byKey = new Map<string, InvestmentSignal>();
  for (const s of signals) {
    const key = `${s.entityType}:${s.entityLabel.trim().toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, s);
      continue;
    }
    const mergedSources = mergeSignalSources(prev.sources, s.sources);
    const mergedByType = countSourcesByType(mergedSources);
    const keep = s.opportunityScore > prev.opportunityScore ? s : prev;
    const drop = keep === s ? prev : s;
    byKey.set(key, {
      ...keep,
      sources: mergedSources,
      sourceSummary: buildSourceSummary(mergedByType, mergedSources),
      evidence: {
        totalSources: mergedSources.length,
        byType: mergedByType,
        sources: mergedSources,
      },
      whyItMatters: [...new Set([...keep.whyItMatters, ...drop.whyItMatters])].slice(0, 5),
    });
  }
  return [...byKey.values()];
}

function countSourcesByType(sources: SignalSourceItem[]): Record<string, number> {
  const byType: Record<string, number> = {};
  for (const s of sources) {
    byType[s.type] = (byType[s.type] ?? 0) + 1;
  }
  return byType;
}

function mergeSignalSources(
  a: SignalSourceItem[],
  b: SignalSourceItem[]
): SignalSourceItem[] {
  const seen = new Set<string>();
  const out: SignalSourceItem[] = [];
  for (const s of [...a, ...b]) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out.slice(0, 12);
}

export function sourceThumbnailUrl(url: string | null): string | null {
  if (!url) return null;
  const match =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/.exec(url);
  if (match) return `https://i.ytimg.com/vi/${match[1]}/mqdefault.jpg`;
  return null;
}

const ENTITY_SEARCH_STOP = new Set([
  'pokemon',
  'cards',
  'best',
  'invest',
  'opening',
  'the',
  'this',
  'that',
  'what',
  'should',
  'from',
  'with',
  'your',
  '2025',
  '2026',
  'tcg',
]);

function buildEntitySearchTerms(entityName: string, entityType: SignalEntityType): string[] {
  if (entityType === 'set' || entityType === 'sealed') {
    const base = entityName
      .replace(/\s+(Booster Box|ETB|Booster Bundle|Collection Box|Sealed Product)$/i, '')
      .trim();
    return base.length >= 3 ? [base] : [];
  }
  if (entityType === 'card') return [entityName];
  const words = entityName
    .split(/[\s?!.,"']+/)
    .filter((w) => w.length >= 5 && !ENTITY_SEARCH_STOP.has(w.toLowerCase()));
  return words.slice(0, 3);
}

async function fetchSignalSources(input: {
  primaryId: number;
  primaryUrl: string | null;
  primaryTitle: string | null;
  primarySummary: string | null;
  primarySourceType: string | null;
  primaryCreatedAt: string | null;
  cardId: string | null;
  setName: string | null;
  entityName: string;
  entityType: SignalEntityType;
  category: SignalCategory;
}): Promise<{ sources: SignalSourceItem[]; byType: Record<string, number> }> {
  type DbRow = {
    id: number;
    source_url: string | null;
    source_type: string | null;
    title: string | null;
    summary: string | null;
    created_at: string | null;
  };

  const seenUrls = new Set<string>();
  const sources: SignalSourceItem[] = [];

  const pushRow = (row: DbRow) => {
    const url = row.source_url?.trim();
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    const cat = mapSignalCategory(row.source_type, null);
    sources.push({
      id: row.id,
      url,
      title: (row.title ?? 'Source').slice(0, 200),
      type: cat,
      typeLabel: SOURCE_TYPE_LABELS[cat] ?? cat.replace(/_/g, ' '),
      thumbnailUrl: sourceThumbnailUrl(url),
      summary: row.summary?.slice(0, 160) ?? null,
      publishedAt: row.created_at,
    });
  };

  if (input.primaryUrl) {
    pushRow({
      id: input.primaryId,
      source_url: input.primaryUrl,
      source_type: input.primarySourceType,
      title: input.primaryTitle,
      summary: input.primarySummary,
      created_at: input.primaryCreatedAt,
    });
  }

  const terms = buildEntitySearchTerms(input.entityName, input.entityType);
  const conditions: string[] = [];
  const params: unknown[] = [];

  const useCardId =
    input.cardId &&
    input.category !== 'set_release' &&
    input.entityType === 'card';
  if (useCardId) {
    conditions.push('card_id = ?');
    params.push(input.cardId);
  }
  if (input.setName) {
    if (input.entityType === 'set' || input.category === 'set_release') {
      // Title only — summaries include series name (e.g. "Mega Evolution") for unrelated sets.
      conditions.push('(set_name = ? OR title LIKE ?)');
      params.push(input.setName, `%${input.setName}%`);
    } else {
      conditions.push('(set_name = ? OR title LIKE ? OR summary LIKE ?)');
      params.push(input.setName, `%${input.setName}%`, `%${input.setName}%`);
    }
  }
  for (const term of terms) {
    if (input.setName && term.toLowerCase() === input.setName.toLowerCase()) continue;
    if (input.entityType === 'set' || input.category === 'set_release') {
      conditions.push('(title LIKE ? OR set_name LIKE ?)');
      params.push(`%${term}%`, `%${term}%`);
    } else {
      conditions.push('(title LIKE ? OR summary LIKE ? OR set_name LIKE ?)');
      params.push(`%${term}%`, `%${term}%`, `%${term}%`);
    }
  }

  if (conditions.length > 0) {
    const rows = await all<DbRow>(
      `SELECT id, source_url, source_type, title, summary, created_at
       FROM external_market_signals
       WHERE (expires_at IS NULL OR expires_at >= datetime('now'))
         AND source_url IS NOT NULL
         AND source_url != ''
         AND (${conditions.join(' OR ')})
       ORDER BY relevance_score DESC, created_at DESC
       LIMIT 14`,
      params
    );
    for (const row of rows) pushRow(row);
  }

  const byType: Record<string, number> = {};
  for (const s of sources) {
    byType[s.type] = (byType[s.type] ?? 0) + 1;
  }

  return { sources, byType };
}

export function computeSignalDirection(input: {
  sentiment: number;
  price7dPct: number | null;
  price30dPct: number | null;
  riskType: string | null;
  category: SignalCategory;
}): SignalDirection {
  const risk = (input.riskType ?? '').toLowerCase();
  if (/buyout|supply_shock|ban/i.test(risk) || input.category === 'ban_list') {
    if (input.sentiment < -0.2 || (input.price30dPct ?? 0) > 25) return 'high_risk';
  }

  const priceBlend =
    input.price7dPct != null || input.price30dPct != null
      ? (input.price7dPct ?? 0) * 0.35 + (input.price30dPct ?? 0) * 0.65
      : null;

  // Source-only signals default to "watching" — not neutral padding.
  if (priceBlend == null && (input.category === 'youtube' || input.category === 'reddit' || input.category === 'news')) {
    if (input.sentiment >= 0.22) return 'bullish';
    if (input.sentiment <= -0.22) return 'bearish';
    return 'watch';
  }

  let combined = input.sentiment;
  if (priceBlend != null) {
    const priceNorm = clamp(priceBlend / 25, -1, 1);
    combined = input.sentiment * 0.45 + priceNorm * 0.55;
  }

  if (combined >= 0.22) return 'bullish';
  if (combined <= -0.22) return 'bearish';
  if (Math.abs(combined) < 0.08 && (priceBlend == null || Math.abs(priceBlend) < 4)) return 'neutral';
  return 'watch';
}

export function computeOpportunityScore(input: {
  relevance: number;
  sentiment: number;
  direction: SignalDirection;
  price30dPct: number | null;
  volumeChangePct: number | null;
  sourceCount: number;
  hasMarketData: boolean;
}): number {
  const rel = clamp(input.relevance, 0, 1) * 100;
  const sentMag = Math.abs(input.sentiment) * 100;
  const dirBonus =
    input.direction === 'bullish'
      ? 18
      : input.direction === 'bearish'
        ? 12
        : input.direction === 'high_risk'
          ? 14
          : input.direction === 'watch'
            ? 8
            : 4;
  const priceBonus =
    input.price30dPct != null ? clamp(Math.abs(input.price30dPct) * 1.2, 0, 18) : 0;
  const volBonus =
    input.volumeChangePct != null && input.volumeChangePct > 5
      ? clamp(input.volumeChangePct / 4, 0, 12)
      : 0;
  const srcBonus = clamp(input.sourceCount * 4, 0, 16);
  const dataBonus = input.hasMarketData ? 10 : 0;

  return clamp(
    Math.round(rel * 0.22 + sentMag * 0.18 + dirBonus + priceBonus + volBonus + srcBonus + dataBonus),
    0,
    100
  );
}

export function computeSignalConfidence(input: {
  hasCardMetrics: boolean;
  hasSetMetrics: boolean;
  volumeChangePct: number | null;
  sourceCount: number;
  sparkPoints: number;
}): number {
  let c = 32;
  if (input.hasCardMetrics) c += 22;
  if (input.hasSetMetrics) c += 14;
  if (input.volumeChangePct != null) c += 12;
  if (input.sourceCount >= 2) c += 10;
  if (input.sourceCount >= 5) c += 8;
  if (input.sparkPoints >= 6) c += 8;
  return clamp(c, 28, 94);
}

function normalizeSparkline(points: SeriesPoint[]): number[] {
  if (points.length < 2) return [];
  const prices = points.map((p) => p.price).filter((p) => p > 0);
  if (prices.length < 2) return [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  return prices.map((p) => round2((p - min) / span));
}

function extractSetName(title: string | null, summary: string | null, setName: string | null): string | null {
  const fromTitle = (() => {
    if (!title) return null;
    const recent = /(?:Recent|Upcoming) Set:\s*(.+)$/i.exec(title);
    if (recent?.[1]) return recent[1].trim();
    return null;
  })();

  let name = fromTitle ?? setName?.trim() ?? null;
  if (!name && summary) {
    const quoted = /set "([^"]+)"/i.exec(summary);
    if (quoted?.[1]) name = quoted[1].trim();
  }

  if (!name) return null;
  // Strip redundant wrappers like `Pitch Black Set "Pitch Black"`.
  name = name.replace(/\s+Set\s+"([^"]+)"\s*$/i, ' $1').replace(/^Set\s+"([^"]+)"\s*$/i, '$1');
  name = name.replace(/^["']|["']$/g, '').trim();
  return name || null;
}

function cleanEventTitle(title: string | null, setName: string | null): string {
  if (setName) return setName;
  if (!title) return 'Market signal';
  return title
    .replace(/^(Recent|Upcoming) Set:\s*/i, '')
    .replace(/^Release calendar:\s*/i, '')
    .trim();
}

function parseEventDetail(title: string | null, summary: string | null, category: SignalCategory): string {
  const text = summary ?? title ?? '';
  const daysMatch = /released (\d+) days ago/i.exec(text);
  if (daysMatch) return `Released ${daysMatch[1]} days ago`;
  const untilMatch = /releasing in (\d+) days/i.exec(text);
  if (untilMatch) return `Releases in ${untilMatch[1]} days`;
  if (/hype period/i.test(text)) return 'Post-release hype window';
  if (/settling/i.test(text)) return 'Market normalization phase';
  if (category === 'tournament') return 'Competitive meta shift';
  if (category === 'ban_list') return 'Format restriction update';
  const created = title?.slice(0, 80);
  return created && created.length > 10 ? created : 'External market event detected';
}

function buildInterpretation(input: {
  direction: SignalDirection;
  metrics: SignalMetrics;
  category: SignalCategory;
  sentiment: number;
}): { observed: string; interpretation: string; opportunity: string; explanation: string } {
  const { metrics, direction, category, sentiment } = input;
  const parts: string[] = [];

  if (metrics.price30dPct != null) {
    parts.push(
      `Prices are ${metrics.price30dPct >= 0 ? 'up' : 'down'} ${Math.abs(round1(metrics.price30dPct))}% over 30 days`
    );
  } else if (metrics.price7dPct != null) {
    parts.push(
      `Prices moved ${metrics.price7dPct >= 0 ? '+' : ''}${round1(metrics.price7dPct)}% over 7 days`
    );
  }

  if (metrics.volumeChangePct != null) {
    const volDir = metrics.volumeChangePct >= 0 ? 'above' : 'below';
    parts.push(`sales volume remains ${Math.abs(round1(metrics.volumeChangePct))}% ${volDir} baseline`);
  }

  const observed =
    parts.length > 0
      ? parts.join(', while ') + '.'
      : sentiment > 0.15
        ? 'External sentiment skews positive without confirmed price follow-through yet.'
        : sentiment < -0.15
          ? 'External sentiment is negative; price impact may be developing.'
          : 'No strong price or volume divergence detected yet.';

  let interpretation = 'Signal is still forming — monitor for confirmation.';
  if (direction === 'bullish' && metrics.price30dPct != null && metrics.price30dPct < 0 && (metrics.volumeChangePct ?? 0) > 0) {
    interpretation = 'Price compression is slowing while demand holds above baseline.';
  } else if (direction === 'bullish') {
    interpretation = 'Demand signals and market behavior align toward upside.';
  } else if (direction === 'bearish') {
    interpretation = 'Supply or sentiment headwinds outweigh near-term demand.';
  } else if (direction === 'high_risk') {
    interpretation = 'Volatility elevated — timing risk dominates the thesis.';
  } else if (category === 'set_release') {
    interpretation = 'Post-release price discovery is still underway.';
  }

  let opportunity = 'Wait for clearer entry — signal not actionable yet.';
  if (direction === 'bullish' && category === 'set_release') {
    opportunity = 'Higher-rarity singles may be approaching accumulation range.';
  } else if (direction === 'bullish') {
    opportunity = 'Consider building exposure on pullbacks if liquidity supports exits.';
  } else if (direction === 'bearish') {
    opportunity = 'Reduce chase risk; favor liquidity over speculative holds.';
  } else if (direction === 'high_risk') {
    opportunity = 'Treat as tactical only — size small or wait for stabilization.';
  } else if (direction === 'watch') {
    opportunity = 'Add to watchlist; enter after price/volume confirmation.';
  }

  const explanation =
    parts.length >= 2
      ? `${parts[0]}, while ${parts.slice(1).join(', ')}.`
      : `${interpretation} ${opportunity}`.trim();

  return { observed, interpretation, opportunity, explanation };
}

function buildDrivers(input: {
  sentiment: number;
  metrics: SignalMetrics;
  sourceCount: number;
}): SignalDriver[] {
  const drivers: SignalDriver[] = [];

  const sentLevel: SignalDriver['level'] =
    input.sentiment > 0.35 ? 'up_strong' : input.sentiment > 0.1 ? 'up' : input.sentiment < -0.1 ? 'down' : 'flat';
  drivers.push({ key: 'sentiment', label: 'Sentiment', level: sentLevel });

  if (input.metrics.price30dPct != null) {
    drivers.push({
      key: 'price',
      label: 'Price',
      level:
        input.metrics.price30dPct > 8 ? 'up_strong' : input.metrics.price30dPct > 2 ? 'up' : input.metrics.price30dPct < -2 ? 'down' : 'flat',
    });
  }

  if (input.metrics.volumeChangePct != null) {
    drivers.push({
      key: 'volume',
      label: 'Volume',
      level:
        input.metrics.volumeChangePct > 15 ? 'up_strong' : input.metrics.volumeChangePct > 3 ? 'up' : input.metrics.volumeChangePct < -3 ? 'down' : 'flat',
    });
  }

  if (input.metrics.liquidityTier) {
    const liqLevel: SignalDriver['level'] =
      input.metrics.liquidityTier === 'strong' || input.metrics.liquidityTier === 'ok'
        ? 'up'
        : input.metrics.liquidityTier === 'illiquid'
          ? 'down'
          : 'flat';
    drivers.push({ key: 'liquidity', label: 'Liquidity', level: liqLevel });
  }

  if (input.sourceCount >= 3) {
    drivers.push({ key: 'social', label: 'Social interest', level: input.sourceCount >= 6 ? 'up_strong' : 'up' });
  }

  return drivers.slice(0, 5);
}

async function resolveSetNameVariants(setName: string): Promise<string[]> {
  const rows = await all<{ setName: string }>(
    `SELECT DISTINCT setName FROM card_mappings
     WHERE setName = ? OR setName LIKE '%' || ? || '%'
     ORDER BY CASE WHEN setName = ? THEN 0 ELSE 1 END, LENGTH(setName) ASC
     LIMIT 12`,
    [setName, setName, setName]
  );
  const names = rows.map((r) => r.setName).filter(Boolean);
  return names.length ? names : [setName];
}

async function fetchRawPrice(cardId: string): Promise<number | null> {
  const row = await all<{ rawPrice: number }>(
    `SELECT c.price AS rawPrice
     FROM card_mappings cm
     INNER JOIN canonical_price_history c ON c.uniqueIdentifier = cm.uniqueIdentifier
     WHERE cm.cardId = ? AND c.rowid = (
       SELECT c2.rowid FROM canonical_price_history c2
       WHERE c2.uniqueIdentifier = cm.uniqueIdentifier
       ORDER BY c2.date DESC LIMIT 1
     ) AND c.price > 0
     LIMIT 1`,
    [cardId]
  );
  return row[0]?.rawPrice ?? null;
}

async function fetchCardSeries(cardId: string, days: number): Promise<SeriesPoint[]> {
  return all<SeriesPoint>(
    `SELECT date, price FROM graded_price_history
     WHERE cardId = ? AND UPPER(grader) = 'PSA' AND grade = '10'
       AND price > 0 AND date >= date('now', ?)
     ORDER BY date ASC`,
    [cardId, `-${days} days`]
  );
}

async function fetchCardMarketSnapshot(cardId: string): Promise<{
  metrics: SignalMetrics;
  sparkline: number[];
  topAffectedCard: TopAffectedCard | null;
}> {
  const row = await all<{
    price: number;
    soldListings: number | null;
    fetchedAt: string | null;
    cardName: string | null;
    imageSmall: string | null;
    rarity: string | null;
  }>(
    `SELECT gp.price, gp.soldListings, gp.fetchedAt, cm.cardName, cm.imageSmall, cm.rarity
     FROM graded_prices gp
     LEFT JOIN card_mappings cm ON cm.cardId = gp.cardId
     WHERE gp.cardId = ? AND UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
     LIMIT 1`,
    [cardId]
  );

  const series30 = await fetchCardSeries(cardId, 30);
  const series7 = series30.length >= 2 ? series30.filter((p) => p.date >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)) : series30;

  let price7dPct: number | null = null;
  let price30dPct: number | null = null;
  if (series30.length >= 2) {
    const first = series30[0].price;
    const last = series30[series30.length - 1].price;
    price30dPct = computeChange(last, first).changePct;
  }
  if (series7.length >= 2) {
    const first = series7[0].price;
    const last = series7[series7.length - 1].price;
    price7dPct = computeChange(last, first).changePct;
  } else if (series30.length >= 2) {
    const slice = series30.slice(-Math.min(7, series30.length));
    price7dPct = computeChange(slice[slice.length - 1].price, slice[0].price).changePct;
  }

  let volumeChangePct: number | null = null;
  const volSeries = await all<{ date: string; soldListings: number | null }>(
    `SELECT date, soldListings FROM graded_price_history
     WHERE cardId = ? AND UPPER(grader) = 'PSA' AND grade = '10'
       AND date >= date('now', '-30 days') AND soldListings IS NOT NULL
     ORDER BY date ASC`,
    [cardId]
  );
  if (volSeries.length >= 4) {
    const mid = Math.floor(volSeries.length / 2);
    const early = volSeries.slice(0, mid);
    const late = volSeries.slice(mid);
    const avg = (arr: typeof volSeries) =>
      arr.reduce((s, r) => s + (r.soldListings ?? 0), 0) / Math.max(arr.length, 1);
    const earlyAvg = avg(early);
    const lateAvg = avg(late);
    if (earlyAvg > 0) volumeChangePct = round1(((lateAvg - earlyAvg) / earlyAvg) * 100);
  }

  const current = row[0];
  let liquidityTier: LiquidityTier | null = null;
  let liquidityLabel: string | null = null;
  if (current) {
    const liq = scoreLiquidity({
      soldListings: current.soldListings ?? 0,
      verified: true,
      stale: false,
      ageHours: null,
      matchScore: null,
      historyPoints: series30.length,
    });
    liquidityTier = liq.tier;
    liquidityLabel =
      liq.tier === 'strong' ? 'High' : liq.tier === 'ok' ? 'Moderate' : liq.tier === 'thin' ? 'Thin' : 'Low';
  }

  const sparkline = normalizeSparkline(series30.slice(-14));
  let topAffectedCard: TopAffectedCard | null = null;
  if (current?.cardName && current.price >= 35) {
    const rawPrice = await fetchRawPrice(cardId);
    const collectWeight = collectibilityWeight(current.rarity, current.cardName, current.price);
    if (collectWeight >= 0.4) {
      topAffectedCard = {
        cardId,
        cardName: current.cardName,
        imageSmall: current.imageSmall,
        change7dPct: price7dPct,
        changeAbs:
          price7dPct != null && current.price > 0
            ? round2((current.price * price7dPct) / 100)
            : null,
      };
    }
  }

  return {
    metrics: { price7dPct, price30dPct, volumeChangePct, liquidityTier, liquidityLabel },
    sparkline,
    topAffectedCard,
  };
}

async function fetchSetMarketSnapshot(setName: string): Promise<{
  metrics: SignalMetrics;
  sparkline: number[];
  topAffectedCard: TopAffectedCard | null;
}> {
  const variants = await resolveSetNameVariants(setName);
  const placeholders = variants.map(() => '?').join(', ');
  const cards = await all<{
    cardId: string;
    cardName: string | null;
    imageSmall: string | null;
    rarity: string | null;
    price: number;
    soldListings: number | null;
  }>(
    `SELECT gp.cardId, cm.cardName, cm.imageSmall, cm.rarity, gp.price, gp.soldListings
     FROM graded_prices gp
     INNER JOIN card_mappings cm ON cm.cardId = gp.cardId
     WHERE cm.setName IN (${placeholders})
       AND UPPER(gp.grader) = 'PSA' AND gp.grade = '10'
       AND COALESCE(gp.verified, 0) = 1 AND gp.price >= 25
     ORDER BY gp.price DESC
     LIMIT 14`,
    variants
  );

  if (cards.length === 0) {
    return {
      metrics: { price7dPct: null, price30dPct: null, volumeChangePct: null, liquidityTier: null, liquidityLabel: null },
      sparkline: [],
      topAffectedCard: null,
    };
  }

  const cardStats: Array<{
    card: typeof cards[0];
    c7: number;
    c30: number;
    weight: number;
    volChange: number | null;
  }> = [];

  let aggSpark: number[] = [];
  let totalVolEarly = 0;
  let totalVolLate = 0;
  let volSamples = 0;

  for (const card of cards) {
    const series = await fetchCardSeries(card.cardId, 30);
    if (series.length < 2) continue;

    const c30 = computeChange(series[series.length - 1].price, series[0].price).changePct;
    const slice7 = series.slice(-Math.min(7, series.length));
    const c7 =
      slice7.length >= 2
        ? computeChange(slice7[slice7.length - 1].price, slice7[0].price).changePct
        : c30;

    const weight = clamp(card.price / 100, 0.3, 3);
    cardStats.push({ card, c7, c30, weight, volChange: null });

    if (aggSpark.length === 0 && series.length >= 3 && card.price >= 80) {
      aggSpark = normalizeSparkline(series.slice(-14));
    }

    const volSeries = await all<{ soldListings: number | null }>(
      `SELECT soldListings FROM graded_price_history
       WHERE cardId = ? AND UPPER(grader) = 'PSA' AND grade = '10'
         AND date >= date('now', '-30 days') AND soldListings IS NOT NULL
       ORDER BY date ASC`,
      [card.cardId]
    );
    if (volSeries.length >= 4) {
      const mid = Math.floor(volSeries.length / 2);
      const early = volSeries.slice(0, mid);
      const late = volSeries.slice(mid);
      const avg = (arr: typeof volSeries) =>
        arr.reduce((s, r) => s + (r.soldListings ?? 0), 0) / Math.max(arr.length, 1);
      totalVolEarly += avg(early);
      totalVolLate += avg(late);
      volSamples += 1;
    }
  }

  let price7dPct: number | null = null;
  let price30dPct: number | null = null;
  if (cardStats.length > 0) {
    const wSum = cardStats.reduce((s, x) => s + x.weight, 0);
    price7dPct = round1(cardStats.reduce((s, x) => s + x.c7 * x.weight, 0) / wSum);
    price30dPct = round1(cardStats.reduce((s, x) => s + x.c30 * x.weight, 0) / wSum);
  }

  let volumeChangePct: number | null = null;
  if (volSamples > 0 && totalVolEarly > 0) {
    volumeChangePct = round1(((totalVolLate / volSamples - totalVolEarly / volSamples) / (totalVolEarly / volSamples)) * 100);
  }

  const soldNow = cards.reduce((s, c) => s + (c.soldListings ?? 0), 0);
  const liq = scoreLiquidity({
    soldListings: soldNow,
    verified: true,
    stale: false,
    ageHours: null,
    matchScore: null,
    historyPoints: cardStats.length,
  });

  let bestMover: TopAffectedCard | null = null;
  let bestScore = -1;
  for (const stat of cardStats) {
    if (!stat.card.cardName) continue;
    const collectScore =
      economicMoveScore(stat.c7, stat.card.price) *
      collectibilityWeight(stat.card.rarity, stat.card.cardName, stat.card.price);
    if (collectScore > bestScore && stat.card.price >= 50 && collectibilityWeight(stat.card.rarity, stat.card.cardName, stat.card.price) >= 0.35) {
      bestScore = collectScore;
      bestMover = {
        cardId: stat.card.cardId,
        cardName: stat.card.cardName,
        imageSmall: stat.card.imageSmall,
        change7dPct: round1(stat.c7),
        changeAbs: round2((stat.card.price * stat.c7) / 100),
      };
    }
  }

  // Fallback: highest-value chase card in set (not a random common mover).
  if (!bestMover) {
    const anchor = cards.find((c) => c.cardName && c.price >= 50) ?? cards[0];
    if (anchor?.cardName) {
      bestMover = {
        cardId: anchor.cardId,
        cardName: anchor.cardName,
        imageSmall: anchor.imageSmall,
        change7dPct: null,
        changeAbs: null,
      };
    }
  }

  return {
    metrics: {
      price7dPct,
      price30dPct,
      volumeChangePct,
      liquidityTier: liq.tier,
      liquidityLabel:
        liq.tier === 'strong' ? 'High' : liq.tier === 'ok' ? 'Moderate' : liq.tier === 'thin' ? 'Thin' : 'Low',
    },
    sparkline: aggSpark,
    topAffectedCard: bestMover,
  };
}

export async function enrichInvestmentSignal(raw: RawExternalSignal): Promise<InvestmentSignal> {
  const category = mapSignalCategory(raw.sourceType, raw.riskType);
  const resolvedSet = extractSetName(raw.title, raw.summary, raw.setName);
  const eventTitle = cleanEventTitle(raw.title, resolvedSet);
  const eventDetail = parseEventDetail(raw.title, raw.summary, category);

  let metrics: SignalMetrics = {
    price7dPct: null,
    price30dPct: null,
    volumeChangePct: null,
    liquidityTier: null,
    liquidityLabel: null,
  };
  let sparkline: number[] = [];
  let topAffectedCard: TopAffectedCard | null = null;
  let hasCardMetrics = false;
  let hasSetMetrics = false;

  if (category === 'set_release' && resolvedSet) {
    const snap = await fetchSetMarketSnapshot(resolvedSet);
    metrics = snap.metrics;
    sparkline = snap.sparkline;
    topAffectedCard = snap.topAffectedCard;
    hasSetMetrics = metrics.price30dPct != null || metrics.price7dPct != null;
  } else if (raw.cardId && raw.cardName) {
    const snap = await fetchCardMarketSnapshot(raw.cardId);
    metrics = snap.metrics;
    sparkline = snap.sparkline;
    topAffectedCard = snap.topAffectedCard;
    hasCardMetrics = metrics.price7dPct != null || metrics.price30dPct != null;
  } else if (resolvedSet) {
    const snap = await fetchSetMarketSnapshot(resolvedSet);
    metrics = snap.metrics;
    sparkline = snap.sparkline;
    topAffectedCard = snap.topAffectedCard;
    hasSetMetrics = metrics.price30dPct != null || metrics.price7dPct != null;
  }

  const direction = computeSignalDirection({
    sentiment: raw.sentiment,
    price7dPct: metrics.price7dPct,
    price30dPct: metrics.price30dPct,
    riskType: raw.riskType,
    category,
  });

  const marketConfirmed = hasMarketConfirmation(metrics, sparkline);
  const entity = resolveSignalEntity({
    title: raw.title,
    summary: raw.summary,
    setName: resolvedSet,
    cardName: raw.cardName ?? topAffectedCard?.cardName ?? null,
    category,
  });
  const entityLabel = buildEntityLabel(entity.entityType, entity.entityName);

  const { sources, byType: sourcesByType } = await fetchSignalSources({
    primaryId: raw.id,
    primaryUrl: raw.sourceUrl,
    primaryTitle: raw.title,
    primarySummary: raw.summary,
    primarySourceType: raw.sourceType,
    primaryCreatedAt: raw.createdAt,
    cardId: raw.cardId,
    setName: resolvedSet ?? raw.setName,
    entityName: entity.entityName,
    entityType: entity.entityType,
    category,
  });
  const sourceCount = Math.max(sources.length, 1);

  const releaseDays = parseReleaseDaysAgo(eventDetail);
  const stalePenalty = staleReleasePenalty(releaseDays, category);

  let rawPriceForBulk: number | null = null;
  if (category === 'set_release') {
    if (topAffectedCard?.cardId) {
      const anchorRows = await all<{ price: number }>(
        `SELECT price FROM graded_prices
         WHERE cardId = ? AND UPPER(grader) = 'PSA' AND grade = '10'
           AND COALESCE(verified, 0) = 1
         ORDER BY fetchedAt DESC LIMIT 1`,
        [topAffectedCard.cardId]
      );
      rawPriceForBulk = anchorRows[0]?.price ?? null;
    }
  } else if (raw.cardId) {
    rawPriceForBulk = await fetchRawPrice(raw.cardId);
  }

  const bulk = applyBulkAndEconomicScoring({
    marketPrice: rawPriceForBulk ?? (category === 'set_release' ? 20 : null),
    changeAbs: topAffectedCard?.changeAbs ?? null,
    changePct: metrics.price30dPct ?? metrics.price7dPct,
    momentumDays: 30,
    soldListings:
      metrics.liquidityTier === 'strong' ? 10 : metrics.liquidityTier === 'ok' ? 5 : 1,
    liquidityTier: metrics.liquidityTier,
    buyoutScore: 0,
    velocityRatio: null,
    listedCount: null,
    listedCountPrev: null,
    netSentiment: raw.sentiment,
    hasCatalyst:
      category === 'tournament' ||
      category === 'ban_list' ||
      (category === 'set_release' && releaseDays != null && releaseDays <= 45),
    compMomentumPct: null,
  });

  let opportunityScore = computeOpportunityScore({
    relevance: raw.relevance,
    sentiment: raw.sentiment,
    direction,
    price30dPct: metrics.price30dPct,
    volumeChangePct: metrics.volumeChangePct,
    sourceCount,
    hasMarketData: hasCardMetrics || hasSetMetrics,
  });
  opportunityScore = clamp(
    Math.round(opportunityScore + bulk.economicBoost - bulk.penalty - stalePenalty),
    0,
    100
  );
  opportunityScore = boostSourceOnlyScore(
    opportunityScore,
    category,
    raw.relevance,
    raw.sentiment
  );

  const confidence = computeSignalConfidence({
    hasCardMetrics,
    hasSetMetrics,
    volumeChangePct: metrics.volumeChangePct,
    sourceCount,
    sparkPoints: sparkline.length,
  });

  const signalTitle = buildSignalTitle({
    entityName: entity.entityName,
    entityType: entity.entityType,
    direction,
    category,
    hasMarketConfirmation: marketConfirmed,
    metrics,
  });
  const sourceSummary = buildSourceSummary(sourcesByType, sources);
  const whyItMatters = buildWhyItMatters({
    category,
    direction,
    metrics,
    evidence: { totalSources: sourceCount, byType: sourcesByType, sources },
    hasMarketConfirmation: marketConfirmed,
    eventDetail,
  });
  const signalTier = classifySignalTier({
    opportunityScore,
    confidence,
    hasMarketConfirmation: marketConfirmed,
    direction,
  });

  const copy = buildInterpretation({ direction, metrics, category, sentiment: raw.sentiment });
  const drivers = buildDrivers({ sentiment: raw.sentiment, metrics, sourceCount });

  let explanation = copy.explanation;
  if (stalePenalty >= 28 && releaseDays != null) {
    explanation = `Legacy release (${releaseDays}d ago) — limited near-term upside. ${explanation}`;
  } else if (bulk.overrideActive && rawPriceForBulk != null && rawPriceForBulk < 5) {
    explanation = buildBulkAwareWhy({
      marketPrice: rawPriceForBulk,
      bulk,
      baseWhy: explanation,
    });
  }

  return {
    id: raw.id,
    signalTitle,
    entityLabel,
    entityType: entity.entityType,
    sourceTitle: raw.title,
    signalTier,
    hasMarketConfirmation: marketConfirmed,
    whyItMatters,
    sourceSummary,
    eventTitle,
    eventDetail,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    observedEffect: copy.observed,
    interpretation: copy.interpretation,
    opportunity: copy.opportunity,
    explanation,
    direction,
    directionLabel: DIRECTION_LABELS[direction],
    opportunityScore,
    confidence,
    horizon: HORIZON_BY_CATEGORY[category] ?? '2–8 weeks',
    metrics,
    sparkline,
    cardId: raw.cardId,
    cardName: raw.cardName,
    setName: resolvedSet,
    topAffectedCard,
    sourceUrl: raw.sourceUrl,
    createdAt: raw.createdAt,
    sources,
    evidence: { totalSources: sourceCount, byType: sourcesByType, sources },
    drivers,
  };
}

export function buildMarketPulse(signals: InvestmentSignal[], analyzedLast24h = 0): MarketPulse {
  const pulse: MarketPulse = {
    bullish: 0,
    bearish: 0,
    watch: 0,
    neutral: 0,
    highRisk: 0,
    total: signals.length,
    analyzedLast24h,
    bullishInsight: null,
    watchInsight: null,
    highRiskInsight: null,
    strongestSignal: null,
    highestRisk: null,
  };

  let bestScore = -1;
  let worstRisk = -1;

  for (const s of signals) {
    if (s.direction === 'bullish') pulse.bullish++;
    else if (s.direction === 'bearish') pulse.bearish++;
    else if (s.direction === 'watch') pulse.watch++;
    else if (s.direction === 'high_risk') pulse.highRisk++;
    else pulse.neutral++;

    const actionable =
      s.signalTier === 'actionable' && s.opportunityScore >= 35 && s.direction !== 'neutral';

    if (actionable && s.opportunityScore > bestScore) {
      bestScore = s.opportunityScore;
      pulse.strongestSignal = {
        signalTitle: s.signalTitle,
        entityLabel: s.entityLabel,
        detail: `${s.directionLabel} · Score ${s.opportunityScore} · Based on ${s.evidence.totalSources} source${s.evidence.totalSources === 1 ? '' : 's'}`,
        score: s.opportunityScore,
        confidence: s.confidence,
        sourceCount: s.evidence.totalSources,
      };
    }
    if (s.direction === 'high_risk' && s.opportunityScore > worstRisk) {
      worstRisk = s.opportunityScore;
      pulse.highestRisk = {
        signalTitle: s.signalTitle,
        entityLabel: s.entityLabel,
        detail: s.explanation.slice(0, 100),
        score: s.opportunityScore,
      };
    }
  }

  pulse.bullishInsight = summarizeDirectionInsight(signals, 'bullish');
  pulse.watchInsight = summarizeDirectionInsight(signals, 'watch');
  pulse.highRiskInsight =
    pulse.highRisk === 0
      ? 'None currently flagged'
      : summarizeDirectionInsight(signals, 'high_risk');

  return pulse;
}

export function partitionSignalsByTier(signals: InvestmentSignal[]): {
  actionable: InvestmentSignal[];
  emerging: InvestmentSignal[];
} {
  const actionable = signals.filter((s) => s.signalTier === 'actionable');
  const emerging = signals.filter(
    (s) => s.signalTier === 'emerging' || s.signalTier === 'monitor'
  );
  return { actionable, emerging };
}

export type SignalSort = 'score' | 'confidence' | 'newest' | 'price_impact' | 'volume';

export function sortInvestmentSignals(
  signals: InvestmentSignal[],
  sort: SignalSort
): InvestmentSignal[] {
  const copy = [...signals];
  switch (sort) {
    case 'confidence':
      return copy.sort((a, b) => b.confidence - a.confidence);
    case 'newest':
      return copy.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    case 'price_impact':
      return copy.sort(
        (a, b) =>
          Math.abs(b.metrics.price30dPct ?? b.metrics.price7dPct ?? 0) -
          Math.abs(a.metrics.price30dPct ?? a.metrics.price7dPct ?? 0)
      );
    case 'volume':
      return copy.sort(
        (a, b) => (b.metrics.volumeChangePct ?? 0) - (a.metrics.volumeChangePct ?? 0)
      );
    case 'score':
    default:
      return copy.sort((a, b) => b.opportunityScore - a.opportunityScore);
  }
}
