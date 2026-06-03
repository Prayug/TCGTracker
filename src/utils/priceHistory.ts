import { PricePoint } from '../types/pokemon';

export function toIsoDate(value: string): string {
  return value.includes('T') ? value.split('T')[0] : value;
}

/**
 * Fills calendar gaps in daily price series using the last known market price.
 * TCGPlayer/CSV feeds often skip weekends or failed sync days — this keeps charts continuous.
 */
export function fillPriceHistoryGaps(
  points: PricePoint[],
  options?: { maxGapDays?: number }
): { points: PricePoint[]; filledDayCount: number } {
  if (points.length === 0) {
    return { points: [], filledDayCount: 0 };
  }

  const maxGapDays = options?.maxGapDays ?? 14;
  const byDate = new Map<string, number>();

  for (const point of points) {
    const key = toIsoDate(point.date);
    if (point.price > 0) {
      byDate.set(key, point.price);
    }
  }

  const sortedKeys = Array.from(byDate.keys()).sort();
  if (sortedKeys.length === 0) {
    return { points: [], filledDayCount: 0 };
  }

  const firstDate = new Date(`${sortedKeys[0]}T00:00:00Z`);
  const lastDate = new Date(`${sortedKeys[sortedKeys.length - 1]}T00:00:00Z`);
  const filled: PricePoint[] = [];
  let filledDayCount = 0;
  let lastKnown: number | null = null;
  let gapRun = 0;

  const cursor = new Date(firstDate);
  while (cursor <= lastDate) {
    const key = cursor.toISOString().slice(0, 10);

    if (byDate.has(key)) {
      lastKnown = byDate.get(key) as number;
      gapRun = 0;
      filled.push({ date: key, price: lastKnown });
    } else if (lastKnown !== null && gapRun < maxGapDays) {
      filled.push({ date: key, price: lastKnown });
      filledDayCount += 1;
      gapRun += 1;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { points: filled, filledDayCount };
}
