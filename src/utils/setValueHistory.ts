import { SetValueHistoryPoint } from '../services/setTrackerService';

export type SetValueHistoryRow = {
  date: string;
  setValue: number;
  cardsPriced: number;
};

const MIN_COVERAGE = 0.5;
const MIN_VALUE_RATIO = 0.25;

/** Drop leading days with sparse pricing before the set total is meaningful. */
export function trimUnreliableSetValueHistory<T extends SetValueHistoryRow>(
  history: T[],
  totalCatalogCards?: number
): T[] {
  if (history.length <= 1) return history;

  const peakPriced =
    totalCatalogCards && totalCatalogCards > 0
      ? totalCatalogCards
      : Math.max(...history.map((p) => p.cardsPriced));

  const peakValue = Math.max(...history.map((p) => p.setValue));
  if (peakPriced <= 0 || peakValue <= 0) return history;

  const minCards = Math.ceil(peakPriced * MIN_COVERAGE);
  const minValue = peakValue * MIN_VALUE_RATIO;

  const startIdx = history.findIndex(
    (p) => p.cardsPriced >= minCards && p.setValue >= minValue
  );

  if (startIdx <= 0) return startIdx === -1 ? [] : history;
  return history.slice(startIdx);
}

export function toReliableSetPricePoints(
  history: SetValueHistoryPoint[],
  totalCatalogCards?: number
): { date: string; price: number }[] {
  return trimUnreliableSetValueHistory(history, totalCatalogCards).map((p) => ({
    date: p.date,
    price: p.setValue,
  }));
}
