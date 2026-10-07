/**
 * Hobby capital rotation — loads qualified raw + PSA 10 movers (chase floors),
 * drops bulk commons, then aggregates via moneyFlowAggregate.
 */

import {
  MONEY_FLOW_PSA10_MIN_PRICE,
  MONEY_FLOW_RAW_MIN_PRICE,
  classifyMoneyFlowEra,
  detectSpecialCohorts,
  isMoneyFlowRelevantPrint,
  normalizeMoneyFlowDays,
  type MoneyFlowFinish,
  type MoneyFlowResponse,
} from '@tcgtracker/shared';
import { buildMoneyFlowFromTagged, type TaggedMover } from './moneyFlowAggregate';
import { listQualifiedRawMovers, type RawMoverEntry } from './rawTopMovers';
import { listQualifiedSlabMovers, type SlabMoverEntry } from './slabTopMovers';

export type { TaggedMover } from './moneyFlowAggregate';
export { buildMoneyFlowFromTagged } from './moneyFlowAggregate';

const FLOW_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; payload: MoneyFlowResponse }>();

/** Smaller path-filter pool than top-movers — money-flow cares about cohorts, not every $1 print. */
const FLOW_CANDIDATE_POOL = 180;

function toTagged(entry: RawMoverEntry | SlabMoverEntry, finish: MoneyFlowFinish): TaggedMover {
  const era = classifyMoneyFlowEra({ id: entry.setId, name: entry.setName });
  const specials = detectSpecialCohorts({
    name: entry.productName,
    rarity: entry.rarity,
    era,
  });
  return {
    changePercent: entry.changePercent,
    currentPrice: entry.currentPrice,
    previousPrice: entry.previousPrice,
    dollarMove: entry.currentPrice - entry.previousPrice,
    era,
    finish,
    specials,
    exemplar: {
      productName: entry.productName,
      changePercent: entry.changePercent,
      currentPrice: entry.currentPrice,
      previousPrice: entry.previousPrice,
      imageSmall: entry.imageSmall,
      imageLarge: entry.imageLarge,
      cardId: entry.cardId,
      setId: entry.setId,
      setName: entry.setName,
      rarity: entry.rarity,
      finish,
    },
  };
}

export async function getMoneyFlow(days: number): Promise<MoneyFlowResponse> {
  const windowDays = normalizeMoneyFlowDays(days);
  const cacheKey = `v3:${windowDays}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const [rawUniverse, slabUniverse] = await Promise.all([
    listQualifiedRawMovers(windowDays, {
      minPrice: MONEY_FLOW_RAW_MIN_PRICE,
      minAbsDollar: 2,
      candidatePool: FLOW_CANDIDATE_POOL,
      cacheNamespace: 'money-flow',
    }),
    listQualifiedSlabMovers(windowDays, {
      minPrice: MONEY_FLOW_PSA10_MIN_PRICE,
      minAbsDollar: 5,
      candidatePool: FLOW_CANDIDATE_POOL,
      cacheNamespace: 'money-flow',
    }),
  ]);

  const rawTagged = rawUniverse.movers.map((m) => toTagged(m, 'raw'));
  const slabTagged = slabUniverse.movers.map((m) => toTagged(m, 'psa10'));
  const beforeFilter = rawTagged.length + slabTagged.length;

  const tagged: TaggedMover[] = [...rawTagged, ...slabTagged].filter((m) =>
    isMoneyFlowRelevantPrint({
      rarity: m.exemplar.rarity,
      name: m.exemplar.productName,
      currentPrice: m.currentPrice,
      finish: m.finish,
    })
  );
  const filteredOutCount = Math.max(0, beforeFilter - tagged.length);

  const asOfDate = rawUniverse.date || slabUniverse.date;
  const payload = buildMoneyFlowFromTagged(windowDays, tagged, asOfDate, filteredOutCount);

  cache.set(cacheKey, { expiresAt: Date.now() + FLOW_TTL_MS, payload });
  return payload;
}
