/**
 * Decide which number is the headline "market estimate" for a card + finish,
 * and say exactly what it is. Precedence:
 *   1. Latest observation in the finish's own price series (dated).
 *   2. TCGplayer market price for that finish (listing-derived, undated).
 *   3. Catalog snapshot price on the card record (finish may differ).
 * Asking prices (listing low/mid) are never promoted to the headline.
 */
export interface QuoteInputs {
  history: Array<{ date: string; price: number }>;
  finishMarket: number | null;
  catalogPrice: number | null;
  finishLabel: string;
  isOnePiece: boolean;
  now?: Date;
}

export interface Quote {
  value: number | null;
  kind: 'Market estimate';
  source: string;
  detail: string | null;
  asOf: string | null;
  stale: boolean;
  /** Why this basis was used, for the provenance tooltip. */
  note: string;
}

const STALE_DAYS = 14;

export function resolveQuote(input: QuoteInputs): Quote {
  const now = input.now ?? new Date();
  const source = input.isOnePiece ? 'Market' : 'TCGplayer';
  const detail = input.isOnePiece ? null : `${input.finishLabel} · Near Mint`;
  const last = [...input.history].filter((p) => p.price > 0).pop();
  if (last) {
    const t = Date.parse(last.date);
    const ageDays = Number.isFinite(t) ? (now.getTime() - t) / 86_400_000 : Infinity;
    const stale = ageDays > STALE_DAYS;
    // A stale series loses to a live finish quote when one exists.
    if (!stale || !(input.finishMarket && input.finishMarket > 0)) {
      return {
        value: last.price,
        kind: 'Market estimate',
        source,
        detail,
        asOf: last.date,
        stale,
        note: 'Latest daily snapshot for this finish.',
      };
    }
  }
  if (input.finishMarket && input.finishMarket > 0) {
    return {
      value: input.finishMarket,
      kind: 'Market estimate',
      source,
      detail,
      asOf: null,
      stale: false,
      note: 'TCGplayer market price for this finish (recent sales-weighted).',
    };
  }
  if (input.catalogPrice && input.catalogPrice > 0) {
    return {
      value: input.catalogPrice,
      kind: 'Market estimate',
      source: 'Catalog snapshot',
      detail: input.isOnePiece ? null : 'finish not specified',
      asOf: null,
      stale: false,
      note: 'Only the catalog snapshot is available; it may describe a different finish.',
    };
  }
  return {
    value: null,
    kind: 'Market estimate',
    source,
    detail,
    asOf: null,
    stale: false,
    note: 'No market price is available for this finish.',
  };
}

/**
 * Two figures describe the same thing only if they are within ±25%.
 * Beyond that, the UI must say they are not comparable.
 */
export function figuresDisagree(
  a: number | null | undefined,
  b: number | null | undefined,
  tolerance = 0.25
): boolean {
  if (!a || !b || a <= 0 || b <= 0) return false;
  const ratio = a / b;
  return ratio > 1 + tolerance || ratio < 1 / (1 + tolerance);
}
