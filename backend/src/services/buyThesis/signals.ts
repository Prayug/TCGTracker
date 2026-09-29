/**
 * Typed buy-thesis signals derived from features + optional prediction input.
 * Each signal carries strength, bullish flag, and evidence — no conclusions here.
 */

import { clamp, round2 } from './stats';
import type { BuyThesisFeatures } from './features';
import type {
  BuyThesisSignal,
  FakeOpportunityFlag,
  PredictionSignalInput,
  ComparableSummary,
} from './types';

function rarityBullishness(rarity: string | null | undefined): {
  score: number;
  label: string;
} {
  if (!rarity) return { score: 0, label: 'unknown rarity' };
  const r = rarity.toLowerCase();
  if (r.includes('special illustration') || r.includes('hyper rare') || r.includes('gold')) {
    return { score: 0.7, label: rarity };
  }
  if (r.includes('illustration') || r.includes('secret') || r.includes('alt')) {
    return { score: 0.55, label: rarity };
  }
  if (r.includes('ultra') || r.includes('vmax') || r.includes('vstar')) {
    return { score: 0.35, label: rarity };
  }
  if (r.includes('holo') || r.includes('rare')) {
    return { score: 0.15, label: rarity };
  }
  if (r.includes('common') || r.includes('uncommon')) {
    return { score: -0.2, label: rarity };
  }
  return { score: 0, label: rarity };
}

