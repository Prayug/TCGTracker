import { useEffect, useRef, useState } from 'react';
import type { VaultCard } from '../../../types/pokemon';
import { vaultService } from '../../../services/vaultService';
import { CardArt } from '../../../components/exchange/CardArt';
import { Delta, Price } from '../../../components/exchange/Price';
import { holdingMarketValue, knownCostBasis, knownHoldingProfit } from '../../../utils/vaultCost';
import {
  CONDITION_SHORT,
  CONDITION_LABEL,
  type HoldingSort,
  type SortDir,
  costUpdate,
  parseCostInput,
} from '../ledger';
import { cn } from '@/lib/utils';

interface Props {
  rows: VaultCard[];
  game: 'pokemon' | 'onepiece';
  sort: HoldingSort;
  dir: SortDir;
  onSort: (key: HoldingSort) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (holding: VaultCard) => void;
}

/**
 * Inline cost entry. The most common edit in a collection is filling in a
 * missing purchase price, so it happens in the row, not in a dialog.
 */
function CostCell({ holding, game }: { holding: VaultCard; game: 'pokemon' | 'onepiece' }) {
  const basis = knownCostBasis(holding);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const commit = () => {
    const parsed = parseCostInput(draft);
    if (parsed === undefined) {
      setInvalid(true);
      return;
    }
    if (parsed !== null) vaultService.updateVaultCard(holding.id, costUpdate(parsed), game);
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center justify-end gap-1">
        <label className="sr-only" htmlFor={`cost-${holding.id}`}>
          Paid per card for {holding.card.name}
        </label>
        <input
          ref={input}
          id={`cost-${holding.id}`}
          inputMode="decimal"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={commit}
          placeholder="per card"
          aria-invalid={invalid}
          className={cn(
            'input h-8 w-24 px-2 text-right font-mono text-[13px] tabular-nums',
            invalid && 'border-loss'
          )}
        />
      </span>
    );
  }

  if (basis == null) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft('');
          setEditing(true);
        }}
        className="rounded px-1.5 py-0.5 font-sans text-[12.5px] text-warn underline decoration-dotted underline-offset-2 hover:bg-warn-muted"
        aria-label={`Add what you paid for ${holding.card.name}`}
      >
        Add cost
      </button>
    );
  }
  return (
    <span>
      <Price value={basis} size="sm" allowZero className="font-normal text-ink-secondary" />
      {holding.quantity > 1 ? (
        <span className="block text-[11px] text-ink-muted">
          {holding.quantity} × ${holding.purchasePrice.toFixed(2)}
        </span>
      ) : null}
    </span>
  );
}

function SortHeader({
  label,
  k,
  sort,
  dir,
  onSort,
  className,
}: {
  label: string;
  k: HoldingSort;
  sort: HoldingSort;
  dir: SortDir;
  onSort: (k: HoldingSort) => void;
  className?: string;
}) {
  const active = sort === k;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-ink-primary',
          className?.includes('num') && 'flex-row-reverse',
          active && 'text-ink-primary'
        )}
      >
        {label}
        <span aria-hidden className="w-2 font-mono text-[10px]">
          {active ? (dir === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
  );
}

export function HoldingsTable({
  rows,
  game,
  sort,
  dir,
  onSort,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
}: Props) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const some = rows.some((r) => selected.has(r.id));
  const headProps = { sort, dir, onSort };
  return (
    <div className="overflow-x-auto">
      <table className="ledger ledger-tight min-w-full">
        <caption className="sr-only">
          Holdings. Market value is the TCGplayer Near Mint estimate times copies. Unrealized P/L is
          shown only where you recorded what you paid.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="hidden w-8 sm:table-cell">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = some && !allSelected;
                }}
                onChange={onToggleAll}
                aria-label="Select all shown holdings"
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </th>
            <th scope="col" className="w-11">
              <span className="sr-only">Artwork</span>
            </th>
            <SortHeader label="Card" k="name" {...headProps} />
            <SortHeader label="Qty" k="qty" className="num hidden sm:table-cell" {...headProps} />
            <th scope="col" className="hidden md:table-cell">
              Cond.
            </th>
            <SortHeader
              label="Cost basis"
              k="cost"
              className="num hidden md:table-cell"
              {...headProps}
            />
            <SortHeader label="Market value" k="value" className="num" {...headProps} />
            <SortHeader
              label="Unrealized"
              k="pl"
              className="num hidden sm:table-cell"
              {...headProps}
            />
            <SortHeader
              label="Acquired"
              k="date"
              className="num hidden xl:table-cell"
              {...headProps}
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((vc) => {
            const value = holdingMarketValue(vc);
            const pl = knownHoldingProfit(vc);
            const isSel = selected.has(vc.id);
            return (
              <tr key={vc.id} className={cn(isSel && '[&>td]:bg-accent-muted/60')}>
                <td className="hidden sm:table-cell">
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => onToggle(vc.id)}
                    aria-label={`Select ${vc.card.name}`}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </td>
                <td className="pr-0">
                  <span className="block w-8">
                    <CardArt card={vc.card} flat />
                  </span>
                </td>
                <td className="max-w-[1px] sm:max-w-none">
                  <button
                    type="button"
                    onClick={() => onOpen(vc)}
                    className="block max-w-[50vw] truncate text-left font-medium hover:underline sm:max-w-[22rem]"
                  >
                    {vc.card.name}
                  </button>
                  <span className="block max-w-[50vw] truncate text-meta text-ink-muted sm:max-w-[22rem]">
                    {vc.card.set?.name}
                    {vc.card.number ? ` · No. ${vc.card.number}` : ''}
                    <span className="sm:hidden"> · ×{vc.quantity}</span>
                    {vc.gradingResult ? ` · est. ${vc.gradingResult.grade}` : ''}
                  </span>
                </td>
                <td className="num hidden sm:table-cell">{vc.quantity}</td>
                <td className="hidden md:table-cell">
                  <abbr
                    title={CONDITION_LABEL[vc.condition]}
                    className="font-mono text-[12px] text-ink-secondary no-underline"
                  >
                    {CONDITION_SHORT[vc.condition] ?? vc.condition}
                  </abbr>
                </td>
                <td className="num hidden md:table-cell">
                  <CostCell holding={vc} game={game} />
                </td>
                <td className="num">
                  <Price value={value} size="sm" />
                </td>
                <td className="num hidden sm:table-cell">
                  {pl ? (
                    <Delta pct={pl.profitPct} amount={pl.profit} />
                  ) : (
                    <span className="font-mono text-[12.5px] text-ink-muted">—</span>
                  )}
                </td>
                <td className="num hidden text-[12px] text-ink-muted xl:table-cell">
                  {new Date(vc.purchaseDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
