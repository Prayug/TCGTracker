import { useState, useEffect } from 'react';
import { X, Brain, Radio, TrendingUp, TrendingDown, Shield, AlertTriangle, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CardPrediction, CATEGORY_LABELS, CATEGORY_COLORS, expectedReturnForWindow, PREDICTION_WINDOW_LABELS, PredictionWindow } from '../types';
import { PokemonCard } from '../../../types/pokemon';
import { marketInsightsApi } from '../../../services/marketInsightsApi';
import { ExternalSignalsPanel } from './ExternalSignalsPanel';
import { formatPercent } from '../../../utils/cardDisplay';

interface Props {
  prediction: CardPrediction | null;
  card: PokemonCard | undefined;
  window: PredictionWindow;
  onClose: () => void;
}

function Bar({ label, value, maxValue, color }: { label: string; value: number; maxValue: number; color: string }) {
  const pct = Math.min(100, (value / maxValue) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="font-mono text-white">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-inset">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function PriceRangeRow({ label, low, mid, high, current }: { label: string; low: number; mid: number; high: number; current: number }) {
  const rangeColor = mid >= current ? '#34d399' : '#f87171';
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-inset px-3 py-2">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <div className="flex items-center gap-3 font-mono text-xs">
        <span className="text-ink-muted">${low.toFixed(2)}</span>
        <span className="text-white">${mid.toFixed(2)}</span>
        <span className="text-ink-muted">${high.toFixed(2)}</span>
        <span style={{ color: rangeColor }}>
          {mid >= current ? '+' : ''}{((mid - current) / current * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export function PredictionDetailPanel({ prediction, card, window: predictionWindow, onClose }: Props) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [showSignals, setShowSignals] = useState(false);

  useEffect(() => {
    if (prediction) {
      setExplanation(null);
      setShowSignals(false);
    }
  }, [prediction]);

  if (!prediction) return null;

  const expectedReturn = expectedReturnForWindow(prediction, predictionWindow) * 100;
  const isPositive = expectedReturn >= 0;
  const windowLabel = PREDICTION_WINDOW_LABELS[predictionWindow];

  const handleExplain = async () => {
    if (explanation) return;
    setExplanationLoading(true);
    try {
      const result = await marketInsightsApi.getAiExplanation(prediction.cardId);
      setExplanation(result.explanation);
    } catch (err: any) {
      setExplanation(err?.message || 'AI analysis unavailable');
    } finally {
      setExplanationLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key={prediction.id}
        initial={{ opacity: 0, x: 320 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 320 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border-default bg-surface-raised shadow-2xl"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-white">{prediction.cardName}</h2>
              <p className="truncate text-xs text-ink-muted">
                {prediction.setName} &middot; {prediction.setId}
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-2 rounded-lg p-1.5 text-ink-muted hover:bg-surface-hover hover:text-ink-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {card?.images?.large && (
              <div className="mb-4 flex justify-center">
                <img
                  src={card.images.large}
                  alt={prediction.cardName}
                  className="h-48 rounded-xl object-contain"
                />
              </div>
            )}

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border-default bg-surface-inset p-3">
                <span className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Current Price</span>
                <div className="mt-1 font-mono text-lg font-semibold text-white">
                  ${prediction.currentPrice?.toFixed(2) || 'N/A'}
                </div>
              </div>
              <div className="rounded-xl border border-border-default bg-surface-inset p-3">
                <span className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">{windowLabel} Return</span>
                <div className={`mt-1 font-mono text-lg font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}{expectedReturn.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="mb-4">
              <span
                className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${CATEGORY_COLORS[prediction.category] || ''}`}
              >
                {CATEGORY_LABELS[prediction.category]}
              </span>
              {prediction.suggestedAction && (
                <span className="ml-2 text-xs text-ink-muted">{prediction.suggestedAction}</span>
              )}
            </div>

            <div className="mb-4 space-y-3">
              <h3 className="text-xs font-medium text-ink-secondary">Predicted Price Ranges</h3>
              <PriceRangeRow
                label="7-Day"
                low={prediction.predicted7dLow}
                mid={prediction.predicted7dMid}
                high={prediction.predicted7dHigh}
                current={prediction.currentPrice}
              />
              <PriceRangeRow
                label="30-Day"
                low={prediction.predicted30dLow}
                mid={prediction.predicted30dMid}
                high={prediction.predicted30dHigh}
                current={prediction.currentPrice}
              />
              <PriceRangeRow
                label="90-Day"
                low={prediction.predicted90dLow}
                mid={prediction.predicted90dMid}
                high={prediction.predicted90dHigh}
                current={prediction.currentPrice}
              />
              {prediction.predicted180dMid != null && (
                <PriceRangeRow
                  label="6-Month"
                  low={prediction.predicted180dLow!}
                  mid={prediction.predicted180dMid!}
                  high={prediction.predicted180dHigh!}
                  current={prediction.currentPrice}
                />
              )}
              {prediction.predicted365dMid != null && (
                <PriceRangeRow
                  label="1-Year"
                  low={prediction.predicted365dLow!}
                  mid={prediction.predicted365dMid!}
                  high={prediction.predicted365dHigh!}
                  current={prediction.currentPrice}
                />
              )}
            </div>

            <div className="mb-4 space-y-2">
              <h3 className="text-xs font-medium text-ink-secondary">Scores</h3>
              <Bar label="Confidence" value={prediction.confidenceScore} maxValue={100} color="#818cf8" />
              <Bar label="Risk" value={prediction.riskScore} maxValue={100} color="#f87171" />
              {prediction.liquidityScore != null && (
                <Bar label="Liquidity" value={prediction.liquidityScore} maxValue={100} color="#34d399" />
              )}
            </div>

            {prediction.riskFactors && prediction.riskFactors !== 'Low identifiable risk factors.' && (
              <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div>
                    <h4 className="mb-1 text-xs font-medium text-amber-300">Risk Factors</h4>
                    <p className="text-xs text-ink-muted">{prediction.riskFactors}</p>
                  </div>
                </div>
              </div>
            )}

            {prediction.gradingPremiumPotential != null && prediction.gradingPremiumPotential >= 0.25 && (
              <div className="mb-4 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                <div className="flex items-start gap-2">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                  <div>
                    <h4 className="mb-1 text-xs font-medium text-violet-300">Grading Premium</h4>
                    <p className="text-xs text-ink-muted">
                      Estimated +{Math.round(prediction.gradingPremiumPotential * 100)}% grading premium potential
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-4 flex gap-2">
              <button
                onClick={handleExplain}
                disabled={explanationLoading}
                className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-500/20 disabled:opacity-50"
              >
                <Brain className="h-3.5 w-3.5" />
                {explanationLoading ? 'Generating...' : explanation ? 'Show AI Analysis' : 'Generate AI Analysis'}
              </button>
              <button
                onClick={() => setShowSignals(!showSignals)}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
              >
                <Radio className="h-3.5 w-3.5" />
                External Signals
              </button>
            </div>

            {explanation && (
              <div className="mb-4 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                <div className="flex items-start gap-2">
                  <Brain className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                  <p className="text-xs leading-relaxed text-ink-secondary">{explanation}</p>
                </div>
              </div>
            )}

            {showSignals && (
              <div className="rounded-xl border border-border-default">
                <div className="border-b border-border-default px-3 py-2">
                  <span className="text-xs font-semibold text-ink-primary">External Signals</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <ExternalSignalsPanel cardId={prediction.cardId} />
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
