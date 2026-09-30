/**
 * Generate example buy-thesis analyses for documentation / media artifacts.
 * Uses synthetic-but-realistic series shaped like liquid Pokémon cards.
 * Run: npx ts-node src/scripts/exampleBuyThesisAnalyses.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { analyzeBuyThesis } from '../services/buyThesis/analyze';
import { backtestBuyThesis } from '../services/buyThesis/backtest';
import type { PricePoint } from '../services/marketAnalyzer';

function series(prices: number[], volume = 40): PricePoint[] {
  const end = new Date();
  return prices.map((price, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (prices.length - 1 - i));
    return {
      date: d.toISOString().slice(0, 10),
      price,
      marketPrice: price,
      volume,
    };
  });
}

const examples = [
  {
    meta: {
      cardId: 'sv3pt5-198',
      cardName: 'Charizard ex',
      setId: 'sv3pt5',
      setName: '151',
      rarity: 'Special Illustration Rare',
      setReleaseDate: '2023-09-22',
    },
    history: series(
      Array.from({ length: 120 }, (_, i) => 95 + Math.sin(i / 9) * 6 + (i > 90 ? -8 : 0)),
      55
    ),
    graded: {
      rawPrice: 88,
      psa10Price: 280,
      psa9Price: 140,
      gradingFeeEstimate: 50,
      soldListings: 22,
      listedCount: 8,
      psa10Pop: 420,
      psaTotalPop: 2100,
    },
    prediction: {
      expected30dReturn: 0.04,
      expected90dReturn: 0.07,
      confidence: 62,
      reliability: 'medium' as const,
      approach: 'hybrid',
      historicalMae: 0.06,
    },
  },
  {
    meta: {
      cardId: 'swsh12pt5-GG69',
      cardName: 'Umbreon VMAX',
      setId: 'swsh12pt5',
      setName: 'Crown Zenith',
      rarity: 'Special Illustration Rare',
      setReleaseDate: '2023-01-20',
    },
    history: series(
      [
        ...Array.from({ length: 50 }, () => 220),
        ...Array.from({ length: 20 }, () => 160),
        ...Array.from({ length: 30 }, () => 165),
      ],
      35
    ),
    graded: {
      rawPrice: 165,
      psa10Price: 520,
      psa9Price: 280,
      gradingFeeEstimate: 75,
      soldListings: 14,
      listedCount: 5,
      psa10Pop: 180,
      psaTotalPop: 900,
    },
    prediction: {
      expected30dReturn: 0.09,
      expected90dReturn: 0.14,
      confidence: 55,
      reliability: 'medium' as const,
      approach: 'mean_reversion',
      historicalMae: 0.07,
    },
  },
  {
    meta: {
      cardId: 'sv4-223',
      cardName: 'Iono',
      setId: 'sv4',
      setName: 'Paradox Rift',
      rarity: 'Special Illustration Rare',
      setReleaseDate: '2023-11-03',
    },
    history: series(
      [
        ...Array.from({ length: 40 }, () => 45),
        45,
        95, // buyout-looking
        88,
        86,
      ],
      4
    ),
    graded: null,
    prediction: {
      expected30dReturn: -0.05,
      expected90dReturn: -0.08,
      confidence: 40,
      reliability: 'low' as const,
      approach: 'flat',
      historicalMae: 0.12,
    },
  },
  {
    meta: {
      cardId: 'base1-4',
      cardName: 'Charizard',
      setId: 'base1',
      setName: 'Base Set',
      rarity: 'Rare Holo',
      setReleaseDate: '1999-01-09',
    },
    history: series(
      Array.from({ length: 180 }, (_, i) => 380 + Math.sin(i / 12) * 25),
      70
    ),
    graded: {
      rawPrice: 390,
      psa10Price: 4200,
      psa9Price: 1100,
      gradingFeeEstimate: 150,
      soldListings: 40,
      listedCount: 12,
      psa10Pop: 3200,
      psaTotalPop: 28000,
    },
    prediction: {
      expected30dReturn: 0.01,
      expected90dReturn: 0.02,
      confidence: 70,
      reliability: 'high' as const,
      approach: 'sma',
      historicalMae: 0.04,
    },
  },
  {
    meta: {
      cardId: 'sv8-thin',
      cardName: 'Obscure Trainer',
      setId: 'sv8',
      setName: 'Surging Sparks',
      rarity: 'Uncommon',
      setReleaseDate: '2024-11-08',
    },
    history: [
      { date: new Date().toISOString().slice(0, 10), price: 0.35, marketPrice: 0.35, volume: 0 },
    ],
    graded: null,
    prediction: null,
  },
];

const peers = Array.from({ length: 8 }, (_, i) => ({
  cardId: `peer-${i}`,
  rarity: 'Special Illustration Rare',
  setId: 'sv3pt5',
  currentPrice: 100 + i * 5,
  change30d: 1 + i * 0.2,
}));

const outDir =
  process.env.BUY_THESIS_OUT || '/cursor/stores/bc-1d87d8a1-ce53-4c5f-afa2-b85f070fa22e/media';
mkdirSync(outDir, { recursive: true });

const summaries: unknown[] = [];
for (const ex of examples) {
  const analysis = analyzeBuyThesis({
    meta: ex.meta,
    priceHistory: ex.history,
    graded: ex.graded,
    prediction: ex.prediction,
    peers: ex.meta.rarity?.includes('Illustration') ? peers : undefined,
    alternateSourcePrices: ex.meta.cardId === 'sv4-223' ? [70] : undefined,
  });
  summaries.push({
    card: ex.meta.cardName,
    set: ex.meta.setName,
    category: analysis.categoryLabel,
    opportunity: analysis.scores.opportunity,
    confidence: analysis.confidence,
    fairValue: analysis.fairValue,
    headline: analysis.reasoning.headline,
    meaning: analysis.reasoning.meaning,
    confidenceBlurb: analysis.reasoning.confidenceBlurb,
    whyBuy: analysis.reasoning.whyBuy,
    whyNot: analysis.reasoning.whyNot,
    flags: analysis.fakeOpportunityFlags.map((f) => f.id),
    topSignals: analysis.signals
      .slice()
      .sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength))
      .slice(0, 5)
      .map((s) => ({ id: s.id, strength: s.strength, summary: s.summary })),
  });

  if (ex.history.length >= 40) {
    const bt = backtestBuyThesis({
      meta: ex.meta,
      priceHistory: ex.history,
      stepDays: 14,
      minHistoryPoints: 20,
    });
    (summaries[summaries.length - 1] as Record<string, unknown>).backtest = {
      sampleDates: bt.sampleDates,
      overall: bt.overall,
      byCategory: bt.byCategory.map((c) => ({
        category: c.category,
        horizons: c.horizons,
      })),
    };
  }
}

const outPath = `${outDir}/buy-thesis-example-analyses.json`;
writeFileSync(outPath, JSON.stringify(summaries, null, 2));
console.log(`Wrote ${summaries.length} analyses to ${outPath}`);
for (const s of summaries as Array<{ card: string; category: string; opportunity: number }>) {
  console.log(`- ${s.card}: ${s.category} (opp ${s.opportunity})`);
}
