import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Opportunity, OpportunityGrade } from '../types';
import { useElementWidth } from '../../../components/exchange/useElementWidth';

const GRADE_RING: Record<OpportunityGrade, string> = {
  strong_buy: 'var(--gain)',
  buy: 'color-mix(in srgb, var(--gain) 60%, white)',
  watch: '#f0bd55',
  pass: 'rgba(255,255,255,0.35)',
};

/**
 * Opportunities on a risk-against-return map: further up is a higher 90-day
 * estimate, further right is riskier, and bigger cards score higher. Cards
 * missing either figure are counted, not placed.
 */
export function OpportunityMap({
  rows,
  onSelect,
}: {
  rows: Opportunity[];
  onSelect: (o: Opportunity) => void;
}) {
  const [wrap, width] = useElementWidth<HTMLDivElement>(900);
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const placed = useMemo(
    () => rows.filter((o) => o.riskScore != null && o.predictedReturn90d != null),
    [rows]
  );
  const unplaced = rows.length - placed.length;
  const H = width < 640 ? 320 : 380;
  const pad = { l: 52, r: 20, t: 20, b: 40 };
  const ys = placed.map((o) => o.predictedReturn90d as number);
  const yMax = Math.max(10, ...ys.map((v) => Math.abs(v))) * 1.15;
  const x = (risk: number) => pad.l + (risk / 100) * (width - pad.l - pad.r);
  const y = (ret: number) => pad.t + (1 - (ret + yMax) / (2 * yMax)) * (H - pad.t - pad.b);
  const maxScore = Math.max(1, ...placed.map((o) => o.score));
  const size = (s: number) => 26 + (s / maxScore) * 26;

  return (
    <section
      data-theme="dark"
      aria-labelledby="opp-map-h"
      className="atmo-stage relative overflow-hidden rounded-3xl p-5 text-white sm:p-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-white/55">
            Opportunity explorer
          </p>
          <h2
            id="opp-map-h"
            className="mt-1 font-display text-[clamp(1.4rem,2.6vw,2rem)] font-semibold tracking-[-0.02em]"
          >
            Return against risk
          </h2>
        </div>
        <p className="max-w-md text-[12.5px] text-white/60">
          Up: higher 90-day estimate. Right: higher risk score. Size: opportunity score. The
          top-left quadrant is where estimates are strong and risk is low.
        </p>
      </div>
      <div ref={wrap} className="relative mt-4" style={{ height: H }}>
        <svg width={width} height={H} className="absolute inset-0" aria-hidden>
          <rect
            x={pad.l}
            y={pad.t}
            width={(width - pad.l - pad.r) / 2}
            height={(H - pad.t - pad.b) / 2}
            fill="rgba(63,211,168,0.07)"
            rx="8"
          />
          <line x1={pad.l} x2={width - pad.r} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.25)" />
          <line
            x1={x(50)}
            x2={x(50)}
            y1={pad.t}
            y2={H - pad.b}
            stroke="rgba(255,255,255,0.12)"
            strokeDasharray="3 4"
          />
          {[yMax * 0.66, 0, -yMax * 0.66].map((t) => (
            <text
              key={t}
              x={pad.l - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              fontSize="11"
              fill="rgba(255,255,255,0.5)"
            >
              {t > 0 ? '+' : ''}
              {Math.round(t)}%
            </text>
          ))}
          {[0, 25, 50, 75, 100].map((t) => (
            <text
              key={t}
              x={x(t)}
              y={H - 18}
              textAnchor="middle"
              fontSize="11"
              fill="rgba(255,255,255,0.5)"
            >
              {t}
            </text>
          ))}
          <text
            x={width - pad.r}
            y={H - 4}
            textAnchor="end"
            fontSize="11"
            fill="rgba(255,255,255,0.45)"
          >
            Risk score →
          </text>
          <text x={pad.l + 8} y={y(0) - 8} fontSize="11" fill="rgba(63,211,168,0.8)">
            Strong estimate, lower risk
          </text>
        </svg>
        {placed.map((o, i) => {
          const s = size(o.score);
          const cx = x(o.riskScore as number);
          const cy = y(o.predictedReturn90d as number);
          const active = hover === o.cardId;
          return (
            <motion.button
              key={o.cardId}
              type="button"
              onClick={() => onSelect(o)}
              onMouseEnter={() => setHover(o.cardId)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(o.cardId)}
              onBlur={() => setHover(null)}
              aria-label={`${o.cardName ?? o.cardId}: ${o.predictedReturn90d}% 90-day estimate, risk ${o.riskScore}, score ${o.score}. Open detail.`}
              className="absolute overflow-hidden rounded-[5px] bg-white/10 shadow-lg"
              style={{
                width: s,
                height: s * 1.4,
                left: cx - s / 2,
                top: cy - (s * 1.4) / 2,
                zIndex: active ? 30 : Math.round(o.score),
                boxShadow: `0 0 0 2px ${GRADE_RING[o.grade]}, 0 10px 24px -8px rgba(0,0,0,0.6)`,
              }}
              initial={reduce ? false : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: active ? 1.35 : 1 }}
              transition={{
                type: 'spring',
                stiffness: 260,
                damping: 20,
                delay: reduce ? 0 : i * 0.025,
              }}
            >
              {o.imageSmall ? (
                <img
                  src={o.imageSmall}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full place-items-center text-[9px] text-white/70">
                  {(o.cardName ?? '').slice(0, 8)}
                </span>
              )}
            </motion.button>
          );
        })}
        {hover
          ? (() => {
              const o = placed.find((r) => r.cardId === hover);
              if (!o) return null;
              const cx = x(o.riskScore as number);
              const cy = y(o.predictedReturn90d as number);
              return (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute z-40 w-56 rounded-xl border border-white/15 bg-[#161a22] p-3 text-[12px] shadow-2xl"
                  style={{
                    left: Math.min(width - 232, Math.max(0, cx + 30)),
                    top: Math.max(0, Math.min(H - 120, cy - 50)),
                  }}
                >
                  <p className="font-semibold">{o.cardName}</p>
                  <p className="text-white/55">{o.setName}</p>
                  <p className="mt-1.5 font-mono tabular-nums">
                    {o.predictedReturn90d! > 0 ? '+' : ''}
                    {o.predictedReturn90d}% est. · risk {o.riskScore} · score {o.score}
                  </p>
                  <p className="mt-1 line-clamp-2 text-white/65">{o.why}</p>
                </div>
              );
            })()
          : null}
      </div>
      {unplaced > 0 ? (
        <p className="mt-2 text-[12px] text-white/50">
          {unplaced} opportunit{unplaced === 1 ? 'y has' : 'ies have'} no risk score or 90-day
          estimate and {unplaced === 1 ? 'is' : 'are'} listed below only.
        </p>
      ) : null}
    </section>
  );
}
