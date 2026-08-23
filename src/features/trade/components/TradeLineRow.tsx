import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../../utils/cardDisplay';
import { lineUnitValue } from '../cardToLine';
import type { TradeCardLine } from '../types';

interface TradeLineRowProps {
  line: TradeCardLine;
  onQty: (qty: number) => void;
  onOverride: (price: number | null) => void;
  onRemove: () => void;
}

export function TradeLineRow({ line, onQty, onOverride, onRemove }: TradeLineRowProps) {
  const unit = lineUnitValue(line);
  const lineTotal = unit != null ? unit * line.quantity : null;
  const custom = line.priceOverride != null && line.priceOverride > 0;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised/80 p-2.5">
      {line.imageSmall ? (
        <img
          src={line.imageSmall}
          alt=""
          className="h-14 w-10 shrink-0 rounded-md border border-border-subtle object-cover"
        />
      ) : (
        <div className="h-14 w-10 shrink-0 rounded-md bg-surface-inset" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-primary">{line.name}</p>
        <p className="truncate text-xs text-ink-muted">
          {line.setName}
          {line.number ? ` · #${line.number}` : ''}
        </p>
        <label className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-muted">
          {custom ? 'Custom' : 'Market'}
          <input
            type="number"
            min={0}
            step={0.01}
            aria-label={`Unit price for ${line.name}`}
            value={custom ? (line.priceOverride ?? '') : (line.unitPrice ?? '')}
            placeholder="—"
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (!raw) {
                onOverride(null);
                return;
              }
              const next = Number(raw);
              onOverride(Number.isFinite(next) && next > 0 ? next : null);
            }}
            className="input h-7 w-[4.75rem] py-0 text-xs tabular-nums"
          />
        </label>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center rounded-lg border border-border-subtle">
          <button
            type="button"
            className="p-1.5 text-ink-muted hover:text-ink-primary"
            aria-label={`Decrease ${line.name} quantity`}
            onClick={() => onQty(Math.max(1, line.quantity - 1))}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-6 text-center text-xs font-semibold tabular-nums text-ink-primary">
            {line.quantity}
          </span>
          <button
            type="button"
            className="p-1.5 text-ink-muted hover:text-ink-primary"
            aria-label={`Increase ${line.name} quantity`}
            onClick={() => onQty(Math.min(99, line.quantity + 1))}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-sm font-semibold tabular-nums text-ink-primary">
          {lineTotal != null ? formatCurrency(lineTotal) : '—'}
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1 text-ink-muted hover:text-loss"
          aria-label={`Remove ${line.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
