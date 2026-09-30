/**
 * Hobby capital rotation — loads qualified raw + PSA 10 movers, then aggregates
 * into era / finish / special cohorts via moneyFlowAggregate.
 */

import {
  classifyMoneyFlowEra,
  detectSpecialCohorts,
  type MoneyFlowFinish,
  type MoneyFlowResponse,
} from '@tcgtracker/shared';
import { buildMoneyFlowFromTagged, type TaggedMover } from './moneyFlowAggregate';
import { listQualifiedRawMovers, type RawMoverEntry } from './rawTopMovers';
import { listQualifiedSlabMovers, type SlabMoverEntry } from './slabTopMovers';

export type { TaggedMover } from './moneyFlowAggregate';
export { buildMoneyFlowFromTagged } from './moneyFlowAggregate';

const FLOW_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; payload: MoneyFlowResponse }>();

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
  const windowDays = days === 30 ? 30 : 7;
  const cacheKey = `v1:${windowDays}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const [rawUniverse, slabUniverse] = await Promise.all([
    listQualifiedRawMovers(windowDays),
    listQualifiedSlabMovers(windowDays),
  ]);

  const tagged: TaggedMover[] = [
    ...rawUniverse.movers.map((m) => toTagged(m, 'raw')),
    ...slabUniverse.movers.map((m) => toTagged(m, 'psa10')),
  ];

  const asOfDate = rawUniverse.date || slabUniverse.date;
  const payload = buildMoneyFlowFromTagged(windowDays, tagged, asOfDate);
  // Prefer exact universe sizes from loaders (same as tagged counts for finishes).
  payload.headline.rawSampleSize = rawUniverse.movers.length;
  payload.headline.slabSampleSize = slabUniverse.movers.length;

  cache.set(cacheKey, { expiresAt: Date.now() + FLOW_TTL_MS, payload });
  return payload;
}
