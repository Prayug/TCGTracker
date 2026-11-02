import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Price } from '../../../components/exchange/Price';
import type { TradeCardLine } from '../types';
import { TradeLineRow } from './TradeLineRow';

interface TradeSideColumnProps {
  id: string;
  title: string;
  lines: TradeCardLine[];
  cash: number;
  total: number;
  missing: number;
  onAdd: () => void;
  onAddFromVault?: () => void;
  vaultCount: number;
  onCash: (value: number) => void;
  onQty: (id: string, qty: number) => void;
  onOverride: (id: string, price: number | null) => void;
  onRemove: (id: string) => void;
}

/** One side of the trade. Both sides use this so they read the same. */
export function TradeSideColumn({
  id,
  title,
  lines,
  cash,
  total,
  missing,
  onAdd,
  onAddFromVault,
  vaultCount,
  onCash,
  onQty,
  onOverride,
  onRemove,
}: TradeSideColumnProps) {
  const [cashText, setCashText] = useState(cash > 0 ? String(cash) : '');
  useEffect(() => setCashText(cash > 0 ? String(cash) : ''), [cash]);
  const cards = lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0">
      <header className="flex items-end justify-between gap-3 border-b border-rule-strong pb-2">
        <div>
          <h2 id={`${id}-title`} className="text-h2">
            {title}
          </h2>
          <p className="text-[12px] text-ink-muted">
            {cards ? `${cards} card${cards === 1 ? '' : 's'}` : 'No cards'}
            {cash > 0 ? ' and cash' : ''}
          </p>
        </div>
        <Price value={total} allowZero size="md" />
      </header>

      {lines.length === 0 ? (
        <p className="py-6 text-[13px] text-ink-muted">Nothing on this side yet.</p>
      ) : (
        <ul>
          {lines.map((line) => (
            <TradeLineRow
              key={line.id}
              line={line}
              onQty={(qty) => onQty(line.id, qty)}
              onOverride={(price) => onOverride(line.id, price)}
              onRemove={() => onRemove(line.id)}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-rule py-3">
        <label htmlFor={`${id}-cash`} className="text-[13px] font-medium">
          Cash
        </label>
        <span className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[12.5px] text-ink-muted">
            $
          </span>
          <input
            id={`${id}-cash`}
            inputMode="decimal"
            value={cashText}
            placeholder="0"
            onChange={(e) => setCashText(e.target.value)}
            onBlur={() => {
              const n = Number(cashText.replace(/[$,\s]/g, ''));
              const next = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
              setCashText(next > 0 ? String(next) : '');
              if (next !== cash) onCash(next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="input h-8 w-[7rem] pl-5 text-right font-mono text-[13px] tabular-nums"
          />
        </span>
      </div>

      {missing > 0 ? (
        <p className="border-l-2 border-warn pl-2 text-[12px] text-ink-secondary">
          {missing} card{missing === 1 ? ' has' : 's have'} no price and{' '}
          {missing === 1 ? 'is' : 'are'} not in this total.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onAdd} className="btn-secondary h-9">
          <Plus className="h-4 w-4" aria-hidden />
          Add a card
        </button>
        {onAddFromVault ? (
          <button
            type="button"
            onClick={onAddFromVault}
            disabled={vaultCount === 0}
            className="btn-ghost h-9"
            title={vaultCount === 0 ? 'Your vault is empty' : undefined}
          >
            From your vault
          </button>
        ) : null}
      </div>
    </section>
  );
}
