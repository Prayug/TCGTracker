/**
 * Bootstrap a real-data SQLite DB for a curated card sample, import
 * PriceCharting sold-guide history, run approach comparison + engine backtest.
 *
 * Usage (from backend/):
 *   npx ts-node src/scripts/evaluatePredictionOverhaul.ts
 *
 * Writes:
 *   - /cursor/stores/.../media/prediction-backtest-results.json
 *   - /cursor/stores/.../media/prediction-backtest-summary.md
 *   - backend/prediction-eval-results.json (local copy)
 */

import fs from 'fs';
import path from 'path';
import { initializeDatabase, getDb } from '../db/database';
import { runMigrations } from '../db/migrations';
import { storeCardMapping } from '../services/cardIdentifier';
import { importSoldGuideHistoryForCard } from '../services/soldGuideHistory';
import { compareApproaches, forecastFromHistory } from '../services/statisticalForecaster';
import { runBacktest } from '../services/backtestEngine';
import { predictSingleCard, runPredictions, MODEL_VERSION } from '../services/predictionEngine';
import { logger } from '../utils/logger';
import { searchBestProduct, fetchPriceChartingHtml } from '../services/priceChartingClient';
import { parseSoldGuideSeries } from '../services/soldGuideHistory';

const STORE_MEDIA = '/cursor/stores/bc-1d87d8a1-ce53-4c5f-afa2-b85f070fa22e/media';

type SeedCard = {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber: string;
  rarity: string;
  variantKey: string;
  game: 'pokemon' | 'onepiece';
};

/** Diverse real cards: vintage / modern / expensive / mid / JP-adjacent EN / OP. */
const SEED_CARDS: SeedCard[] = [
  {
    cardId: 'base1-4',
    cardName: 'Charizard',
    setId: 'base1',
    setName: 'Base Set',
    cardNumber: '4',
    rarity: 'Rare Holo',
    variantKey: 'holofoil',
    game: 'pokemon',
  },
  {
    cardId: 'base1-58',
    cardName: 'Growlithe',
    setId: 'base1',
    setName: 'Base Set',
    cardNumber: '58',
    rarity: 'Common',
    variantKey: 'normal',
    game: 'pokemon',
  },
  {
    cardId: 'swsh7-215',
    cardName: 'Umbreon VMAX',
    setId: 'swsh7',
    setName: 'Evolving Skies',
    cardNumber: '215',
    rarity: 'Secret Rare',
    variantKey: 'holofoil',
    game: 'pokemon',
  },
  {
    cardId: 'sv3pt5-198',
    cardName: 'Charizard ex',
    setId: 'sv3pt5',
    setName: '151',
    cardNumber: '199',
    rarity: 'Special Illustration Rare',
    variantKey: 'holofoil',
    game: 'pokemon',
  },
  {
    cardId: 'sv8-238',
    cardName: 'Pikachu ex',
    setId: 'sv8',
    setName: 'Surging Sparks',
    cardNumber: '238',
    rarity: 'Special Illustration Rare',
    variantKey: 'holofoil',
    game: 'pokemon',
  },
  {
    cardId: 'xy12-101',
    cardName: 'M Rayquaza-EX',
    setId: 'xy12',
    setName: 'Evolutions',
    cardNumber: '101',
    rarity: 'Rare Ultra',
    variantKey: 'holofoil',
    game: 'pokemon',
  },
  {
    cardId: 'sm12-244',
    cardName: 'Pikachu & Zekrom-GX',
    setId: 'sm12',
    setName: 'Cosmic Eclipse',
    cardNumber: '244',
    rarity: 'Rare Ultra',
    variantKey: 'holofoil',
    game: 'pokemon',
  },
  {
    cardId: 'swsh9-TG01',
    cardName: 'Flareon',
    setId: 'swsh9',
    setName: 'Brilliant Stars',
    cardNumber: 'TG01',
    rarity: 'Trainer Gallery',
    variantKey: 'holofoil',
    game: 'pokemon',
  },
  {
    cardId: 'op-op01-003',
    cardName: 'Monkey.D.Luffy',
    setId: 'OP01',
    setName: 'Romance Dawn',
    cardNumber: 'OP01-003',
    rarity: 'Super Rare',
    variantKey: 'normal',
    game: 'onepiece',
  },
  {
    cardId: 'op-op01-121',
    cardName: 'Shanks',
    setId: 'OP01',
    setName: 'Romance Dawn',
    cardNumber: 'OP01-121',
    rarity: 'Secret Rare',
    variantKey: 'normal',
    game: 'onepiece',
  },
];

