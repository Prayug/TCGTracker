/**
 * Collector-facing narration for buy thesis.
 * Structured signals stay on the API; this layer speaks hold / grade / wait / chase.
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

/** Short answer you'd tell a friend: "Worth buying now?" */
const FRIEND_ANSWER: Record<BuyCategory, string> = {
  strong_buy: "Yeah — I'd buy near this price if you actually want the card.",
  buy: "I'd pick one up at this level. I wouldn't overpay chasing it though.",
  watch: "I'd wait. Not a must-buy yet — check back if it cools off.",
  hold_fair_value: 'Fine to hold if you like it. Nothing special about the price right now.',
  avoid: "I'd pass for now and put the money into something cleaner.",
  high_risk: "Only if you're okay with a flip that can go wrong — feels like a chase.",
  insufficient_data: 'Hard to say — almost no recent sales trail to go on.',
};

function money(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return `$${n.toFixed(2)}`;
}

/** Collector English from a typed signal. $/% support the story, not the headline. */
export function humanizeSignal(signal: BuyThesisSignal): string {
  const e = signal.evidence;
  switch (signal.id) {
    case 'value_vs_fair': {
      const price = money(Number(e.currentPrice));
      const d = e.discountPct != null ? Number(e.discountPct) : null;
      if (price && d != null) {
        if (d >= 8) {
          return `Sitting a bit cheaper than it's been lately (around ${price}).`;
        }
        if (d <= -8) {
          return `Price looks a little hot versus where it's been sitting (around ${price}).`;
        }
        return `Priced about where this card has been trading lately (${price}).`;
      }
      break;
    }
    case 'momentum': {
      const c30 = e.change30d != null ? Number(e.change30d) : null;
      const c7 = e.change7d != null ? Number(e.change7d) : null;
      if (c30 != null) {
        if (c30 >= 10) return `Been climbing lately — up about ${c30.toFixed(0)}% this month.`;
        if (c30 <= -10)
          return `Cooled off lately — down about ${Math.abs(c30).toFixed(0)}% this month.`;
        return `Price has been fairly steady the past month.`;
      }
      if (c7 != null) {
        if (c7 >= 5) return `Moved up this week — selling a bit hotter than usual.`;
        if (c7 <= -5) return `Softened this week — fewer buyers stepping in.`;
      }
      break;
    }
    case 'mean_reversion': {
      const drop = e.recentDrop != null ? Math.abs(Number(e.recentDrop)) : null;
      if (drop != null) {
        return e.hasStabilized
          ? `Took a real dip from its recent high (~${drop.toFixed(0)}%) and looks like it stopped falling.`
          : `Took a dip from its recent high (~${drop.toFixed(0)}%) and still feels shaky.`;
      }
      break;
    }
    case 'liquidity': {
      const pts = e.historyLength != null ? Number(e.historyLength) : null;
      const vol = e.avgVolume30d != null ? Number(e.avgVolume30d) : null;
      const sold = e.soldListings != null ? Number(e.soldListings) : null;
      if (sold != null && sold >= 10) {
        return `Enough recent slab sales that you can usually buy or sell without a fight.`;
      }
      if (pts != null && pts >= 30 && (vol == null || vol >= 15)) {
        return `Trades often enough that getting in or out shouldn't be a headache.`;
      }
      if (pts != null && pts < 10) {
        return `Barely any recent sales — the listed price can be wishful thinking.`;
      }
      if (vol != null && vol < 3) {
        return `Not many people trading this — expect wide asks and slow fills.`;
      }
      break;
    }
    case 'grading_spread': {
      const raw = money(Number(e.raw));
      const psa10 = money(Number(e.psa10));
      const roi = e.netRoiPct != null ? Number(e.netRoiPct) : null;
      if (raw && psa10 && roi != null) {
        if (e.thinComps === true) {
          return `Raw to PSA 10 looks wide on paper (${raw} → ${psa10}), but there aren't many recent 10 sales — grading only pays if it actually 10s and someone buys it.`;
        }
        if (roi >= 40) {
          return `If you can gem it, grading can make sense — PSA 10s have been around ${psa10} vs raw near ${raw}.`;
        }
        return `Grading spread is modest (raw ~${raw}, PSA 10 ~${psa10}) — only worth it if you're confident in a 10.`;
      }
      break;
    }
    case 'population_scarcity': {
      const pop = e.psa10Pop != null ? Number(e.psa10Pop) : null;
      if (pop != null) {
        if (pop < 100)
          return `Not many PSA 10s out there yet (${pop}) — slabs can stay sought-after.`;
        if (pop < 500) return `PSA 10 pop is still manageable (${pop}) — not flooded.`;
        if (pop > 8000) return `Tons of PSA 10s already (${pop}) — hard to get a scarcity premium.`;
        return `A fair number of PSA 10s exist (${pop}).`;
      }
      break;
    }
    case 'buyout_manipulation':
    case 'outlier_spike': {
      const spike = e.maxSpike14d != null ? Number(e.maxSpike14d) : null;
      if (spike != null && spike >= 20) {
        return `Jumped hard recently (~${spike.toFixed(0)}% move) — classic chase territory; easy to buy the top.`;
      }
      return `Price action looks jumpy — be careful chasing.`;
    }
    case 'stale_data': {
      const days = e.daysSinceLastQuote != null ? Number(e.daysSinceLastQuote) : null;
      if (days != null) {
        return `Haven't seen a fresh market print in ${days} days — don't trust the sticker blindly.`;
      }
      break;
    }
    case 'thin_market':
      return `Thin sales history — take any "deal" with a grain of salt.`;
    case 'source_inconsistency': {
      const spread = e.sourceSpreadPct != null ? Number(e.sourceSpreadPct) : null;
      if (spread != null) {
        return `Shops don't agree on the price (about ${spread.toFixed(0)}% apart) — shop around.`;
      }
      break;
    }
    case 'comparable_cards': {
      const rel = e.relativeValuePct != null ? Number(e.relativeValuePct) : null;
      if (rel != null) {
        return rel > 5
          ? `Cheaper than similar cards collectors usually compare it to.`
          : rel < -5
            ? `Priced richer than similar cards in the same lane.`
            : `Lined up with similar cards price-wise.`;
      }
      break;
    }
    case 'price_forecast': {
      const ret = e.expected30dReturn != null ? Number(e.expected30dReturn) * 100 : null;
      if (ret != null) {
        if (ret >= 4)
          return `Near-term chart lean is gently up — not a moonshot, just a mild tailwind.`;
        if (ret <= -4) return `Near-term chart lean is soft — don't count on a quick flip.`;
        return `Near-term chart doesn't scream up or down.`;
      }
      break;
    }
    case 'set_age_rotation': {
      const age = e.setAgeDays != null ? Number(e.setAgeDays) : null;
      if (age != null && age < 45) {
        return `Set is still new — packs are opening, so more copies can hit the market.`;
      }
      if (age != null && age > 730) {
        return `Older set — sealed product is long gone; supply usually tighter.`;
      }
      break;
    }
    case 'volatility_risk': {
      const vol = e.monthlyVolatility != null ? Number(e.monthlyVolatility) * 100 : null;
      if (vol != null && vol > 18) {
        return `Price whips around a lot — fine for a hold, stressful for a flip.`;
      }
      break;
    }
    case 'rarity_status': {
      const rarity = e.rarity != null ? String(e.rarity) : null;
      if (rarity) {
        return signal.bullish
          ? `${rarity} — the kind of hit people actually chase for collections.`
          : `${rarity} — common enough that you won't get paid for scarcity alone.`;
      }
      break;
    }
    case 'supply_demand': {
      const listed = e.listedCount != null ? Number(e.listedCount) : null;
      if (listed != null && listed <= 2) {
        return `Hardly any copies listed right now — sellers have the upper hand.`;
      }
      if (listed != null && listed >= 15) {
        return `Lots of copies listed — you can afford to be picky on price.`;
      }
      break;
    }
    case 'data_quality':
      // Don't surface "data quality" to collectors in why/risk lists
      return '';
    default:
      break;
  }
  const s = signal.summary.trim();
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function collectorFlagMessage(flag: FakeOpportunityFlag): string {
  switch (flag.id) {
    case 'buyout_looking':
      return 'Looks like a sudden run-up — buying now can mean paying chase.';
    case 'thin_volume':
      return 'Thin sales history — take with a grain of salt.';
    case 'stale_data':
      return 'Price tag may be stale — confirm with a recent sale before you buy.';
    case 'source_inconsistency':
      return "Different shops disagree on price — don't grab the first listing.";
    case 'outlier_spike':
      return 'One weird print jumped the price — wait for it to settle.';
    case 'grading_thin_liquidity':
      return 'Grading only pays if it 10s and someone actually buys the slab.';
    case 'strong_forecast_low_confidence':
      return '';
    default:
      return /[.!?]$/.test(flag.message.trim()) ? flag.message.trim() : `${flag.message.trim()}.`;
  }
}

function meaningFor(category: BuyCategory, currentPrice: number | null): string {
  const answer = FRIEND_ANSWER[category];
  const price = money(currentPrice);
  if (price && category !== 'insufficient_data') {
    return `${answer} Asking around ${price}.`;
  }
  return answer;
}

function confidenceBlurb(
  tier: ConfidenceTier,
  reasons: string[],
  signals: BuyThesisSignal[]
): string {
  const thin = signals.some((s) => s.id === 'thin_market' || s.id === 'stale_data');
  const hist = reasons.find((r) => /point|history|volume|stale|sparse|insufficient/i.test(r));

  if (tier === 'low' || thin) {
    if (thin || /sparse|insufficient|thin|stale/i.test(hist || '')) {
      return 'Thin sales history — take this with a grain of salt.';
    }
    return "We're guessing more than knowing here — don't bet the binder on it.";
  }
  if (tier === 'high') {
    return 'Enough recent sales that this read feels trustworthy.';
  }
  return 'Decent sales trail, but still just a guide — not gospel.';
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
  void input.fairValue;
  void scores;

  const sorted = [...signals].sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength));

  const whyBuy = sorted
    .filter((s) => s.bullish && s.strength > 0.12)
    .map(humanizeSignal)
    .filter((s) => s.length > 0)
    .slice(0, 3);

  const whyNotFromSignals = sorted
    .filter((s) => !s.bullish && s.strength < -0.12)
    .map(humanizeSignal)
    .filter((s) => s.length > 0)
    .slice(0, 3);

  const whyNotFromFlags = flags
    .map(collectorFlagMessage)
    .filter((s) => s.length > 0)
    .slice(0, 2);

  const whyNot = [...whyNotFromSignals, ...whyNotFromFlags].slice(0, 4);

  const label = BUY_CATEGORY_LABELS[category];
  const priceBit = currentPrice != null ? ` · ${money(currentPrice)}` : '';
  const headline = `${label}${priceBit}`;

  return {
    headline,
    meaning: meaningFor(category, currentPrice),
    confidenceBlurb: confidenceBlurb(
      input.confidenceTier ?? 'medium',
      input.confidenceReasons ?? [],
      signals
    ),
    whyBuy:
      whyBuy.length > 0
        ? whyBuy
        : category === 'insufficient_data'
          ? ["There just aren't enough recent sales to justify buying on vibes."]
          : ['Nothing about the recent market screams "grab this now."'],
    whyNot: whyNot.length > 0 ? whyNot : ['No big red flags — just no screaming deal either.'],
    disclaimer:
      'Collector-oriented read from real prices and sales when we have them — not financial advice.',
  };
}

export { FRIEND_ANSWER };
