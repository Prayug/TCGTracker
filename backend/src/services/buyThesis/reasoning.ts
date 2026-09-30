/**
 * Deterministic reasoning formatter — plain-English for collectors.
 * Signals stay structured; this layer turns them into scannable copy.
 */

import type {
  BuyCategory,
  BuyThesisReasoning,
  BuyThesisScores,
  BuyThesisSignal,
  ConfidenceTier,
  FakeOpportunityFlag,
  FairValueRange,
} from './types';
import { BUY_CATEGORY_LABELS } from './types';

const MEANING: Record<BuyCategory, string> = {
  strong_buy:
    'The measurable data leans clearly in favor of buying near current prices — if you already like the card.',
  buy: 'The setup looks reasonably attractive versus recent prices, with more support than caution.',
  watch:
    'Not a clear buy yet — worth tracking for a better entry or confirmation from price/liquidity.',
  hold_fair_value:
    'Price looks roughly in line with recent history. No strong edge either way from the data we have.',
  avoid: 'The data does not support buying here — risk or weak setup outweighs any upside signals.',
  high_risk:
    'Treat this as speculative: spikes, thin trading, or other red flags dominate the picture.',
  insufficient_data:
    'We do not have enough reliable price history to form a buy opinion on this card.',
};

function money(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `$${n.toFixed(2)}`;
}

function pct(n: number | null | undefined, digits = 1): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

