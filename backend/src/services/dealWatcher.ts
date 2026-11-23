import { dbAll, dbGet, dbRun } from '../db/promisified';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { isEmailConfigured, sendEmail } from './emailService';
import {
  CCG_INDIVIDUAL_CARDS_CATEGORY,
  EBAY_BROWSE_PAGE_SIZE,
  getEbayCooldownRemainingMs,
  isEbayBrowseConfigured,
  searchEbayListings,
  type EbayListingSummary,
} from './ebayBrowseClient';
import {
  evaluateListing,
  rememberWatcherDeals,
  type DealCardPayload,
  type DealGame,
} from './ebayDealService';
import {
  alertRejection,
  alertRulesFromEnv,
  emptyNewSetIndex,
  formatDealAlertEmail,
  isNewSetDeal,
  pickNewestOnePieceSets,
  pickRecentPokemonSets,
  sortAlerts,
  type DealAlert,
  type DealAlertRules,
  type NewSetIndex,
} from './dealWatchRules';

/**
 * Background eBay deal watcher.
 *
 * Every DEAL_WATCH_INTERVAL_MIN minutes it pulls the newest Pokémon and One Piece
 * listings (newest-first, only back to the last check), scores each one with the
 * same matcher and market pricing as the Deals page, and emails the ones that
 * clear the alert bar. Cards from newly released sets get their own searches and
 * a looser bar. Each listing is emailed at most once.
 *
 * Cost: roughly 6 Browse calls per game per cycle plus extra pages on busy
 * cycles, so ~1.5–2.5k calls/day at the 15 minute default.
 */

interface WatcherConfig {
  enabled: boolean;
  intervalMs: number;
  games: DealGame[];
  to: string | null;
  newSetDays: number;
  rules: DealAlertRules;
  maxPerEmail: number;
}

function watcherConfigFromEnv(e: NodeJS.ProcessEnv = process.env): WatcherConfig {
  const minutes = Number(e.DEAL_WATCH_INTERVAL_MIN || 15);
  const games = (e.DEAL_WATCH_GAMES || 'pokemon,onepiece')
    .split(',')
    .map((g) => g.trim().toLowerCase())
    .filter((g): g is DealGame => g === 'pokemon' || g === 'onepiece');
  return {
    enabled: (e.DEAL_WATCH_ENABLED ?? 'true').toLowerCase() !== 'false',
    intervalMs: Math.max(5, Number.isFinite(minutes) ? minutes : 15) * 60_000,
    games: games.length ? games : ['pokemon', 'onepiece'],
    to: (e.DEAL_ALERT_EMAIL || env.email.user || '').trim() || null,
    newSetDays: Number(e.DEAL_WATCH_NEW_SET_DAYS || 90) || 90,
    rules: alertRulesFromEnv(e),
    maxPerEmail: 20,
  };
}

interface WatchQuery {
  label: string;
  query: string;
  buyingOptions: 'FIXED_PRICE' | 'AUCTION';
  sort: 'newlyListed' | 'endingSoonest';
  priceMin?: number;
  priceMax?: number;
  maxPages: number;
}

/** Listings created within this much before the last watermark are re-checked. */
const WATERMARK_OVERLAP_MS = 3 * 60_000;
/** Auctions are only alertable once their price is close to final. */
const AUCTION_ALERT_HOURS = 2;
const NEW_SET_CACHE_MS = 6 * 60 * 60_000;
const EVAL_CONCURRENCY = 4;

