import { useMemo, useState } from 'react';
import type { GradedPriceEntry } from '../../services/gradedPricesApi';
import { estimatePsaGradingFee } from '../grading/psaFees';
import { formatCurrency } from '../../utils/cardDisplay';
import {
  breakEvenSalePrice,
  rawBaseline,
  scenario,
  totalOutlay,
  type GradingAssumptions,
} from './gradingEconomics';
import { gradeLabel, graderLabel } from './useCardResearch';
import { cn } from '@/lib/utils';

function MoneyField({
  id,
  label,
  value,
  onChange,
  help,
  suffix,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12.5px] font-medium text-ink-secondary">
        {label}
      </label>
      <div className="relative">
        {suffix ? null : (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-ink-muted">
            $
          </span>
        )}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn('input h-9 font-mono', suffix ? 'pr-7' : 'pl-6')}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-ink-muted">
            {suffix}
          </span>
        ) : null}
      </div>
      {help ? <p className="mt-1 text-[11.5px] leading-snug text-ink-muted">{help}</p> : null}
    </div>
  );
}

const num = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Interactive grading economics. Inputs are the user's assumptions; sale
 * values default to the sold-guide price for each grade where we have one.
 * Shows scenarios, not probabilities — we do not have defensible grade odds
 * for an unseen copy, so no expected-value number is invented.
 */
