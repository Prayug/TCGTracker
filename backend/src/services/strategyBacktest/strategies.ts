/**
 * Strategies the Investments page backtests side by side.
 *
 * Research on Feb–Oct 2026 raw TCGplayer data (weekly, cards ≥ $20, entry at
 * the real ask, exit net of ~13% fees + shipping) found no simple signal that
 * made money outright: the median card lost 14–17% round trip. What did help
 * was not overpaying ("fair entry": the cheapest listing sits just under
 * market) and not buying right after a spike. Momentum and dip-buying are kept
 * so the page can show, with current data, that they don't add anything.
 */
import { SignalContext, Strategy, priceAt, trailingReturn } from './engine';

/** A ≥50% rise in four weeks: buying here historically meant buying the top. */
export const SPIKE_RETURN_4W = 0.5;

export function isSpike(ctx: SignalContext): boolean {
  const r = trailingReturn(ctx.prices, ctx.t, 4);
  return r != null && r >= SPIKE_RETURN_4W;
}

/** Lowest listing ÷ market price this week, or null without a listing. */
export function askRatio(ctx: SignalContext): number | null {
  const market = priceAt(ctx.prices, ctx.t);
  const low = ctx.lows ? priceAt(ctx.lows, ctx.t) : null;
  return market != null && low != null ? low / market : null;
}

export const FAIR_ENTRY_MIN_PRICE = 50;
export const FAIR_ENTRY_RATIO: [number, number] = [0.85, 1.0];

/** Fair-entry screen: ≥ $50, cheapest listing 0–15% under market, no recent spike. */
export function isFairEntry(ctx: SignalContext): boolean {
  const price = priceAt(ctx.prices, ctx.t);
  const ratio = askRatio(ctx);
  return (
    price != null &&
    price >= FAIR_ENTRY_MIN_PRICE &&
    ratio != null &&
    ratio >= FAIR_ENTRY_RATIO[0] &&
    ratio < FAIR_ENTRY_RATIO[1] &&
    !isSpike(ctx)
  );
}

export const fairEntry: Strategy = {
  id: 'fair_entry',
  label: 'Fair entry',
  description:
    'Cards $50+ where the cheapest listing is within 15% under market and the price has not just spiked.',
  score: (ctx) => {
    if (!isFairEntry(ctx)) return null;
    // Prefer the tightest asks, then steadier cards.
    const ratio = askRatio(ctx) ?? 0;
    const r12 = trailingReturn(ctx.prices, ctx.t, 12);
    return ratio - Math.abs(r12 ?? 0) * 0.05;
  },
  takeAll: true,
};

export const noSpikes: Strategy = {
  id: 'avoid_spikes',
  label: 'Anything but spikes',
  description: 'Every card except those up 50% or more in the last four weeks.',
  score: (ctx) => (isSpike(ctx) ? null : 0),
  takeAll: true,
};

export const momentum: Strategy = {
  id: 'momentum_4w',
  label: 'Momentum',
  description: 'The biggest four-week gainers.',
  score: (ctx) => trailingReturn(ctx.prices, ctx.t, 4),
};

export const buyTheDip: Strategy = {
  id: 'dip_4w',
  label: 'Buy the dip',
  description: 'The biggest four-week losers.',
  score: (ctx) => {
    const r = trailingReturn(ctx.prices, ctx.t, 4);
    return r == null ? null : -r;
  },
};

export const ALL_STRATEGIES: Strategy[] = [fairEntry, noSpikes, momentum, buyTheDip];
