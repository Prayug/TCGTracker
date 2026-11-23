import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  InvestmentSignalsResult,
  InvestmentsTab,
  OpportunitiesResult,
  Opportunity,
  SlabMoversResult,
} from '../types';
import { CardArt } from '../../../components/exchange/CardArt';
import { Price } from '../../../components/exchange/Price';
import { SectionHeader } from '../../../components/exchange/Section';
import { EmptyState, LoadingRows } from '../../../components/exchange/States';
import {
  GRADE_LABEL,
  GRADE_TONE,
  displayGrade,
  opportunityReasons,
} from '../utils/opportunityReasons';
import { cn } from '@/lib/utils';

const signed = (n: number | null, suffix = '%') =>
  n == null || !Number.isFinite(n)
    ? '—'
    : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n * 10) / 10)}${suffix}`;

const tone = (n: number | null) =>
  n == null || Math.abs(n) < 0.05 ? 'text-ink-secondary' : n > 0 ? 'text-gain' : 'text-loss';

function art(o: Opportunity) {
  return {
    id: o.cardId,
    name: o.cardName ?? 'Card',
    images: { small: o.imageSmall ?? undefined },
    set: { name: o.setName },
  };
}

/**
 * Investments landing: the top-scoring card with the reasons behind its
 * grade, the rest as a ledger you can pick from, and the research tools as a
 * short list with what each currently holds.
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
    .filter((o) => displayGrade(o).grade !== 'pass')
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
    <div className="space-y-10">
      {loading && !opportunities ? (
        <LoadingRows rows={5} art label="Scoring opportunities" />
      ) : featured ? (
        <TopPick o={featured} onOpen={() => openCard(featured.cardId)} />
      ) : (
        <EmptyState title="No scored opportunities right now">
          {error
            ? 'The opportunity service did not answer, so nothing is scored. The research tools below work from their own data.'
            : 'Every card scored this run came out as a pass. That is a result, not missing data; check back after the next scoring run.'}
        </EmptyState>
      )}

      {rows.length > 1 ? (
        <section aria-labelledby="opp-list-h">
          <SectionHeader
            id="opp-list-h"
            title="Next best scores"
            note="Pick a row to read its reasons above"
            action={
              <button
                type="button"
                onClick={() => onTab('opportunities')}
                className="text-[13px] text-accent hover:underline"
              >
                All {opportunities?.count ?? rows.length} opportunities
              </button>
            }
          />
          <OpportunityLedger
            rows={rows.slice(0, 8)}
            activeId={featured?.cardId ?? null}
            onPick={(id) => {
              setPick(id);
              document.getElementById('top-pick')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </section>
      ) : null}

      <ResearchTools movers={movers} signals={signals} onTab={onTab} />
    </div>
  );
}

function GradeLabel({ o, className }: { o: Opportunity; className?: string }) {
  const { grade } = displayGrade(o);
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1.5 whitespace-nowrap font-medium',
        GRADE_TONE[grade],
        className
      )}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-current"
      />
      {GRADE_LABEL[grade]}
    </span>
  );
}

function TopPick({ o, onOpen }: { o: Opportunity; onOpen: () => void }) {
  const reasons = opportunityReasons(o);
  const figures: [string, string, string?][] = [
    ['90-day forecast', signed(o.predictedReturn90d), tone(o.predictedReturn90d)],
    [`Graded price, ${o.momentumDays}d`, signed(o.momentumPct), tone(o.momentumPct)],
    ['Confidence', o.confidence == null ? '—' : `${Math.round(o.confidence)}%`],
    ['Risk', o.riskScore == null ? '—' : `${o.riskScore}/100`],
  ];
  return (
    <section id="top-pick" aria-labelledby="top-pick-h" className="scroll-mt-28">
      <SectionHeader
        title="Highest score today"
        note="Scored from prices, sales and listings"
        strong
      />
      <div className="mt-5 grid gap-6 sm:grid-cols-[9rem_minmax(0,1fr)] md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8">
        <button
          type="button"
          onClick={onOpen}
          className="mx-auto block w-36 sm:w-full"
          aria-label={`Research ${o.cardName ?? 'this card'}`}
        >
          <CardArt card={art(o)} priority />
        </button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <GradeLabel o={o} className="text-[14px]" />
            <span className="font-mono text-[13px] tabular-nums text-ink-muted">
              score {o.score}/100
            </span>
          </div>
          <h2
            id="top-pick-h"
            className="mt-1 text-[clamp(1.4rem,2.4vw,1.9rem)] font-semibold leading-tight"
          >
            {o.cardName ?? o.cardId}
          </h2>
          <p className="text-meta text-ink-muted">
            {o.setName}
            {o.currentPrice != null ? (
              <>
                {' · '}
                <Price value={o.currentPrice} size="sm" className="text-ink-secondary" />
              </>
            ) : null}
          </p>

          {reasons.length ? (
            <ul
              className="mt-4 max-w-[60ch] border-t border-rule"
              aria-label="Why it scored this way"
            >
              {reasons.map((r) => (
                <li key={r} className="border-b border-rule py-2 text-[13.5px] text-ink-primary">
                  {r}
                </li>
              ))}
            </ul>
          ) : null}

          <dl className="mt-4 grid max-w-[40rem] grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {figures.map(([k, v, cls]) => (
              <div key={k}>
                <dt className="text-meta text-ink-muted">{k}</dt>
                <dd className={cn('font-mono text-[16px] tabular-nums', cls)}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onOpen} className="btn-primary">
              Research this card
            </button>
            <p className="text-[11.5px] text-ink-muted">
              A model score, not advice. Forecasts can be wrong.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function OpportunityLedger({
  rows,
  activeId,
  onPick,
}: {
  rows: Opportunity[];
  activeId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <table className="ledger ledger-tight mt-1">
      <caption className="sr-only">Opportunities by score</caption>
      <thead>
        <tr>
          <th scope="col">Card</th>
          <th scope="col" className="hidden sm:table-cell">
            Grade
          </th>
          <th scope="col" className="num">
            Score
          </th>
          <th scope="col" className="num">
            90d forecast
          </th>
          <th scope="col" className="num hidden md:table-cell">
            Graded price
          </th>
          <th scope="col" className="num hidden lg:table-cell">
            Price
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o, i) => (
          <tr
            key={`${o.cardId}-${i}`}
            className={cn(o.cardId === activeId && '[&>td]:bg-surface-hover')}
          >
            <td className="w-full max-w-0">
              <button
                type="button"
                onClick={() => onPick(o.cardId)}
                aria-pressed={o.cardId === activeId}
                className="group flex w-full min-w-0 items-center gap-3 text-left"
              >
                <span className="w-8 shrink-0">
                  <CardArt card={art(o)} flat alt="" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium group-hover:underline">
                    {o.cardName ?? o.cardId}
                  </span>
                  <span className="block truncate text-meta text-ink-muted">
                    {o.setName}
                    <span className="sm:hidden">
                      {' · '}
                      <GradeLabel o={o} />
                    </span>
                  </span>
                </span>
              </button>
            </td>
            <td className="hidden whitespace-nowrap sm:table-cell">
              <GradeLabel o={o} className="text-[13px]" />
            </td>
            <td className="num whitespace-nowrap">{o.score}</td>
            <td className={cn('num', tone(o.predictedReturn90d))}>
              {signed(o.predictedReturn90d)}
            </td>
            <td className={cn('num hidden md:table-cell', tone(o.momentumPct))}>
              {signed(o.momentumPct)}
            </td>
            <td className="num hidden lg:table-cell">
              <Price value={o.currentPrice} size="sm" unavailableLabel="—" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResearchTools({
  movers,
  signals,
  onTab,
}: {
  movers: SlabMoversResult | null;
  signals: InvestmentSignalsResult | null;
  onTab: (t: InvestmentsTab) => void;
}) {
  const tools: { tab: InvestmentsTab; title: string; body: string; count?: string }[] = [
    {
      tab: 'movers',
      title: 'Slab movers',
      body: 'Graded prices that moved most, with sale counts',
      count: movers ? `${movers.count} over ${movers.days}d` : undefined,
    },
    { tab: 'buyouts', title: 'Buyouts', body: 'Cards whose cheap listings are thinning out' },
    {
      tab: 'similar',
      title: 'Comparables',
      body: 'Other grades, set mates and the same character',
    },
    {
      tab: 'signals',
      title: 'News and events',
      body: 'Each with what the market did after',
      count: signals ? `${signals.actionable.length} worth a look` : undefined,
    },
    {
      tab: 'strategy',
      title: 'Strategy lab',
      body: 'Replay buying rules on real weekly prices, after fees',
    },
  ];
  return (
    <section aria-labelledby="tools-h">
      <SectionHeader id="tools-h" title="More research" />
      <ul className="divide-y divide-rule">
        {tools.map((t) => (
          <li key={t.tab}>
            <button
              type="button"
              onClick={() => onTab(t.tab)}
              className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-2.5 text-left sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
            >
              <span className="text-[13.5px] font-medium text-accent group-hover:underline">
                {t.title}
              </span>
              <span className="hidden truncate text-[13px] text-ink-secondary sm:block">
                {t.body}
              </span>
              <span className="font-mono text-[12px] tabular-nums text-ink-muted">
                {t.count ?? ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