export function buildSignals(input: {
  features: BuyThesisFeatures;
  prediction?: PredictionSignalInput | null;
  comparables?: ComparableSummary | null;
}): { signals: BuyThesisSignal[]; flags: FakeOpportunityFlag[] } {
  const f = input.features;
  const signals: BuyThesisSignal[] = [];
  const flags: FakeOpportunityFlag[] = [];
  const price = f.currentPrice;

  // --- Value vs fair ---
  if (price != null && price > 0 && f.trimmedFairValue != null && f.trimmedFairValue > 0) {
    const discountPct = ((f.trimmedFairValue - price) / f.trimmedFairValue) * 100;
    const strength = clamp(discountPct / 25, -1, 1);
    signals.push({
      id: 'value_vs_fair',
      label: 'Value vs trimmed fair',
      strength,
      bullish: strength > 0,
      summary:
        discountPct > 0
          ? `Price $${price.toFixed(2)} is ${discountPct.toFixed(1)}% below trimmed 90d fair $${f.trimmedFairValue.toFixed(2)}`
          : `Price $${price.toFixed(2)} is ${Math.abs(discountPct).toFixed(1)}% above trimmed 90d fair $${f.trimmedFairValue.toFixed(2)}`,
      evidence: {
        currentPrice: price,
        trimmedFairValue: f.trimmedFairValue,
        medianPrice90d: f.medianPrice90d,
        discountPct: round2(discountPct),
      },
    });
  }

  // --- Momentum ---
  {
    const c30 = f.priceChanges.change30d;
    const c7 = f.priceChanges.change7d;
    const ma = f.movingAverages;
    let strength = 0;
    const bits: string[] = [];
    if (c30 != null) {
      strength += clamp(c30 / 20, -0.7, 0.7);
      bits.push(`30d ${c30 >= 0 ? '+' : ''}${c30.toFixed(1)}%`);
    } else if (c7 != null) {
      strength += clamp(c7 / 10, -0.5, 0.5);
      bits.push(`7d ${c7 >= 0 ? '+' : ''}${c7.toFixed(1)}%`);
    }
    if (ma.ma7 != null && ma.ma30 != null && ma.ma30 > 0) {
      const maPct = ((ma.ma7 - ma.ma30) / ma.ma30) * 100;
      strength += clamp(maPct / 15, -0.3, 0.3);
      bits.push(`MA7 ${maPct >= 0 ? '+' : ''}${maPct.toFixed(1)}% vs MA30`);
    }
    strength = clamp(strength, -1, 1);
    if (bits.length > 0) {
      signals.push({
        id: 'momentum',
        label: 'Price momentum',
        strength,
        bullish: strength > 0,
        summary: bits.join('; '),
        evidence: {
          change7d: c7,
          change30d: c30,
          change90d: f.priceChanges.change90d,
          ma7: ma.ma7,
          ma30: ma.ma30,
          ma90: ma.ma90,
        },
      });
    }
  }

  // --- Mean reversion / recovery ---
  if (f.recovery.recentDrop != null && f.recovery.recentDrop <= -10) {
    const strength = clamp(
      (-f.recovery.recentDrop / 30) * (f.recovery.hasStabilized ? 1 : 0.4),
      0,
      0.9
    );
    signals.push({
      id: 'mean_reversion',
      label: 'Recovery setup',
      strength,
      bullish: f.recovery.hasStabilized,
      summary: `Down ${Math.abs(f.recovery.recentDrop).toFixed(0)}% from recent peak${
        f.recovery.hasStabilized ? '; price has stabilized' : '; not yet stabilized'
      }`,
      evidence: {
        recentDrop: f.recovery.recentDrop,
        hasStabilized: f.recovery.hasStabilized,
        daysSinceBottom: f.recovery.daysSinceBottom,
        priorRecoveryPattern: f.recovery.priorRecoveryPattern,
      },
    });
  }

  // --- Liquidity ---
  {
    let strength = 0;
    const bits: string[] = [];
    if (f.avgVolume30d != null) {
      strength += clamp((f.avgVolume30d - 20) / 80, -0.5, 0.5);
      bits.push(`avg vol 30d ${f.avgVolume30d.toFixed(0)}`);
    }
    strength += clamp((f.historyLength - 30) / 60, -0.3, 0.3);
    bits.push(`${f.historyLength} price points`);
    if (f.daysSinceLastQuote != null) {
      if (f.daysSinceLastQuote > 14) strength -= 0.4;
      else if (f.daysSinceLastQuote > 7) strength -= 0.2;
      bits.push(`last quote ${f.daysSinceLastQuote}d ago`);
    }
    const g = f.graded;
    if (g?.soldListings != null) {
      strength += clamp((g.soldListings - 5) / 30, -0.3, 0.4);
      bits.push(`${g.soldListings} graded sold listings`);
    }
    strength = clamp(strength, -1, 1);
    signals.push({
      id: 'liquidity',
      label: 'Liquidity',
      strength,
      bullish: strength >= 0,
      summary: bits.join('; '),
      evidence: {
        avgVolume30d: f.avgVolume30d,
        historyLength: f.historyLength,
        daysSinceLastQuote: f.daysSinceLastQuote,
        soldListings: g?.soldListings ?? null,
        listedCount: g?.listedCount ?? null,
      },
    });
  }

  // --- Grading opportunity ---
  {
    const g = f.graded;
    const raw = g?.rawPrice ?? price;
    const psa10 = g?.psa10Price;
    if (raw != null && raw > 0 && psa10 != null && psa10 > 0) {
      const fee = g?.gradingFeeEstimate ?? Math.max(20, raw * 0.15);
      const netRoi = ((psa10 - raw - fee) / (raw + fee)) * 100;
      const thin = (g?.soldListings ?? 0) < 3;
      const strength = clamp(netRoi / 80, -0.5, 1) * (thin ? 0.5 : 1);
      signals.push({
        id: 'grading_spread',
        label: 'Grading ROI',
        strength,
        bullish: netRoi > 15 && !thin,
        summary: `PSA10 $${psa10.toFixed(2)} vs raw $${raw.toFixed(2)}; est. net ROI ${netRoi.toFixed(0)}%${
          thin ? ' (thin comps)' : ''
        }`,
        evidence: {
          raw,
          psa10,
          fee: round2(fee),
          netRoiPct: round2(netRoi),
          soldListings: g?.soldListings ?? null,
          thinComps: thin,
        },
      });
      if (thin && netRoi > 40) {
        flags.push({
          id: 'grading_thin_liquidity',
          severity: 'warn',
          message: 'Attractive grading spread but thin sold comps — ROI may not be realizable.',
          evidence: { netRoiPct: round2(netRoi), soldListings: g?.soldListings ?? 0 },
        });
      }
    }
    if (g?.psa10Pop != null) {
      const pop = g.psa10Pop;
      const strength = pop < 50 ? 0.6 : pop < 200 ? 0.4 : pop < 500 ? 0.2 : pop > 8000 ? -0.4 : 0;
      signals.push({
        id: 'population_scarcity',
        label: 'PSA10 population',
        strength,
        bullish: strength > 0,
        summary: `PSA10 pop ${pop}${g.psaTotalPop != null ? ` / ${g.psaTotalPop} total` : ''}`,
        evidence: { psa10Pop: pop, psaTotalPop: g.psaTotalPop },
      });
    }
  }

  // --- Supply / demand proxies (rarity + set age + listings) — measurable only ---
  {
    const rar = rarityBullishness(f.meta.rarity);
    let strength = rar.score * 0.5;
    const bits: string[] = [rar.label];
    if (f.setAgeDays != null) {
      // Very new sets: elevated supply risk as product opens; old sets: slower supply
      if (f.setAgeDays < 45) {
        strength -= 0.25;
        bits.push(`set age ${f.setAgeDays}d (open-product supply)`);
      } else if (f.setAgeDays > 730) {
        strength += 0.15;
        bits.push(`set age ${(f.setAgeDays / 365).toFixed(1)}y`);
      } else {
        bits.push(`set age ${f.setAgeDays}d`);
      }
    }
    const listed = f.graded?.listedCount;
    if (listed != null && listed <= 2 && (f.graded?.soldListings ?? 0) >= 3) {
      strength += 0.2;
      bits.push(`only ${listed} listings`);
    }
    strength = clamp(strength, -1, 1);
    signals.push({
      id: 'supply_demand',
      label: 'Supply / demand proxies',
      strength,
      bullish: strength > 0,
      summary: bits.join('; '),
      evidence: {
        rarity: f.meta.rarity ?? null,
        setAgeDays: f.setAgeDays,
        listedCount: listed ?? null,
      },
    });
    signals.push({
      id: 'rarity_status',
      label: 'Rarity / special status',
      strength: clamp(rar.score, -1, 1),
      bullish: rar.score > 0,
      summary: rar.label,
      evidence: { rarity: f.meta.rarity ?? null },
    });
    if (f.setAgeDays != null) {
      signals.push({
        id: 'set_age_rotation',
        label: 'Set age / supply cycle',
        strength: f.setAgeDays < 45 ? -0.35 : f.setAgeDays > 730 ? 0.2 : 0,
        bullish: f.setAgeDays >= 45,
        summary:
          f.setAgeDays < 45
            ? `New set (${f.setAgeDays}d) — elevated open-product supply risk`
            : `Set age ${f.setAgeDays}d`,
        evidence: { setAgeDays: f.setAgeDays, releaseDate: f.meta.setReleaseDate ?? null },
      });
    }
  }

  // --- Volatility / risk ---
  {
    const vol = f.volatility.monthlyVolatility;
    const strength = -clamp((vol - 0.08) / 0.25, -0.2, 1);
    signals.push({
      id: 'volatility_risk',
      label: 'Volatility',
      strength,
      bullish: strength >= 0,
      summary: `Monthly vol ${(vol * 100).toFixed(1)}%`,
      evidence: {
        dailyVolatility: round2(f.volatility.dailyVolatility),
        weeklyVolatility: round2(f.volatility.weeklyVolatility),
        monthlyVolatility: round2(vol),
      },
    });
  }

  // --- Buyout / manipulation ---
  {
    const spike = f.maxSpike14d;
    const z = f.robustSpikeZ;
    const volSpike = f.volumeSpikeRatio;
    let strength = 0;
    const bits: string[] = [];
    if (spike != null && spike >= 25) {
      strength -= clamp(spike / 60, 0.2, 0.8);
      bits.push(`max |move| 14d ${spike.toFixed(0)}%`);
    }
    if (z != null && Math.abs(z) >= 3) {
      strength -= 0.4;
      bits.push(`robust z ${z.toFixed(1)}`);
    }
    if (volSpike != null && volSpike >= 3 && (spike ?? 0) >= 15) {
      strength -= 0.35;
      bits.push(`volume ${volSpike.toFixed(1)}× avg with price spike`);
    }
    if (bits.length > 0) {
      signals.push({
        id: 'buyout_manipulation',
        label: 'Abnormal move / buyout risk',
        strength: clamp(strength, -1, 0),
        bullish: false,
        summary: bits.join('; '),
        evidence: {
          maxSpike14d: spike,
          robustSpikeZ: z,
          volumeSpikeRatio: volSpike,
        },
      });
      flags.push({
        id: 'buyout_looking',
        severity: Math.abs(strength) > 0.6 ? 'critical' : 'warn',
        message: 'Price action resembles a thin-market spike or buyout.',
        evidence: { maxSpike14d: spike, robustSpikeZ: z, volumeSpikeRatio: volSpike },
      });
    }
  }

  // --- Stale / thin / inconsistency / outliers ---
  if (f.daysSinceLastQuote != null && f.daysSinceLastQuote > 14) {
    signals.push({
      id: 'stale_data',
      label: 'Stale quotes',
      strength: -clamp(f.daysSinceLastQuote / 45, 0.2, 1),
      bullish: false,
      summary: `Last market quote ${f.daysSinceLastQuote}d ago`,
      evidence: { daysSinceLastQuote: f.daysSinceLastQuote, lastDate: f.lastDate },
    });
    flags.push({
      id: 'stale_data',
      severity: f.daysSinceLastQuote > 30 ? 'critical' : 'warn',
      message: 'Market data is stale — opportunity may be outdated.',
      evidence: { daysSinceLastQuote: f.daysSinceLastQuote },
    });
  }

  if (f.historyLength < 5 || (f.avgVolume30d != null && f.avgVolume30d < 2)) {
    signals.push({
      id: 'thin_market',
      label: 'Thin market',
      strength: -0.55,
      bullish: false,
      summary:
        f.historyLength < 5
          ? `Only ${f.historyLength} price point(s)`
          : `Very low average volume (${f.avgVolume30d?.toFixed(1)})`,
      evidence: { historyLength: f.historyLength, avgVolume30d: f.avgVolume30d },
    });
    flags.push({
      id: 'thin_volume',
      severity: 'warn',
      message: 'Thin trading history reduces reliability of any buy signal.',
      evidence: { historyLength: f.historyLength, avgVolume30d: f.avgVolume30d },
    });
  }

  if (f.sourceSpreadPct != null && f.sourceSpreadPct > 15) {
    signals.push({
      id: 'source_inconsistency',
      label: 'Source price spread',
      strength: -clamp(f.sourceSpreadPct / 40, 0.2, 0.9),
      bullish: false,
      summary: `Sources disagree by ${f.sourceSpreadPct.toFixed(0)}%`,
      evidence: { sourceSpreadPct: f.sourceSpreadPct, sourceCount: f.sourceCount },
    });
    flags.push({
      id: 'source_inconsistency',
      severity: f.sourceSpreadPct > 30 ? 'critical' : 'warn',
      message: 'Listing sources disagree — fair value is uncertain.',
      evidence: { sourceSpreadPct: f.sourceSpreadPct },
    });
  }

  if (f.robustSpikeZ != null && Math.abs(f.robustSpikeZ) >= 3.5) {
    flags.push({
      id: 'outlier_spike',
      severity: 'warn',
      message: 'Latest move is a statistical outlier vs this card’s own history.',
      evidence: { robustSpikeZ: f.robustSpikeZ },
    });
    signals.push({
      id: 'outlier_spike',
      label: 'Outlier price print',
      strength: -0.5,
      bullish: false,
      summary: `Latest day-move robust z=${f.robustSpikeZ.toFixed(1)}`,
      evidence: { robustSpikeZ: f.robustSpikeZ },
    });
  }

  // --- Data quality ---
  {
    let dq = 50;
    if (f.historyLength >= 90) dq += 25;
    else if (f.historyLength >= 30) dq += 15;
    else if (f.historyLength >= 14) dq += 5;
    else if (f.historyLength < 5) dq -= 30;
    if (f.spanDays >= 180) dq += 10;
    else if (f.spanDays < 30) dq -= 15;
    if ((f.daysSinceLastQuote ?? 0) > 14) dq -= 20;
    if (f.sourceSpreadPct != null && f.sourceSpreadPct > 20) dq -= 15;
    dq = clamp(dq, 0, 100);
    const strength = clamp((dq - 50) / 50, -1, 1);
    signals.push({
      id: 'data_quality',
      label: 'Data quality',
      strength,
      bullish: strength >= 0,
      summary: `Data quality proxy ${dq}/100 (${f.historyLength} pts, ${f.spanDays}d span)`,
      evidence: {
        dataQualityProxy: dq,
        historyLength: f.historyLength,
        spanDays: f.spanDays,
      },
    });
  }

  // --- Comparables ---
  if (input.comparables && input.comparables.peerCount >= 5) {
    const c = input.comparables;
    const strength = c.relativeValuePct != null ? clamp(c.relativeValuePct / 25, -0.8, 0.8) : 0;
    signals.push({
      id: 'comparable_cards',
      label: 'Comparable cards',
      strength,
      bullish: strength > 0,
      summary: c.summary,
      evidence: {
        peerCount: c.peerCount,
        peerMedianChange30d: c.peerMedianChange30d,
        peerMedianPrice: c.peerMedianPrice,
        relativeValuePct: c.relativeValuePct,
      },
    });
  }

  // --- Prediction as ONE signal (weighted by its own confidence) ---
  if (input.prediction) {
    const p = input.prediction;
    const ret = p.expected30dReturn ?? p.expected90dReturn;
    if (ret != null) {
      const conf = (p.confidence ?? 40) / 100;
      const maePenalty =
        p.historicalMae != null && p.historicalMae > 0.08
          ? clamp(1 - (p.historicalMae - 0.08) / 0.2, 0.3, 1)
          : 1;
      const reliabilityScale =
        p.reliability === 'high' ? 1 : p.reliability === 'medium' ? 0.75 : 0.45;
      const strength = clamp(ret / 0.15, -1, 1) * conf * maePenalty * reliabilityScale;
      signals.push({
        id: 'price_forecast',
        label: 'Price forecast',
        strength,
        bullish: strength > 0,
        summary: `Model ${((p.expected30dReturn ?? ret) * 100).toFixed(1)}% 30d expected @ ${p.confidence ?? '—'}% conf${
          p.approach ? ` (${p.approach})` : ''
        }`,
        evidence: {
          expected30dReturn: p.expected30dReturn,
          expected90dReturn: p.expected90dReturn,
          confidence: p.confidence,
          reliability: p.reliability ?? null,
          historicalMae: p.historicalMae ?? null,
          approach: p.approach ?? null,
          effectiveStrength: round2(strength),
        },
        weightHint: conf * reliabilityScale,
      });
      if ((p.confidence ?? 0) < 40 && Math.abs(ret) > 0.05) {
        flags.push({
          id: 'strong_forecast_low_confidence',
          severity: 'info',
          message: 'Forecast magnitude is notable but prediction confidence is low.',
          evidence: { expectedReturn: ret, confidence: p.confidence },
        });
      }
    }
  }

  return { signals, flags };
}