export function GradingCalculator({
  rawPrice,
  gradedRows,
}: {
  rawPrice: number | null;
  gradedRows: GradedPriceEntry[];
}) {
  const graders = useMemo(() => {
    const set = new Set(gradedRows.filter((r) => (r.price ?? 0) > 0).map((r) => r.grader));
    return [...set];
  }, [gradedRows]);
  const [grader, setGrader] = useState<string>(() =>
    graders.includes('psa') ? 'psa' : (graders[0] ?? 'psa')
  );
  const defaultFee = estimatePsaGradingFee(rawPrice ?? 0).fee;

  const [acq, setAcq] = useState(rawPrice ? rawPrice.toFixed(2) : '');
  const [fee, setFee] = useState(defaultFee.toFixed(2));
  const [ship, setShip] = useState('25.00');
  const [sellerPct, setSellerPct] = useState('13.25');
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const assumptions: GradingAssumptions = {
    acquisition: num(acq),
    gradingFee: num(fee),
    shipping: num(ship),
    sellerFeePct: num(sellerPct) / 100,
  };

  const rows = gradedRows
    .filter((r) => r.grader === grader && (r.price ?? 0) > 0)
    .slice(0, 5)
    .map((r) => {
      const key = `${r.grader}-${r.grade}`;
      const sale = overrides[key] != null ? num(overrides[key]) : (r.price as number);
      return { key, entry: r, outcome: scenario(gradeLabel(r), sale, assumptions) };
    });

  const breakEven = breakEvenSalePrice(assumptions);
  const raw = rawPrice ? rawBaseline(rawPrice, assumptions) : null;
  const outlay = totalOutlay(assumptions);
  const maxAbs = Math.max(
    1,
    ...rows.map((r) => Math.abs(r.outcome.profit)),
    raw ? Math.abs(raw.profit) : 0
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <fieldset className="space-y-3">
        <legend className="mb-1 text-[13px] font-semibold">Your assumptions</legend>
        <MoneyField
          id="gc-acq"
          label="Raw copy cost"
          value={acq}
          onChange={setAcq}
          help="What you paid, or what it costs to buy raw now."
        />
        <MoneyField
          id="gc-fee"
          label="Grading fee"
          value={fee}
          onChange={setFee}
          help={`Default is the PSA tier for this declared value (${formatCurrency(defaultFee)}). Check current pricing.`}
        />
        <MoneyField
          id="gc-ship"
          label="Shipping and insurance"
          value={ship}
          onChange={setShip}
          help="Both ways."
        />
        <MoneyField
          id="gc-seller"
          label="Selling fees"
          value={sellerPct}
          onChange={setSellerPct}
          suffix="%"
          help="Marketplace plus payment fees on the final sale."
        />
        {graders.length > 1 ? (
          <div>
            <label
              htmlFor="gc-grader"
              className="mb-1 block text-[12.5px] font-medium text-ink-secondary"
            >
              Grading company
            </label>
            <select
              id="gc-grader"
              className="input h-9"
              value={grader}
              onChange={(e) => setGrader(e.target.value)}
            >
              {graders.map((g) => (
                <option key={g} value={g}>
                  {graderLabel(g)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </fieldset>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-rule-strong pb-3">
          <div>
            <p className="text-meta text-ink-muted">Total outlay</p>
            <p className="font-mono text-[20px] font-medium tabular-nums">
              {formatCurrency(outlay)}
            </p>
          </div>
          <div>
            <p className="text-meta text-ink-muted">Break-even sale price</p>
            <p className="font-mono text-[20px] font-medium tabular-nums">
              {formatCurrency(breakEven)}
            </p>
          </div>
          <p className="max-w-[34ch] text-meta text-ink-muted">
            The slab has to sell for at least this after {num(sellerPct)}% fees to get your money
            back.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 text-[13.5px] text-ink-secondary">
            No sold-guide prices for graded copies of this finish, so there is nothing to compare
            against. You can still use the break-even figure above against listings you find
            yourself.
          </p>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="ledger mt-1">
              <caption className="sr-only">Net outcome by grade after all costs</caption>
              <thead>
                <tr>
                  <th>Outcome</th>
                  <th className="num">Sale price</th>
                  <th className="num hidden sm:table-cell">Net after fees</th>
                  <th className="num">Profit</th>
                  <th className="hidden w-[30%] sm:table-cell">
                    <span className="sr-only">Profit bar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ key, entry, outcome }) => (
                  <tr key={key}>
                    <td className="font-medium">{outcome.label}</td>
                    <td className="num">
                      <label className="sr-only" htmlFor={`gc-sale-${key}`}>
                        Sale price for {outcome.label}
                      </label>
                      <input
                        id={`gc-sale-${key}`}
                        type="number"
                        min="0"
                        step="1"
                        inputMode="decimal"
                        value={overrides[key] ?? String(entry.price ?? '')}
                        onChange={(e) => setOverrides((o) => ({ ...o, [key]: e.target.value }))}
                        className="w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-right font-mono tabular-nums hover:border-border-default focus:border-accent focus:outline-none"
                      />
                    </td>
                    <td className="num hidden sm:table-cell">
                      {formatCurrency(outcome.netProceeds)}
                    </td>
                    <td
                      className={cn(
                        'num font-medium',
                        outcome.profit >= 0 ? 'text-gain' : 'text-loss'
                      )}
                    >
                      {formatCurrency(outcome.profit, { signed: true })}
                    </td>
                    <td className="hidden sm:table-cell">
                      <ProfitBar value={outcome.profit} max={maxAbs} />
                    </td>
                  </tr>
                ))}
                {raw ? (
                  <tr>
                    <td className="text-ink-secondary">Sell raw instead</td>
                    <td className="num text-ink-secondary">{formatCurrency(raw.salePrice)}</td>
                    <td className="num hidden text-ink-secondary sm:table-cell">
                      {formatCurrency(raw.netProceeds)}
                    </td>
                    <td className={cn('num', raw.profit >= 0 ? 'text-gain' : 'text-loss')}>
                      {formatCurrency(raw.profit, { signed: true })}
                    </td>
                    <td className="hidden sm:table-cell">
                      <ProfitBar value={raw.profit} max={maxAbs} muted />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-meta text-ink-muted">
          Sale prices default to the PriceCharting sold guide for each grade and can be edited.
          These are scenarios, not odds: the grade a copy receives depends on its condition, which
          we cannot see here. Use the photo grader for an estimate of this copy.
        </p>
      </div>
    </div>
  );
}

/** Diverging bar around a zero line: original figure for the profit column. */
function ProfitBar({ value, max, muted }: { value: number; max: number; muted?: boolean }) {
  const pct = Math.min(1, Math.abs(value) / max) * 50;
  const positive = value >= 0;
  return (
    <div className="relative h-3 w-full" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
      <div
        className={cn(
          'absolute inset-y-0.5 rounded-sm',
          positive ? 'bg-gain' : 'bg-loss',
          muted && 'opacity-50'
        )}
        style={positive ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }}
      />
    </div>
  );
}
