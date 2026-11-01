/**
 * Which cards and slabs the Investments eBay search should look up.
 *
 * The names come from research that already exists:
 * - fair-entry picks on the strategy report (raw cards the backtest would buy)
 * - slab opportunity rows graded watch or better (PSA 10 scores)
 *
 * This module does not score anything. It only keeps rows that belong to the
 * active game and caps how many eBay searches that list becomes.
 */
import { dbAll } from '../db/promisified';
import {
  OPPORTUNITY_GRADE_CUTS,
  getOpportunities,
  type OpportunityGrade,
  type OpportunityRow,
} from './investmentOpportunitiesService';
import { getStrategyReport, type StrategyPick } from './strategyBacktest/service';

export const INVESTMENT_EBAY_MAX_RAW = 15;
export const INVESTMENT_EBAY_MAX_SLABS = 12;
const TARGET_TTL_MS = 30 * 60 * 1000;

export interface InvestmentEbayTarget {
  cardId: string;
  cardName: string | null;
  setName: string | null;
  kind: 'raw' | 'slab';
  source: 'fair_entry' | 'opportunity';
  grade: OpportunityGrade | null;
  score: number | null;
}

type CatalogGame = 'pokemon' | 'onepiece';

export function selectInvestmentEbayTargets(input: {
  picks: Array<Pick<StrategyPick, 'cardId' | 'name' | 'setName'>>;
  opportunities: Array<Pick<OpportunityRow, 'cardId' | 'cardName' | 'setName' | 'grade' | 'score'>>;
  /** Catalog ids for the game currently selected. Other games' rows are skipped. */
  gameCardIds: Set<string>;
  maxRaw?: number;
  maxSlabs?: number;
}): InvestmentEbayTarget[] {
  const maxRaw = input.maxRaw ?? INVESTMENT_EBAY_MAX_RAW;
  const maxSlabs = input.maxSlabs ?? INVESTMENT_EBAY_MAX_SLABS;
  const raw: InvestmentEbayTarget[] = [];
  const seenRaw = new Set<string>();
  for (const pick of input.picks) {
    if (!pick.cardId || !input.gameCardIds.has(pick.cardId) || seenRaw.has(pick.cardId)) continue;
    seenRaw.add(pick.cardId);
    raw.push({
      cardId: pick.cardId,
      cardName: pick.name,
      setName: pick.setName,
      kind: 'raw',
      source: 'fair_entry',
      grade: null,
      score: null,
    });
    if (raw.length >= maxRaw) break;
  }

  const slabs: InvestmentEbayTarget[] = [];
  const seenSlab = new Set<string>();
  for (const row of input.opportunities) {
    if (row.grade === 'pass') continue;
    if (!row.cardId || !input.gameCardIds.has(row.cardId) || seenSlab.has(row.cardId)) continue;
    seenSlab.add(row.cardId);
    slabs.push({
      cardId: row.cardId,
      cardName: row.cardName,
      setName: row.setName,
      kind: 'slab',
      source: 'opportunity',
      grade: row.grade,
      score: row.score,
    });
    if (slabs.length >= maxSlabs) break;
  }

  return [...raw, ...slabs];
}

async function idsPresentInGame(game: CatalogGame, ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const placeholders = unique.map(() => '?').join(', ');
  if (game === 'onepiece') {
    const rows = await dbAll<{ catalogId: string }>(
      `SELECT catalogId FROM onepiece_catalog WHERE catalogId IN (${placeholders})`,
      unique
    );
    return new Set(rows.map((row) => row.catalogId));
  }
  const rows = await dbAll<{ cardId: string }>(
    `SELECT DISTINCT cardId FROM card_mappings WHERE cardId IN (${placeholders})`,
    unique
  );
  return new Set(rows.map((row) => row.cardId));
}

const targetMemo = new Map<CatalogGame, { at: number; targets: InvestmentEbayTarget[] }>();

export function peekInvestmentEbayTargets(game: CatalogGame): InvestmentEbayTarget[] | null {
  const cached = targetMemo.get(game);
  if (!cached || Date.now() - cached.at > TARGET_TTL_MS) return null;
  return cached.targets;
}

/**
 * Fair-entry picks and PSA 10 opportunity scores are built from the Pokemon
 * TCGplayer feed and card mappings. One Piece deals exist, but that research
 * does not name One Piece cards, so this returns an empty list for that game.
 */
export async function listInvestmentEbayTargets(
  game: CatalogGame,
  refresh = false
): Promise<InvestmentEbayTarget[]> {
  if (game !== 'pokemon') return [];

  const cached = targetMemo.get(game);
  if (!refresh && cached && Date.now() - cached.at < TARGET_TTL_MS) return cached.targets;

  const [report, opportunities] = await Promise.all([
    getStrategyReport({ market: 'raw', horizonWeeks: 8 }),
    getOpportunities({
      minScore: OPPORTUNITY_GRADE_CUTS.watch,
      limit: INVESTMENT_EBAY_MAX_SLABS + 20,
    }),
  ]);
  const ids = [
    ...report.picks.map((pick) => pick.cardId).filter((id): id is string => Boolean(id)),
    ...opportunities.rows.map((row) => row.cardId),
  ];
  const gameCardIds = await idsPresentInGame(game, ids);
  const targets = selectInvestmentEbayTargets({
    picks: report.picks,
    opportunities: opportunities.rows,
    gameCardIds,
  });
  targetMemo.set(game, { at: Date.now(), targets });
  return targets;
}