function watchPlan(game: DealGame, newSets: NewSetIndex): WatchQuery[] {
  const word = game === 'onepiece' ? 'One Piece' : 'Pokemon';
  const plan: WatchQuery[] = [];
  // New sets first so a rate limit later in the cycle doesn't cost them.
  for (const search of newSets.searches) {
    plan.push({
      label: `new:${search}`,
      query: search,
      buyingOptions: 'FIXED_PRICE',
      sort: 'newlyListed',
      priceMin: 5,
      maxPages: 2,
    });
  }
  for (const [min, max] of [
    [10, 40],
    [40, 150],
    [150, undefined],
  ] as const) {
    plan.push({
      label: `bin:${min}-${max ?? 'up'}`,
      query: word,
      buyingOptions: 'FIXED_PRICE',
      sort: 'newlyListed',
      priceMin: min,
      priceMax: max,
      maxPages: 5,
    });
  }
  plan.push({
    label: 'auction:ending',
    query: word,
    buyingOptions: 'AUCTION',
    sort: 'endingSoonest',
    priceMin: 15,
    maxPages: 1,
  });
  return plan;
}

async function ensureWatcherTables(): Promise<void> {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS deal_watch_state (
      state_key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await dbRun(`
    CREATE TABLE IF NOT EXISTS deal_watch_alerts (
      listing_id TEXT PRIMARY KEY,
      game TEXT NOT NULL,
      card_id TEXT NOT NULL,
      card_name TEXT NOT NULL,
      listing_url TEXT NOT NULL,
      all_in_cost REAL NOT NULL,
      market_value REAL NOT NULL,
      discount_percent REAL NOT NULL,
      new_set INTEGER NOT NULL DEFAULT 0,
      alerted_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function getWatermark(key: string): Promise<number | null> {
  const row = await dbGet<{ value: string }>(
    'SELECT value FROM deal_watch_state WHERE state_key = ?',
    [key]
  );
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) ? n : null;
}

async function setWatermark(key: string, ms: number): Promise<void> {
  await dbRun(
    `INSERT INTO deal_watch_state (state_key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(state_key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, String(ms)]
  );
}

async function alreadyAlerted(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const rows = await dbAll<{ listing_id: string }>(
      `SELECT listing_id FROM deal_watch_alerts WHERE listing_id IN (${chunk.map(() => '?').join(',')})`,
      chunk
    );
    for (const r of rows) out.add(r.listing_id);
  }
  return out;
}

async function recordAlerts(alerts: DealAlert[]): Promise<void> {
  for (const { game, deal, isNewSet } of alerts) {
    await dbRun(
      `INSERT OR IGNORE INTO deal_watch_alerts
         (listing_id, game, card_id, card_name, listing_url, all_in_cost, market_value, discount_percent, new_set)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deal.listingId,
        game,
        deal.cardId,
        deal.cardName,
        deal.listingUrl,
        deal.allInCost,
        deal.marketValue,
        deal.discountPercent,
        isNewSet ? 1 : 0,
      ]
    );
  }
}

const newSetCache = new Map<DealGame, { at: number; index: NewSetIndex }>();

async function loadNewSetIndex(game: DealGame, days: number): Promise<NewSetIndex> {
  const cached = newSetCache.get(game);
  if (cached && Date.now() - cached.at < NEW_SET_CACHE_MS) return cached.index;
  let index = emptyNewSetIndex();
  try {
    if (game === 'pokemon') {
      const rows = await dbAll<{ setId: string; setName: string; setReleaseDate: string | null }>(
        `SELECT setId, MAX(setName) AS setName, MAX(setReleaseDate) AS setReleaseDate
         FROM catalog_cards
         WHERE COALESCE(language, 'en') = 'en' AND setReleaseDate IS NOT NULL
         GROUP BY setId`
      );
      index = pickRecentPokemonSets(rows, new Date(), days);
    } else {
      const rows = await dbAll<{ setId: string; setName: string }>(
        'SELECT DISTINCT setId, setName FROM onepiece_catalog'
      );
      index = pickNewestOnePieceSets(rows);
    }
  } catch (err) {
    logger.warn('Deal watcher could not load new sets', {
      game,
      error: (err as Error).message,
    });
  }
  newSetCache.set(game, { at: Date.now(), index });
  return index;
}

function hoursUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (t - Date.now()) / 3_600_000 : null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

interface GameCycleResult {
  game: DealGame;
  fetched: number;
  candidates: number;
  scored: number;
  alerts: DealAlert[];
  rateLimited: boolean;
  newSets: NewSetIndex;
}

/** Pull new listings for one game and return the ones worth an email. */
async function runGameCycle(
  game: DealGame,
  config: WatcherConfig,
  dryRun = false
): Promise<GameCycleResult> {
  const newSets = await loadNewSetIndex(game, config.newSetDays);
  const plan = watchPlan(game, newSets);
  const candidates = new Map<string, EbayListingSummary>();
  let fetched = 0;
  let rateLimited = false;

  for (const q of plan) {
    if (rateLimited) break;
    const key = `${game}:${q.label}`;
    const watermark = q.sort === 'newlyListed' ? await getWatermark(key) : null;
    // First time a search runs: remember where "now" is without emailing the backlog.
    // A dry run scores that first page instead, and never moves the watermark.
    const firstRun = q.sort === 'newlyListed' && watermark == null;
    const baseline = firstRun && !dryRun;
    const since = watermark != null ? watermark - WATERMARK_OVERLAP_MS : 0;
    let newest = watermark ?? 0;

    for (let page = 0; page < q.maxPages; page += 1) {
      if ((await getEbayCooldownRemainingMs()) > 5_000) {
        rateLimited = true;
        break;
      }
      const res = await searchEbayListings({
        query: q.query,
        limit: EBAY_BROWSE_PAGE_SIZE,
        offset: page * EBAY_BROWSE_PAGE_SIZE,
        categoryId: CCG_INDIVIDUAL_CARDS_CATEGORY,
        buyingOptions: q.buyingOptions,
        sort: q.sort,
        priceMin: q.priceMin,
        priceMax: q.priceMax,
      });
      if (res.error === 'rate_limited') {
        rateLimited = true;
        break;
      }
      if (res.error || res.listings.length === 0) break;
      fetched += res.listings.length;

      let reachedKnown = false;
      for (const listing of res.listings) {
        if (q.sort === 'newlyListed') {
          const created = listing.createdDate ? Date.parse(listing.createdDate) : NaN;
          if (Number.isFinite(created)) {
            newest = Math.max(newest, created);
            if (created < since) {
              reachedKnown = true;
              continue;
            }
          }
          if (!baseline) candidates.set(listing.listingId, listing);
        } else {
          const h = hoursUntil(listing.endDate);
          if (h != null && h >= 0 && h <= AUCTION_ALERT_HOURS) {
            candidates.set(listing.listingId, listing);
          }
        }
      }
      if (firstRun || reachedKnown || res.listings.length < EBAY_BROWSE_PAGE_SIZE) break;
    }

    if (!dryRun && q.sort === 'newlyListed' && newest > 0 && newest !== watermark) {
      await setWatermark(key, newest);
    }
  }

  const pending = [...candidates.values()];
  const skip = await alreadyAlerted(pending.map((l) => l.listingId));
  const toScore = pending.filter((l) => !skip.has(l.listingId));

  const scored: DealCardPayload[] = [];
  const alerts: DealAlert[] = [];
  await mapPool(toScore, EVAL_CONCURRENCY, async (listing) => {
    try {
      const deal = await evaluateListing(listing, game, null, undefined);
      if (!deal) return;
      scored.push(deal);
      const isNewSet = isNewSetDeal(deal, newSets);
      if (alertRejection(deal, isNewSet, config.rules) == null) {
        alerts.push({ game, deal, isNewSet });
      }
    } catch (err) {
      logger.warn('Deal watcher could not score listing', {
        listingId: listing.listingId,
        error: (err as Error).message,
      });
    }
  });

  // Let the Deals page show what the watcher found too.
  if (!dryRun) rememberWatcherDeals(game, scored);

  return {
    game,
    fetched,
    candidates: toScore.length,
    scored: scored.length,
    alerts,
    rateLimited,
    newSets,
  };
}

/** Alerts that were found but whose email failed; retried next cycle. */
let unsent: DealAlert[] = [];
let cycleRunning = false;

export interface DealWatchCycleResult {
  games: Array<Omit<GameCycleResult, 'alerts' | 'newSets'> & { alerts: number }>;
  alerts: DealAlert[];
  emailed: boolean;
  skipped?: string;
}

export async function runDealWatchCycle(
  opts: { dryRun?: boolean } = {}
): Promise<DealWatchCycleResult> {
  const config = watcherConfigFromEnv();
  if (cycleRunning) return { games: [], alerts: [], emailed: false, skipped: 'already_running' };
  if (!isEbayBrowseConfigured()) {
    return { games: [], alerts: [], emailed: false, skipped: 'ebay_not_configured' };
  }
  cycleRunning = true;
  const started = Date.now();
  try {
    await ensureWatcherTables();
    const results: GameCycleResult[] = [];
    for (const game of config.games) {
      results.push(await runGameCycle(game, config, opts.dryRun));
      if (results[results.length - 1].rateLimited) break;
    }

    const found = results.flatMap((r) => r.alerts);
    const byId = new Map<string, DealAlert>();
    for (const a of [...unsent, ...found]) byId.set(a.deal.listingId, a);
    const all = sortAlerts([...byId.values()]);
    const batch = all.slice(0, config.maxPerEmail);

    let emailed = false;
    if (batch.length && !opts.dryRun) {
      if (!config.to || !isEmailConfigured()) {
        logger.warn('Deal watcher found deals but email is not configured', {
          deals: batch.length,
        });
      } else {
        const { subject, text } = formatDealAlertEmail(batch, {
          appUrl: env.appUrl,
          newSetLabels: Object.fromEntries(results.map((r) => [r.game, r.newSets.labels])),
        });
        emailed = await sendEmail({ to: config.to, subject, text });
      }
      if (emailed) {
        // Anything past the per-email cap is recorded too, so a flood doesn't trickle in for hours.
        await recordAlerts(all);
        unsent = [];
      } else {
        unsent = all.slice(0, 50);
      }
    }

    const summary = results.map((r) => ({
      game: r.game,
      fetched: r.fetched,
      candidates: r.candidates,
      scored: r.scored,
      alerts: r.alerts.length,
      rateLimited: r.rateLimited,
    }));
    logger.info('Deal watcher cycle finished', {
      seconds: Math.round((Date.now() - started) / 1000),
      games: summary,
      emailed,
      alerts: batch.length,
    });
    return { games: summary, alerts: batch, emailed };
  } finally {
    cycleRunning = false;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

export function startDealWatcher(): void {
  const config = watcherConfigFromEnv();
  if (!config.enabled) {
    logger.info('Deal watcher disabled (DEAL_WATCH_ENABLED=false)');
    return;
  }
  if (!isEbayBrowseConfigured()) {
    logger.warn('Deal watcher not started: eBay Browse API is not configured');
    return;
  }
  if (!isEmailConfigured() || !config.to) {
    logger.warn('Deal watcher not started: SMTP or DEAL_ALERT_EMAIL is not configured');
    return;
  }
  if (timer) return;
  logger.info('Deal watcher started', {
    everyMinutes: config.intervalMs / 60_000,
    games: config.games,
    rules: config.rules,
  });
  const tick = async () => {
    try {
      await runDealWatchCycle();
    } catch (err) {
      logger.error('Deal watcher cycle failed', { error: (err as Error).message });
    } finally {
      timer = setTimeout(() => void tick(), config.intervalMs);
    }
  };
  // Give startup jobs a head start before spending Browse calls.
  timer = setTimeout(() => void tick(), 90_000);
}

export function stopDealWatcher(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