async function runSql(sql: string, params: unknown[] = []): Promise<void> {
  const db = getDb();
  await new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

async function allSql<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []) as T[])));
  });
}

async function seedMappings(): Promise<Array<SeedCard & { uid: string }>> {
  const out: Array<SeedCard & { uid: string }> = [];
  for (const card of SEED_CARDS) {
    if (card.game === 'onepiece') {
      const catalogId = card.cardNumber; // OPTCG style id e.g. OP01-003
      const uid = `op:${catalogId}`;
      await runSql(
        `INSERT OR REPLACE INTO onepiece_catalog
           (catalogId, cardSetId, cardImageId, cardName, setId, setName, rarity, syncedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [catalogId, catalogId, catalogId, card.cardName, card.setId, card.setName, card.rarity]
      );
      out.push({ ...card, cardId: uid, uid });
      continue;
    }
    const uid = await storeCardMapping({
      cardId: card.cardId,
      cardName: card.cardName,
      setId: card.setId,
      setName: card.setName,
      cardNumber: card.cardNumber,
      rarity: card.rarity,
      variantKey: card.variantKey,
    });
    out.push({ ...card, uid });
  }
  return out;
}

async function fetchTcgdexSnapshot(cardId: string): Promise<{
  marketPrice: number | null;
  variantKey: string;
} | null> {
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(cardId)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      pricing?: { tcgplayer?: Record<string, { marketPrice?: number | null }> };
    };
    const tp = data.pricing?.tcgplayer;
    if (!tp) return null;
    // Prefer holofoil / reverseHolofoil / normal with a marketPrice.
    const preferred = ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil'];
    for (const key of preferred) {
      const entry = tp[key];
      if (entry?.marketPrice && entry.marketPrice > 0) {
        return { marketPrice: entry.marketPrice, variantKey: key };
      }
    }
    for (const [key, entry] of Object.entries(tp)) {
      if (key === 'unit' || key === 'updated') continue;
      const mp = (entry as { marketPrice?: number | null })?.marketPrice;
      if (mp && mp > 0) return { marketPrice: mp, variantKey: key };
    }
    return null;
  } catch {
    return null;
  }
}

async function upsertListingQuote(uid: string, price: number, source: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await runSql(
    `INSERT INTO price_history (uniqueIdentifier, date, price, marketPrice, source)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(uniqueIdentifier, date, source) DO UPDATE SET
       price = excluded.price, marketPrice = excluded.marketPrice`,
    [uid, today, price, price, source]
  );
}

async function main() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = 'prediction-eval-jwt-secret-do-not-use-in-prod-0123456789abcdef';
  }
  process.env.DATABASE_PATH = process.env.DATABASE_PATH || './tcg-prices-prediction-eval.db';
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';

  await initializeDatabase();
  await runMigrations(getDb());

  const seeded = await seedMappings();
  logger.info(`Seeded ${seeded.length} card mappings`);

  const importResults: unknown[] = [];
  for (const card of seeded) {
    if (card.game === 'pokemon') {
      const snap = await fetchTcgdexSnapshot(card.cardId);
      if (snap?.marketPrice) {
        await upsertListingQuote(card.uid, snap.marketPrice, 'tcgdex');
      }
      try {
        const imported = await importSoldGuideHistoryForCard({
          uniqueIdentifier: card.uid,
          cardId: card.cardId,
          cardName: card.cardName,
          setName: card.setName,
          cardNumber: card.cardNumber,
          variantKey: card.variantKey,
          game: 'pokemon',
        });
        importResults.push({ card: card.cardName, ...imported });
      } catch (err) {
        importResults.push({
          card: card.cardName,
          error: (err as Error).message,
          matched: false,
        });
      }
    } else {
      // One Piece: OPTCG current + PriceCharting sold-guide history into onepiece_price_history
      try {
        const optcgRes = await fetch(
          `https://optcgapi.com/api/sets/${encodeURIComponent(card.setId)}/`
        );
        if (optcgRes.ok) {
          const cards = (await optcgRes.json()) as Array<{
            card_set_id?: string;
            card_name?: string;
            price?: string | number;
          }>;
          const hit = cards.find(
            (c) => (c.card_set_id || '').toLowerCase() === card.cardNumber.toLowerCase()
          );
          const price = hit?.price != null ? Number(hit.price) : NaN;
          if (Number.isFinite(price) && price > 0) {
            const catalogId = card.uid.slice(3);
            const today = new Date().toISOString().slice(0, 10);
            await runSql(
              `INSERT INTO onepiece_price_history (catalogId, date, marketPrice, source)
               VALUES (?, ?, ?, 'optcg')
               ON CONFLICT(catalogId, date, source) DO UPDATE SET marketPrice = excluded.marketPrice`,
              [catalogId, today, price]
            );
          }
        }
      } catch (err) {
        logger.warn('OPTCG fetch failed', { err: (err as Error).message });
      }
      try {
        const match = await searchBestProduct({
          cardName: card.cardName,
          setName: card.setName,
          cardNumber: card.cardNumber,
          game: 'onepiece',
        });
        if (!match) {
          importResults.push({ card: card.cardName, matched: false });
          continue;
        }
        const html = await fetchPriceChartingHtml(match.url);
        const parsed = parseSoldGuideSeries(html);
        const catalogId = card.uid.slice(3);
        let upserted = 0;
        for (const p of parsed.ungraded) {
          await runSql(
            `INSERT INTO onepiece_price_history (catalogId, date, marketPrice, source)
             VALUES (?, ?, ?, 'pricecharting_sold')
             ON CONFLICT(catalogId, date, source) DO UPDATE SET marketPrice = excluded.marketPrice`,
            [catalogId, p.date, p.price]
          );
          upserted++;
        }
        importResults.push({
          card: card.cardName,
          matched: true,
          productUrl: match.url,
          opSoldPoints: upserted,
        });
      } catch (err) {
        importResults.push({
          card: card.cardName,
          error: (err as Error).message,
          matched: false,
        });
      }
    }
  }

  // (OP sold-guide already imported above)

  const historyStats = await allSql<{ uid: string; n: number; minD: string; maxD: string }>(
    `SELECT uniqueIdentifier AS uid, COUNT(*) AS n, MIN(date) AS minD, MAX(date) AS maxD
     FROM price_history GROUP BY uniqueIdentifier`
  );
  const opStats = await allSql<{ catalogId: string; n: number; minD: string; maxD: string }>(
    `SELECT catalogId, COUNT(*) AS n, MIN(date) AS minD, MAX(date) AS maxD
     FROM onepiece_price_history GROUP BY catalogId`
  );

  // Per-card approach comparison on sold-guide series
  const approachTables: unknown[] = [];
  for (const card of seeded.filter((c) => c.game === 'pokemon')) {
    const points = await allSql<{ date: string; price: number; marketPrice: number }>(
      `SELECT date, price, marketPrice FROM price_history
       WHERE uniqueIdentifier = ? AND source = 'pricecharting_sold'
       ORDER BY date ASC`,
      [card.uid]
    );
    if (points.length < 8) continue;
    const series = points.map((p) => ({
      date: p.date,
      price: p.marketPrice ?? p.price,
    }));
    const comparison = compareApproaches(series, 30);
    const forecast = forecastFromHistory(series);
    approachTables.push({
      cardId: card.cardId,
      cardName: card.cardName,
      points: points.length,
      span: `${points[0].date} → ${points[points.length - 1].date}`,
      selected: forecast.approach,
      reliability: forecast.reliability,
      beatsBaseline: forecast.beatsBaseline,
      localMae: forecast.localMae,
      baselineMae: forecast.baselineMae,
      comparison,
      predicted30d: forecast.horizons[30],
    });
  }

  // Engine backtest: pick a cutoff ~90d before last history date
  let backtestSummary: unknown = null;
  const maxDateRow = await allSql<{ d: string }>(
    `SELECT MAX(date) AS d FROM price_history WHERE source = 'pricecharting_sold'`
  );
  const maxDate = maxDateRow[0]?.d;
  if (maxDate) {
    const cutoff = new Date(maxDate);
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    try {
      const result = await runBacktest(
        cutoffStr,
        30,
        seeded.filter((c) => c.game === 'pokemon').map((c) => c.cardId)
      );
      backtestSummary = {
        cutoff: cutoffStr,
        windowDays: 30,
        cardsTested: result.cardsTested,
        directionalAccuracy: result.directionalAccuracy,
        mape: result.mape,
        modelMae: result.modelMae,
        flatBaselineMae: result.flatBaselineMae,
        smaBaselineMae: result.smaBaselineMae,
        smape: result.smape,
        beatsFlatBaseline: result.beatsFlatBaseline,
        beatsSmaBaseline: result.beatsSmaBaseline,
        rankIC: result.rankIC,
        hitRate: result.hitRate,
        meanBias: result.meanBias,
        modelAlpha: result.modelAlpha,
        baselineAvgReturn: result.baselineAvgReturn,
        top10AvgReturn: result.top10AvgReturn,
        cardResults: result.cardResults.map((c) => ({
          cardId: c.cardId,
          cardName: c.cardName,
          predictedReturn: c.predictedReturn,
          actualReturn: c.actualReturn,
          error: c.error,
          directionCorrect: c.directionCorrect,
          category: c.category,
        })),
      };
    } catch (err) {
      backtestSummary = { error: (err as Error).message, cutoff: cutoffStr };
    }
  }

  // Live predictions for seeded cards
  const livePredictions: unknown[] = [];
  for (const card of seeded) {
    const pred = await predictSingleCard(
      {
        cardId: card.cardId,
        cardName: card.cardName,
        setId: card.setId,
        setName: card.setName,
        cardNumber: card.cardNumber,
        rarity: card.rarity,
        uniqueIdentifier: card.uid,
        variantKey: card.variantKey,
      },
      undefined,
      undefined,
      undefined,
      { skipInvestmentFilter: true, minDataPoints: 5 }
    );
    if (pred) {
      livePredictions.push({
        cardId: pred.cardId,
        cardName: pred.cardName,
        currentPrice: pred.currentPrice,
        expected7dReturn: pred.expected7dReturn,
        expected30dReturn: pred.expected30dReturn,
        expected90dReturn: pred.expected90dReturn,
        predicted30d: pred.predicted30d,
        confidenceScore: pred.confidenceScore,
        category: pred.category,
        forecastApproach: pred.forecastApproach,
        reliability: pred.reliability,
        reliabilityReason: pred.reliabilityReason,
        lastHistoryDate: pred.lastHistoryDate,
        historyPoints: pred.historyPoints,
        beatsBaseline: pred.beatsBaseline,
        modelVersion: pred.modelVersion,
      });
    } else {
      livePredictions.push({ cardId: card.cardId, cardName: card.cardName, skipped: true });
    }
  }

  // Full run for API integration check
  let runResult: unknown = null;
  try {
    runResult = await runPredictions();
  } catch (err) {
    runResult = { error: (err as Error).message };
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    modelVersion: MODEL_VERSION,
    databasePath: process.env.DATABASE_PATH,
    importResults,
    historyStats,
    opStats,
    approachTables,
    backtestSummary,
    livePredictions,
    runResult,
  };

  const localOut = path.resolve('prediction-eval-results.json');
  fs.writeFileSync(localOut, JSON.stringify(payload, null, 2));

  if (fs.existsSync(path.dirname(STORE_MEDIA))) {
    fs.mkdirSync(STORE_MEDIA, { recursive: true });
    fs.writeFileSync(
      path.join(STORE_MEDIA, 'prediction-backtest-results.json'),
      JSON.stringify(payload, null, 2)
    );

    const bt = backtestSummary as Record<string, unknown> | null;
    const md = [
      '# Prediction overhaul — backtest summary',
      '',
      `Generated: ${payload.generatedAt}`,
      `Model: \`${MODEL_VERSION}\``,
      '',
      '## Data sources',
      '- PriceCharting sold-guide monthly history (`used` = ungraded, `graded` = PSA 10)',
      '- TCGdex live TCGPlayer market quotes (listing)',
      '- OPTCG current quotes for One Piece (when available)',
      '',
      '## Import',
      ...importResults.map((r) => `- ${JSON.stringify(r)}`),
      '',
      '## Approach selection (30d walk-forward per card)',
      ...approachTables.map((row: any) => {
        const best = (row.comparison || [])
          .slice()
          .sort((a: any, b: any) => (a.mae ?? 9) - (b.mae ?? 9))[0];
        return `- **${row.cardName}** (${row.points} pts, ${row.span}): selected \`${row.selected}\`, reliability=${row.reliability}, localMae=${row.localMae?.toFixed?.(4) ?? 'n/a'}, baselineMae=${row.baselineMae?.toFixed?.(4) ?? 'n/a'}, beatsBaseline=${row.beatsBaseline}, bestMAEApproach=${best?.approach}`;
      }),
      '',
      '## Engine backtest (30d)',
      bt
        ? [
            `- Cutoff: ${bt.cutoff}`,
            `- Cards tested: ${bt.cardsTested}`,
            `- Directional accuracy: ${bt.directionalAccuracy}`,
            `- Model MAE: ${bt.modelMae}`,
            `- Flat baseline MAE: ${bt.flatBaselineMae}`,
            `- SMA/market-mean baseline MAE: ${bt.smaBaselineMae}`,
            `- sMAPE: ${bt.smape}`,
            `- Beats flat baseline: ${bt.beatsFlatBaseline}`,
            `- Beats SMA baseline: ${bt.beatsSmaBaseline}`,
            `- Rank IC: ${bt.rankIC}`,
            `- Hit rate: ${bt.hitRate}`,
            `- Mean bias: ${bt.meanBias}`,
            `- Model alpha (top10 − market): ${bt.modelAlpha}`,
          ].join('\n')
        : '_No backtest ran (insufficient history)_',
      '',
      '## Live predictions sample',
      ...livePredictions.map((p: any) =>
        p.skipped
          ? `- ${p.cardName}: skipped (insufficient / filtered)`
          : `- **${p.cardName}**: $${p.currentPrice?.toFixed?.(2)} → 30d ${((p.expected30dReturn ?? 0) * 100).toFixed(1)}% [${p.predicted30d?.low}–${p.predicted30d?.high}], conf=${p.confidenceScore}, ${p.reliability}, approach=${p.forecastApproach}`
      ),
      '',
      `## Prediction run: ${JSON.stringify(runResult)}`,
      '',
    ].join('\n');
    fs.writeFileSync(path.join(STORE_MEDIA, 'prediction-backtest-summary.md'), md);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        localOut,
        modelVersion: MODEL_VERSION,
        backtestSummary,
        liveCount: livePredictions.length,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
