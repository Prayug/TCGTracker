export const FAIR_PCT = 5;
export const SLIGHT_PCT = 15;

export type TradeVerdictKind =
  | 'empty'
  | 'incomplete'
  | 'fair'
  | 'slight_you'
  | 'slight_them'
  | 'leans_you'
  | 'leans_them';

export interface TradeLineInput {
  quantity: number;
  unitPrice: number | null;
}

export interface SideTotals {
  value: number;
  missing: number;
  priced: number;
}

export interface TradeEvaluation {
  give: SideTotals;
  get: SideTotals;
  cashGive: number;
  cashGet: number;
  delta: number;
  imbalancePct: number;
  kind: TradeVerdictKind;
  favors: 'you' | 'them' | 'even' | null;
}

export function effectiveUnitPrice(
  marketPrice: number | null | undefined,
  override?: number | null
): number | null {
  if (override != null && Number.isFinite(override) && override > 0) return override;
  if (marketPrice != null && Number.isFinite(marketPrice) && marketPrice > 0) return marketPrice;
  return null;
}

export function sideTotals(lines: TradeLineInput[], cash = 0): SideTotals {
  const safeCash = Number.isFinite(cash) && cash > 0 ? cash : 0;
  let value = safeCash;
  let missing = 0;
  let priced = 0;

  for (const line of lines) {
    const qty = Number.isFinite(line.quantity) ? Math.max(0, line.quantity) : 0;
    if (qty <= 0) continue;
    const price = effectiveUnitPrice(line.unitPrice);
    if (price == null) {
      missing += 1;
      continue;
    }
    value += price * qty;
    priced += 1;
  }

  return { value, missing, priced };
}

function verdictKind(imbalancePct: number, empty: boolean, incomplete: boolean): TradeVerdictKind {
  if (empty) return 'empty';
  if (incomplete) return 'incomplete';
  const abs = Math.abs(imbalancePct);
  if (abs <= FAIR_PCT) return 'fair';
  if (imbalancePct > 0) return abs <= SLIGHT_PCT ? 'slight_you' : 'leans_you';
  return abs <= SLIGHT_PCT ? 'slight_them' : 'leans_them';
}

export function evaluateTrade(input: {
  give: TradeLineInput[];
  get: TradeLineInput[];
  cashGive?: number;
  cashGet?: number;
}): TradeEvaluation {
  const cashGive =
    Number.isFinite(input.cashGive) && (input.cashGive ?? 0) > 0 ? (input.cashGive as number) : 0;
  const cashGet =
    Number.isFinite(input.cashGet) && (input.cashGet ?? 0) > 0 ? (input.cashGet as number) : 0;
  const give = sideTotals(input.give, cashGive);
  const get = sideTotals(input.get, cashGet);

  const hasLines = input.give.some((l) => l.quantity > 0) || input.get.some((l) => l.quantity > 0);
  const hasCash = cashGive > 0 || cashGet > 0;
  const empty = !hasLines && !hasCash;
  const incomplete =
    !empty && give.value + get.value === 0 && (give.missing > 0 || get.missing > 0);

  const larger = Math.max(give.value, get.value);
  const delta = get.value - give.value;
  const imbalancePct = larger > 0 ? (delta / larger) * 100 : 0;
  const kind = verdictKind(imbalancePct, empty, incomplete);

  let favors: TradeEvaluation['favors'] = null;
  if (kind === 'fair') favors = 'even';
  else if (kind === 'slight_you' || kind === 'leans_you') favors = 'you';
  else if (kind === 'slight_them' || kind === 'leans_them') favors = 'them';

  return { give, get, cashGive, cashGet, delta, imbalancePct, kind, favors };
}

export const VERDICT_COPY: Record<TradeVerdictKind, { title: string; hint: string }> = {
  empty: {
    title: 'Add cards to both sides',
    hint: 'Search the catalog or pull from your vault. Optional cash evens an unbalanced offer.',
  },
  incomplete: {
    title: 'Need market prices',
    hint: 'Some cards have no quote — set a custom price or pick a different print.',
  },
  fair: {
    title: 'Fair trade',
    hint: `Sides are within ${FAIR_PCT}% of the larger total.`,
  },
  slight_you: {
    title: 'Slightly in your favor',
    hint: 'Close enough that most collectors would take it.',
  },
  slight_them: {
    title: 'Slightly in their favor',
    hint: 'Ask for a small cash sweeter or a cheaper swap.',
  },
  leans_you: {
    title: 'Unbalanced — you come out ahead',
    hint: 'The other side is leaving a lot on the table.',
  },
  leans_them: {
    title: 'Unbalanced — you give more',
    hint: 'Ask for cash or drop a card before you accept.',
  },
};
