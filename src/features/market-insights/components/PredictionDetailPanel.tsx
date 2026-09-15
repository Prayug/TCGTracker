import { useState, useEffect } from 'react';
import { X, Radio, Shield, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CardPrediction,
  CATEGORY_LABELS,
  CATEGORY_DEFINITIONS,
  CATEGORY_COLORS,
  expectedReturnForWindow,
  PREDICTION_WINDOW_LABELS,
  PredictionWindow,
} from '../types';
import { PokemonCard } from '../../../types/pokemon';
import { useInsightsApi } from '../hooks/insightsApiContext';
import { formatInsightScore, insightScoreValue } from '../utils/formatInsightNumbers';
import { ExternalSignalsPanel } from './ExternalSignalsPanel';

interface Props {
  prediction: CardPrediction | null;
  card: PokemonCard | undefined;
  window: PredictionWindow;
  onClose: () => void;
}

function Bar({
  label,
  value,
  maxValue,
  color,
  hint,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  hint?: string;
}) {
  const display = formatInsightScore(value);
  const numeric = insightScoreValue(value);
  const pct = Math.min(100, (numeric / maxValue) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-muted" title={hint}>
          {label}
        </span>
        <span className="font-mono tabular-nums text-ink-primary">
          {display}
          <span className="text-ink-muted">/{maxValue}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-inset">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function PriceRangeRow({
  label,
  low,
  mid,
  high,
  current,
}: {
  label: string;
  low: number;
  mid: number;
  high: number;
  current: number;
}) {
  const rangeColor = mid >= current ? '#34d399' : '#f87171';
  const changePct = current > 0 ? ((mid - current) / current) * 100 : 0;
  return (
    <div className="rounded-lg bg-surface-inset px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-secondary">{label}</span>
        <span className="font-mono text-xs tabular-nums" style={{ color: rangeColor }}>
          {changePct >= 0 ? '+' : ''}
          {changePct.toFixed(1)}% vs now
        </span>
      </div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wide text-ink-muted">Expected</span>
        <span className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
          ${mid.toFixed(2)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] text-ink-muted">
        <span title="Lower bound of the forecast range">
          Low <span className="font-mono tabular-nums text-ink-secondary">${low.toFixed(2)}</span>
        </span>
        <span title="Upper bound of the forecast range">
          High <span className="font-mono tabular-nums text-ink-secondary">${high.toFixed(2)}</span>
        </span>
      </div>
    </div>
  );
}

export function PredictionDetailPanel({
  prediction,
  card,
  window: predictionWindow,
  onClose,
}: Props) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [showSignals, setShowSignals] = useState(false);
  const insightsApi = useInsightsApi();

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
  const categoryDefinition = CATEGORY_DEFINITIONS[prediction.category];

  const handleExplain = async () => {
    if (explanation) return;
    setExplanationLoading(true);
    try {
      const result = await insightsApi.getAiExplanation(prediction.cardId);
      setExplanation(result.explanation);
    } catch (err: unknown) {
      setExplanation((err as Error)?.message || 'Analysis unavailable');
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
              <h2 className="truncate text-sm font-semibold text-ink-primary">
                {prediction.cardName}
              </h2>
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
                <span className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                  Current Price
                </span>
                <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-ink-primary">
                  ${prediction.currentPrice?.toFixed(2) || 'N/A'}
                </div>
              </div>
              <div className="rounded-xl border border-border-default bg-surface-inset p-3">
                <span className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                  {windowLabel} Expected Return
                </span>
                <div
                  className={`mt-1 font-mono text-lg font-semibold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {isPositive ? '+' : ''}
                  {expectedReturn.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="mb-4">
              <span
                className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${CATEGORY_COLORS[prediction.category] || ''}`}
                title={categoryDefinition}
              >
                {CATEGORY_LABELS[prediction.category]}
              </span>
              <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
                {categoryDefinition}
              </p>
              {prediction.suggestedAction && (
                <p className="mt-1 text-xs text-ink-muted">
                  Suggested action: {prediction.suggestedAction}
                </p>
              )}
            </div>

            <div className="mb-4 space-y-3">
              <div>
                <h3 className="text-xs font-medium text-ink-secondary">Forecast by horizon</h3>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  Expected is the midpoint forecast; Low / High is the model&apos;s range.
                </p>
              </div>
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
              <Bar
                label="Confidence"
                value={prediction.confidenceScore}
                maxValue={100}
                color="#818cf8"
                hint="How sure the model is about this forecast (0–100)"
              />
              <Bar
                label="Risk"
                value={prediction.riskScore}
                maxValue={100}
                color="#f87171"
                hint="Higher means more downside / volatility risk (0–100)"
              />
              {prediction.liquidityScore != null && (
                <Bar
                  label="Liquidity"
                  value={prediction.liquidityScore}
                  maxValue={100}
                  color="#34d399"
                  hint="How easy this card is to buy/sell based on market activity"
                />
              )}
            </div>

            {prediction.riskFactors &&
              prediction.riskFactors !== 'Low identifiable risk factors.' && (
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

            {prediction.gradingPremiumPotential != null &&
              prediction.gradingPremiumPotential >= 0.25 && (
                <div className="mb-4 rounded-lg border border-border-default bg-surface-inset p-3">
                  <div className="flex items-start gap-2">
                    <Shield className="mt-0.5 h-4 w-4 shrink-0 text-ink-secondary" />
                    <div>
                      <h4 className="mb-1 text-xs font-medium text-ink-secondary">
                        Grading premium
                      </h4>
                      <p className="text-xs text-ink-muted">
                        Estimated +{Math.round(prediction.gradingPremiumPotential * 100)}% grading
                        premium potential
                        {prediction.gradingScore != null
                          ? ` · grade-worthiness ${formatInsightScore(prediction.gradingScore)}/100`
                          : ''}
                        . Open the card on Slabs for PSA 10 fees, pop, and comps.
                      </p>
                    </div>
                  </div>
                </div>
              )}

            <div className="mb-4 flex gap-2">
              <button
                onClick={handleExplain}
                disabled={explanationLoading}
                className="flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                {explanationLoading
                  ? 'Loading…'
                  : explanation
                    ? 'Forecast notes ready'
                    : 'Explain forecast'}
              </button>
              <button
                onClick={() => setShowSignals(!showSignals)}
                className="flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-inset px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover"
              >
                <Radio className="h-3.5 w-3.5" />
                Signals
              </button>
            </div>

            {explanation && (
              <div className="mb-4 rounded-lg border border-border-default bg-surface-inset p-3">
                <p className="text-xs leading-relaxed text-ink-secondary">{explanation}</p>
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