/** Turn a typed signal into a short collector-facing sentence. */
export function humanizeSignal(signal: BuyThesisSignal): string {
  const e = signal.evidence;
  switch (signal.id) {
    case 'value_vs_fair': {
      const price = money(Number(e.currentPrice));
      const fair = money(Number(e.trimmedFairValue));
      const d = e.discountPct != null ? Number(e.discountPct) : null;
      if (price && fair && d != null) {
        return d > 0
          ? `Trading at ${price}, about ${Math.abs(d).toFixed(1)}% under its recent typical level (${fair}).`
          : `Trading at ${price}, about ${Math.abs(d).toFixed(1)}% above its recent typical level (${fair}).`;
      }
      break;
    }
    case 'momentum': {
      const c30 = e.change30d != null ? pct(Number(e.change30d)) : null;
      const c7 = e.change7d != null ? pct(Number(e.change7d)) : null;
      if (c30) {
        return Number(e.change30d) >= 0
          ? `Up ${c30.replace('+', '')} over the last 30 days.`
          : `Down ${c30.replace('-', '')} over the last 30 days.`;
      }
      if (c7) {
        return Number(e.change7d) >= 0
          ? `Up ${c7.replace('+', '')} over the last week.`
          : `Down ${c7.replace('-', '')} over the last week.`;
      }
      break;
    }
    case 'mean_reversion': {
      const drop = e.recentDrop != null ? Math.abs(Number(e.recentDrop)) : null;
      if (drop != null) {
        return e.hasStabilized
          ? `Pulled back about ${drop.toFixed(0)}% from a recent high, and the slide looks like it has leveled off.`
          : `Pulled back about ${drop.toFixed(0)}% from a recent high, but price has not clearly stabilized yet.`;
      }
      break;
    }
    case 'liquidity': {
      const pts = e.historyLength != null ? Number(e.historyLength) : null;
      const vol = e.avgVolume30d != null ? Number(e.avgVolume30d) : null;
      if (pts != null && pts >= 30 && (vol == null || vol >= 15)) {
        return `Plenty of recent quotes${vol != null ? ` (avg volume ~${Math.round(vol)})` : ''} — easier to enter or exit.`;
      }
      if (pts != null && pts < 10) {
        return `Very few price prints (${pts}) — hard to trust the quote.`;
      }
      break;
    }
    case 'grading_spread': {
      const raw = money(Number(e.raw));
      const psa10 = money(Number(e.psa10));
      const roi = e.netRoiPct != null ? Number(e.netRoiPct) : null;
      if (raw && psa10 && roi != null) {
        const thin =
          e.thinComps === true ? ' Sold comps look thin, so that gap may be hard to realize.' : '';
        return `PSA 10 around ${psa10} vs raw ${raw} — rough net grading upside near ${roi.toFixed(0)}%.${thin}`;
      }
      break;
    }
    case 'population_scarcity': {
      const pop = e.psa10Pop != null ? Number(e.psa10Pop) : null;
      if (pop != null) {
        return pop < 200
          ? `PSA 10 population is low (${pop}) — scarcity can support premiums.`
          : `PSA 10 population is ${pop}${pop > 5000 ? ' (relatively common)' : ''}.`;
      }
      break;
    }
    case 'buyout_manipulation':
    case 'outlier_spike': {
      const spike = e.maxSpike14d != null ? Number(e.maxSpike14d) : null;
      if (spike != null) {
        return `Saw a sharp ~${spike.toFixed(0)}% move recently — that can reverse quickly in thin markets.`;
      }
      break;
    }
    case 'stale_data': {
      const days = e.daysSinceLastQuote != null ? Number(e.daysSinceLastQuote) : null;
      if (days != null) {
        return `Last market quote is ${days} days old — the listed price may be outdated.`;
      }
      break;
    }
    case 'thin_market':
      return 'Trading looks thin — small orders can move the price a lot.';
    case 'source_inconsistency': {
      const spread = e.sourceSpreadPct != null ? Number(e.sourceSpreadPct) : null;
      if (spread != null) {
        return `Different price sources disagree by about ${spread.toFixed(0)}% — fair value is fuzzy.`;
      }
      break;
    }
    case 'comparable_cards': {
      const rel = e.relativeValuePct != null ? Number(e.relativeValuePct) : null;
      const n = e.peerCount != null ? Number(e.peerCount) : null;
      if (rel != null && n != null) {
        return rel > 0
          ? `Cheaper than ${n} similar cards by about ${rel.toFixed(0)}% (peer median).`
          : `Priced about ${Math.abs(rel).toFixed(0)}% above ${n} similar cards.`;
      }
      break;
    }
    case 'price_forecast': {
      const ret = e.expected30dReturn != null ? Number(e.expected30dReturn) * 100 : null;
      const conf = e.confidence != null ? Number(e.confidence) : null;
      if (ret != null) {
        const confBit = conf != null ? ` (model confidence ${Math.round(conf)}%)` : '';
        return `Our price model leans ${ret >= 0 ? 'up' : 'down'} about ${Math.abs(ret).toFixed(1)}% over ~30 days${confBit}.`;
      }
      break;
    }
    case 'set_age_rotation': {
      const age = e.setAgeDays != null ? Number(e.setAgeDays) : null;
      if (age != null && age < 45) {
        return `Set is only ${age} days old — product is still opening, so supply can keep rising.`;
      }
      break;
    }
    case 'volatility_risk': {
      const vol = e.monthlyVolatility != null ? Number(e.monthlyVolatility) * 100 : null;
      if (vol != null && vol > 15) {
        return `Price swings are elevated (~${vol.toFixed(0)}% monthly volatility).`;
      }
      break;
    }
    case 'rarity_status': {
      const rarity = e.rarity != null ? String(e.rarity) : null;
      if (rarity) {
        return signal.bullish
          ? `${rarity} — typically scarcer and more collectible than commons.`
          : `${rarity} — common print, so upside from scarcity alone is limited.`;
      }
      break;
    }
    case 'supply_demand':
      // Prefer more specific rarity/age signals; keep summary short if used
      break;
    default:
      break;
  }
  // Fallback: ensure sentence punctuation
  const s = signal.summary.trim();
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function meaningFor(
  category: BuyCategory,
  currentPrice: number | null,
  fairValue: FairValueRange | null
): string {
  const base = MEANING[category];
  const price = money(currentPrice);
  if (fairValue && price && category !== 'insufficient_data') {
    const mid = money(fairValue.mid);
    if (mid) {
      return `${base} Recent fair band centers near ${mid} (roughly ${money(fairValue.low)}–${money(fairValue.high)}).`;
    }
  }
  if (price && (category === 'strong_buy' || category === 'buy' || category === 'watch')) {
    return `${base} Current ask around ${price}.`;
  }
  return base;
}

function confidenceBlurb(
  tier: ConfidenceTier,
  reasons: string[],
  historyHint?: string | null
): string {
  const because =
    reasons[0] ||
    historyHint ||
    (tier === 'high' ? 'dense recent market quotes' : 'limited corroborating evidence');
  if (tier === 'high') {
    return `We're fairly sure about this read because ${because}.`;
  }
  if (tier === 'medium') {
    return `We're moderately sure because ${because} — treat it as a guide, not a sure thing.`;
  }
  return `We're not very sure yet (${because}). A Strong/Buy lean with low confidence means "interesting, but thin evidence."`;
}

export function formatReasoning(input: {
  category: BuyCategory;
  scores: BuyThesisScores;
  signals: BuyThesisSignal[];
  flags: FakeOpportunityFlag[];
  currentPrice: number | null;
  fairValue?: FairValueRange | null;
  confidenceTier?: ConfidenceTier;
  confidenceReasons?: string[];
}): BuyThesisReasoning {
  const { category, scores, signals, flags, currentPrice } = input;
  const sorted = [...signals].sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength));

  const whyBuy = sorted
    .filter((s) => s.bullish && s.strength > 0.12)
    .slice(0, 3)
    .map(humanizeSignal);

  const whyNotFromSignals = sorted
    .filter((s) => !s.bullish && s.strength < -0.12)
    .slice(0, 3)
    .map(humanizeSignal);

  const whyNotFromFlags = flags
    .filter((f) => f.severity !== 'info')
    .slice(0, 2)
    .map((f) => (/[.!?]$/.test(f.message.trim()) ? f.message.trim() : `${f.message.trim()}.`));

  const whyNot = [...whyNotFromSignals, ...whyNotFromFlags].slice(0, 4);

  const label = BUY_CATEGORY_LABELS[category];
  const priceBit = currentPrice != null ? ` · ${money(currentPrice)}` : '';
  const headline = `${label}${priceBit}`;

  const meaning = meaningFor(category, currentPrice, input.fairValue ?? null);
  const tier = input.confidenceTier ?? 'medium';
  const hist = signals.find((s) => s.id === 'data_quality' || s.id === 'liquidity');
  const confText = confidenceBlurb(tier, input.confidenceReasons ?? [], hist?.summary ?? null);

  void scores; // scores stay on the analysis object; not mixed into hero copy

  return {
    headline,
    meaning,
    confidenceBlurb: confText,
    whyBuy:
      whyBuy.length > 0
        ? whyBuy
        : category === 'insufficient_data'
          ? ['Not enough sales or quotes to build a buy case.']
          : ['No clear attractive angles in the price and liquidity data we have.'],
    whyNot:
      whyNot.length > 0 ? whyNot : ['No major red flags stood out in risk or liquidity checks.'],
    disclaimer:
      'Based on measurable price, liquidity, and graded data when available — relative context, not financial advice.',
  };
}
