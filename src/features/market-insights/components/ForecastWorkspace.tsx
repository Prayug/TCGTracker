import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { CardPrediction } from '../types';
import type { PokemonCard } from '../../../types/pokemon';
import { HolographicCard } from '../../../components/collectible/HolographicCard';
import { ForecastFan } from './charts/ForecastFan';
import { cn } from '@/lib/utils';

const RELIABILITY: Record<string, string> = {
  high: 'High reliability',
  medium: 'Medium reliability',
  low: 'Low reliability',
  insufficient: 'Not enough history',
};

/**
 * A focused place to read one forecast: the card, the model's range fanning
 * out over each horizon, and how much to trust it. Pick any of the top
 * predictions from the rail; the full detail panel is one click away.
 */
export function ForecastWorkspace({
  predictions,
  cardsById,
  onViewDetail,
}: {
  predictions: CardPrediction[];
  cardsById: Record<string, PokemonCard>;
  onViewDetail: (p: CardPrediction) => void;
}) {
  const ranked = useMemo(
    () =>
      [...predictions]
        .filter((p) => p.currentPrice > 0 && p.reliability !== 'insufficient')
        .sort((a, b) => b.confidenceScore - a.confidenceScore)
        .slice(0, 8),
    [predictions]
  );
  const [pickId, setPickId] = useState<number | null>(null);
  const p = ranked.find((r) => r.id === pickId) ?? ranked[0];
  if (!p) return null;
  const card = cardsById[p.cardId];
  const art = card ?? {
    name: p.cardName,
    rarity: p.rarity,
    images: { small: p.imageSmall, large: p.imageLarge },
  };
  const ret = p.expected90dReturn;
  // confidenceScore is on a 0–100 scale, as the prediction cards show it.
  const conf = Math.round(p.confidenceScore);

  return (
    <section
      data-theme="dark"
      aria-labelledby="fw-h"
      className="atmo-stage relative overflow-hidden rounded-3xl p-5 text-white sm:p-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-white/55">
            Forecast workspace
          </p>
          <h2
            id="fw-h"
            className="mt-1 font-display text-[clamp(1.5rem,2.8vw,2.2rem)] font-semibold leading-tight tracking-[-0.02em]"
          >
            {p.cardName}
          </h2>
          <p className="text-[13px] text-white/60">
            {p.setName}
            {p.cardNumber ? ` · ${p.cardNumber}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onViewDetail(p)}
          className="btn-glass h-9 px-4 text-[13px]"
        >
          Full detail
        </button>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)_14rem] lg:items-center">
        <motion.div
          key={p.id}
          className="mx-auto w-36 lg:w-full"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <HolographicCard
            card={art}
            level="featured"
            onSelect={() => onViewDetail(p)}
            label={`${p.cardName}, open full forecast`}
          />
        </motion.div>
        <div className="min-w-0">
          <ForecastFan prediction={p} dark />
          <p className="mt-1 text-[11.5px] text-white/50">
            Band: the model&apos;s low to high range at each horizon. Line: its midpoint. Dashed:
            today.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-1">
          <div>
            <dt className="text-[12px] text-white/55">Today</dt>
            <dd className="font-mono text-[20px] tabular-nums">${p.currentPrice.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-white/55">90-day midpoint</dt>
            <dd
              className={cn(
                'font-mono text-[20px] tabular-nums',
                ret >= 0 ? 'text-[color:var(--gain)]' : 'text-[color:var(--loss)]'
              )}
            >
              ${p.predicted90dMid.toFixed(2)}{' '}
              <span className="text-[13px]">
                {ret >= 0 ? '+' : ''}
                {(ret * 100).toFixed(1)}%
              </span>
            </dd>
          </div>
          <div className="col-span-2 lg:col-span-1">
            <dt className="text-[12px] text-white/55">Confidence</dt>
            <dd className="mt-1">
              <span className="block h-1.5 overflow-hidden rounded-full bg-white/12">
                <motion.span
                  className="block h-full rounded-full bg-[#7f9bff]"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(0, Math.min(100, conf))}%` }}
                  transition={{ duration: 0.7 }}
                />
              </span>
              <span className="mt-1 block font-mono text-[12px] text-white/70">
                {conf}/100{p.reliability ? ` · ${RELIABILITY[p.reliability] ?? p.reliability}` : ''}
              </span>
              {p.historyPoints != null ? (
                <span className="block text-[11.5px] text-white/50">
                  {p.historyPoints} price points behind it
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>

      {ranked.length > 1 ? (
        <ul
          className="scrollbar-none -mx-1 mt-5 flex gap-2 overflow-x-auto px-1"
          aria-label="Highest-confidence forecasts"
        >
          {ranked.map((r) => (
            <li key={r.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setPickId(r.id)}
                aria-pressed={r.id === p.id}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors',
                  r.id === p.id
                    ? 'border-white bg-white text-[#0b0e14]'
                    : 'border-white/20 text-white/80 hover:bg-white/10'
                )}
              >
                <span className="max-w-[9rem] truncate">{r.cardName}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
