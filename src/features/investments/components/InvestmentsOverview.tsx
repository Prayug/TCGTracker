import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import type {
  InvestmentSignalsResult,
  InvestmentsTab,
  OpportunitiesResult,
  Opportunity,
  OpportunityGrade,
  SlabMoversResult,
} from '../types';
import { HolographicCard } from '../../../components/collectible/HolographicCard';
import { CardArt } from '../../../components/exchange/CardArt';
import { formatUsd, PanelLoading } from './shared';
import { cn } from '@/lib/utils';

const GRADE: Record<OpportunityGrade, { label: string; cls: string }> = {
  strong_buy: { label: 'Strong buy', cls: 'bg-[#0f8a66] text-white' },
  buy: { label: 'Buy', cls: 'bg-[#1fb38a]/85 text-white' },
  watch: { label: 'Watch', cls: 'bg-[#f0bd55] text-[#1b1b1b]' },
  pass: { label: 'Pass', cls: 'bg-white/20 text-white' },
};

const signed = (n: number | null, suffix = '%') =>
  n == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${Math.round(n * 10) / 10}${suffix}`;

/**
 * The Investments landing: the highest-scoring opportunity on a stage, the
 * next ones as a gallery to pick from, a research workspace that leads into
 * each tool with what it currently holds, and the strategy lab kept apart.
 */
export function InvestmentsOverview({
  opportunities,
  loading,
  error,
  movers,
  signals,
  onTab,
}: {
  opportunities: OpportunitiesResult | null;
  loading: boolean;
  error: string | null;
  movers: SlabMoversResult | null;
  signals: InvestmentSignalsResult | null;
  onTab: (t: InvestmentsTab) => void;
}) {
  const rows = (opportunities?.rows ?? [])
    .filter((o) => o.grade !== 'pass')
    .sort((a, b) => b.score - a.score);
  const [pick, setPick] = useState<string | null>(null);
  const featured = rows.find((o) => o.cardId === pick) ?? rows[0] ?? null;
  const [, setParams] = useSearchParams();
  const openCard = (id: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('card', id);
      return next;
    });

  return (
    <div className="space-y-8">
      {loading && !opportunities ? (
        <PanelLoading />
      ) : featured ? (
        <FeaturedOpportunity o={featured} onOpen={() => openCard(featured.cardId)} />
      ) : (
        <section className="rounded-3xl border border-dashed border-border-strong p-6 sm:p-8">
          <h2 className="font-display text-[20px] font-semibold">No scored opportunities now</h2>
          <p className="mt-1 max-w-[62ch] text-[13.5px] text-ink-secondary">
            {error
              ? 'The opportunity service did not answer, so nothing is scored right now. The research tools below still work from their own data.'
              : 'Every card the model scored this run came out as a pass. That is a result, not missing data; check back after the next scoring run.'}
          </p>
        </section>
      )}

      {rows.length > 1 ? (
        <section aria-labelledby="opp-gallery-h">
          <div className="flex items-end justify-between border-b border-rule-strong pb-2">
            <h2 id="opp-gallery-h" className="font-display text-[22px] font-medium">
              More opportunities
            </h2>
            <button
              type="button"
              onClick={() => onTab('opportunities')}
              className="text-[13px] text-accent hover:underline"
            >
              Map all {opportunities?.count ?? rows.length} →
            </button>
          </div>
          <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {rows.slice(0, 8).map((o, i) => (
              <li key={`${o.cardId}-${i}`}>
                <button
                  type="button"
                  onClick={() => {
                    setPick(o.cardId);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  aria-pressed={featured?.cardId === o.cardId}
                  className={cn(
                    'group block w-full rounded-xl p-1.5 text-left transition-colors',
                    featured?.cardId === o.cardId
                      ? 'bg-surface-hover ring-1 ring-ink-muted'
                      : 'hover:bg-surface-hover/70'
                  )}
                >
                  <span className="relative block">
                    <CardArt
                      card={{
                        id: o.cardId,
                        name: o.cardName ?? 'Card',
                        images: { small: o.imageSmall ?? undefined },
                        set: { name: o.setName },
                      }}
                      alt=""
                    />
                    <span
                      className={cn(
                        'absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold',
                        GRADE[o.grade].cls
                      )}
                    >
                      {o.score}
                    </span>
                  </span>
                  <span className="mt-1.5 block truncate text-[12.5px] font-medium">
                    {o.cardName ?? o.cardId}
                  </span>
                  <span className="block font-mono text-[11px] tabular-nums text-ink-muted">
                    {signed(o.predictedReturn90d)} est. 90d
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Workspace movers={movers} signals={signals} onTab={onTab} />
        <StrategyLab onOpen={() => onTab('strategy')} />
      </div>
    </div>
  );
}

function FeaturedOpportunity({ o, onOpen }: { o: Opportunity; onOpen: () => void }) {
  const reduce = useReducedMotion();
  const figures: [string, string][] = [
    ['Score', String(o.score)],
    ['90-day estimate', signed(o.predictedReturn90d)],
    ['Confidence', o.confidence == null ? '—' : `${Math.round(o.confidence)}%`],
    ['Risk score', o.riskScore == null ? '—' : String(o.riskScore)],
    [`Momentum ${o.momentumDays}d`, signed(o.momentumPct)],
    ['Price', o.currentPrice == null ? '—' : formatUsd(o.currentPrice)],
  ];
  return (
    <section
      data-theme="dark"
      aria-labelledby="feat-opp-h"
      className="atmo-stage relative overflow-hidden rounded-3xl p-5 text-white sm:p-8"
    >
      <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-white/55">
        Featured opportunity
      </p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={o.cardId}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-4 grid items-center gap-6 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-10"
        >
          <div className="mx-auto w-40 md:w-full">
            <HolographicCard
              card={{
                id: o.cardId,
                name: o.cardName ?? 'Card',
                images: { small: o.imageSmall ?? undefined },
                set: { name: o.setName },
              }}
              level="showcase"
              onSelect={onOpen}
              label={`Research ${o.cardName ?? 'this card'}`}
            />
          </div>
          <div className="min-w-0">
            <span
              className={cn(
                'inline-block rounded-full px-2 py-0.5 text-[11.5px] font-semibold',
                GRADE[o.grade].cls
              )}
            >
              {GRADE[o.grade].label}
            </span>
            <h2
              id="feat-opp-h"
              className="mt-2 font-display text-[clamp(1.7rem,3.4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em]"
            >
              {o.cardName ?? o.cardId}
            </h2>
            <p className="text-[13px] text-white/60">{o.setName}</p>
            <p className="mt-3 max-w-[60ch] text-[14px] text-white/80">{o.why}</p>
            <dl className="mt-5 grid grid-cols-3 gap-x-6 gap-y-3 sm:grid-cols-6">
              {figures.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11.5px] text-white/50">{k}</dt>
                  <dd className="font-mono text-[16px] tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            {o.keySignals.length ? (
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {o.keySignals.slice(0, 4).map((s) => (
                  <li
                    key={s}
                    className="rounded-full border border-white/20 px-2.5 py-0.5 text-[11.5px] text-white/75"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={onOpen}
              className="mt-5 inline-flex h-9 items-center rounded-full bg-white px-4 text-[13px] font-medium text-[#0b0e14] hover:bg-white/90"
            >
              Research this card
            </button>
            <p className="mt-3 text-[11.5px] text-white/45">
              A model score from price, sales and signal data, not advice. Estimates can be wrong.
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function Workspace({
  movers,
  signals,
  onTab,
}: {
  movers: SlabMoversResult | null;
  signals: InvestmentSignalsResult | null;
  onTab: (t: InvestmentsTab) => void;
}) {
  const topMovers = (movers?.rows ?? []).slice(0, 3);
  const tools: { tab: InvestmentsTab; title: string; body: string; count?: string }[] = [
    {
      tab: 'movers',
      title: 'Slab movers',
      body: 'Graded prices that moved most, with sale counts and liquidity.',
      count: movers ? `${movers.count} moving over ${movers.days}d` : undefined,
    },
    {
      tab: 'buyouts',
      title: 'Buyout scanner',
      body: 'Cards whose cheap listings are thinning out.',
    },
    {
      tab: 'similar',
      title: 'Comparables',
      body: 'Alt grades, set mates and the same character, side by side.',
    },
    {
      tab: 'signals',
      title: 'Signals',
      body: 'News and events, each with what the market did after.',
      count: signals ? `${signals.actionable.length} actionable of ${signals.count}` : undefined,
    },
  ];
  return (
    <section
      aria-labelledby="ws-h"
      className="rounded-3xl border border-border-default bg-surface-raised p-5 sm:p-6"
    >
      <h2 id="ws-h" className="font-display text-[19px] font-semibold">
        Research workspace
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {tools.map((t) => (
          <li key={t.tab}>
            <button
              type="button"
              onClick={() => onTab(t.tab)}
              className="group flex h-full w-full flex-col rounded-2xl border border-border-default p-4 text-left transition-colors hover:border-ink-muted"
            >
              <span className="text-[14.5px] font-semibold">{t.title}</span>
              <span className="mt-1 flex-1 text-[12.5px] text-ink-muted">{t.body}</span>
              {t.tab === 'movers' && topMovers.length ? (
                <span className="mt-3 flex gap-1.5" aria-hidden>
                  {topMovers.map((m, i) => (
                    <span key={`${m.cardId}-${i}`} className="w-9">
                      <CardArt
                        card={{
                          id: m.cardId,
                          name: m.cardName ?? 'Card',
                          images: { small: m.imageSmall ?? undefined },
                        }}
                        flat
                        alt=""
                      />
                    </span>
                  ))}
                </span>
              ) : null}
              <span className="mt-3 flex items-center justify-between text-[12.5px]">
                <span className="font-mono text-ink-secondary">{t.count ?? ''}</span>
                <span className="text-accent group-hover:underline">Open →</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StrategyLab({ onOpen }: { onOpen: () => void }) {
  return (
    <section
      aria-labelledby="lab-h"
      className="flex flex-col rounded-3xl border border-border-default bg-surface-raised p-5 sm:p-6"
    >
      <svg viewBox="0 0 120 48" className="h-12 w-28 text-accent" aria-hidden>
        <path d="M2 44h116" stroke="currentColor" strokeOpacity=".25" />
        <path
          d="M4 38 22 33 38 36 56 24 72 27 90 14 116 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M4 38 22 37 38 39 56 34 72 36 90 33 116 32"
          fill="none"
          stroke="currentColor"
          strokeOpacity=".45"
          strokeWidth="2"
          strokeDasharray="3 4"
          strokeLinecap="round"
        />
      </svg>
      <h2 id="lab-h" className="mt-3 font-display text-[19px] font-semibold">
        Strategy lab
      </h2>
      <p className="mt-1 flex-1 text-[13px] text-ink-secondary">
        Replay simple buying rules on real weekly prices, after fees and shipping, and see whether
        any did better than buying a random card. It says plainly when there is not enough history
        to tell.
      </p>
      <button type="button" onClick={onOpen} className="btn-secondary mt-4 self-start">
        Test strategies
      </button>
    </section>
  );
}
