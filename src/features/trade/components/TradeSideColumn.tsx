import { Plus } from 'lucide-react';
import { PageEmptyState } from '../../../components/common/PageEmptyState';
import { formatCurrency } from '../../../utils/cardDisplay';
import type { TradeCardLine } from '../types';
import { TradeLineRow } from './TradeLineRow';

interface TradeSideColumnProps {
  title: string;
  hint: string;
  lines: TradeCardLine[];
  cash: number;
  total: number;
  missing: number;
  onAdd: () => void;
  onAddFromVault: () => void;
  vaultCount: number;
  onCash: (value: number) => void;
  onQty: (id: string, qty: number) => void;
  onOverride: (id: string, price: number | null) => void;
  onRemove: (id: string) => void;
}

export function TradeSideColumn({
  title,
  hint,
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
  return (
    <section className="flex min-h-[22rem] flex-col rounded-2xl border border-border-subtle bg-surface-raised/50 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-primary">{title}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>
        </div>
        <p className="font-mono text-xl font-semibold tabular-nums text-ink-primary">
          {formatCurrency(total)}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onAdd} className="btn-secondary text-xs">
          <Plus className="h-3.5 w-3.5" />
          Add card
        </button>
        <button
          type="button"
          onClick={onAddFromVault}
          disabled={vaultCount === 0}
          className="btn-secondary text-xs disabled:opacity-40"
        >
          From vault{vaultCount > 0 ? ` (${vaultCount})` : ''}
        </button>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
        Cash
        <input
          type="number"
          min={0}
          step={1}
          value={cash || ''}
          placeholder="0"
          onChange={(e) => {
            const next = Number(e.target.value);
            onCash(Number.isFinite(next) && next > 0 ? next : 0);
          }}
          className="input h-8 w-24 py-0 text-sm tabular-nums"
        />
      </label>

      {missing > 0 && (
        <p className="mt-2 text-xs text-foil">
          {missing} {missing === 1 ? 'card has' : 'cards have'} no market quote — set a custom
          price.
        </p>
      )}

      <div className="mt-4 flex-1">
        {lines.length === 0 ? (
          <PageEmptyState
            icon={Plus}
            title="Nothing on this side"
            message="Add a catalog card or something from your vault."
          />
        ) : (
          <ul className="space-y-2">
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
      </div>
    </section>
  );
}
