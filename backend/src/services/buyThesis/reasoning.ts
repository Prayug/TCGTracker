/**
 * Deterministic reasoning formatter from signals + scores.
 * Concise, number-backed, bullish AND bearish. No marketing fluff.
 */

import type {
  BuyCategory,
  BuyThesisReasoning,
  BuyThesisScores,
  BuyThesisSignal,
  FakeOpportunityFlag,
} from './types';
import { BUY_CATEGORY_LABELS } from './types';

export function formatReasoning(input: {
  category: BuyCategory;
  scores: BuyThesisScores;
  signals: BuyThesisSignal[];
  flags: FakeOpportunityFlag[];
  currentPrice: number | null;
}): BuyThesisReasoning {
  const { category, scores, signals, flags, currentPrice } = input;

  const sorted = [...signals].sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength));
  const whyBuy = sorted
    .filter((s) => s.bullish && s.strength > 0.12)
    .slice(0, 4)
    .map((s) => s.summary);

  const whyNot = [
    ...sorted
      .filter((s) => !s.bullish && s.strength < -0.12)
      .slice(0, 4)
      .map((s) => s.summary),
    ...flags
      .filter((f) => f.severity !== 'info')
      .slice(0, 2)
      .map((f) => f.message),
  ].slice(0, 5);

  const priceBit = currentPrice != null ? ` at $${currentPrice.toFixed(2)}` : '';
  const headline = `${BUY_CATEGORY_LABELS[category]}${priceBit} — opportunity ${Math.round(
    scores.opportunity
  )}/100 (risk ${Math.round(scores.risk)}, data ${Math.round(scores.dataQuality)}).`;

  return {
    headline,
    whyBuy:
      whyBuy.length > 0
        ? whyBuy
        : category === 'insufficient_data'
          ? ['Not enough measurable market evidence to support a buy case.']
          : ['No strong bullish signals from available market data.'],
    whyNot:
      whyNot.length > 0 ? whyNot : ['No major red flags from available risk/liquidity checks.'],
    disclaimer:
      'Relative market analysis from measurable price, liquidity, and graded data — not financial advice.',
  };
}
