import { useEffect, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { CardArt } from '../../../components/exchange/CardArt';
import { Price } from '../../../components/exchange/Price';
import { lineUnitValue } from '../cardToLine';
import type { TradeCardLine } from '../types';
import { cn } from '@/lib/utils';

interface TradeLineRowProps {
  line: TradeCardLine;
  onQty: (qty: number) => void;
  onOverride: (price: number | null) => void;
  onRemove: () => void;
}

/**
 * One card in the trade. The unit price is the market price captured when
 * the card was added, unless you type your own; the label says which.
 */
export function TradeLineRow({ line, onQty, onOverride, onRemove }: TradeLineRowProps) {
  const unit = lineUnitValue(line);
  const lineTotal = unit != null ? unit * line.quantity : null;
  const custom = line.priceOverride != null && line.priceOverride > 0;
  const shown = custom ? line.priceOverride : line.unitPrice;
  const [text, setText] = useState(shown != null ? shown.toFixed(2) : '');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText(shown != null ? shown.toFixed(2) : '');
    setInvalid(false);
  }, [shown]);

  const commit = () => {
    const raw = text.replace(/[$,\s]/g, '');
    if (raw === '') {
      setInvalid(false);
      if (custom) onOverride(null);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const rounded = Math.round(n * 100) / 100;
    if (!custom && line.unitPrice != null && Math.abs(rounded - line.unitPrice) < 0.005) return;
    if (custom && line.priceOverride === rounded) return;
    onOverride(rounded);
  };

  return (
    <li className="group grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-b border-rule py-3 last:border-b-0">
      <span className="w-10">
        <CardArt
          card={{
            name: line.name,
            images: { small: line.imageSmall },
            number: line.number,
            set: { name: line.setName },
          }}
          flat
        />
      </span>

      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium" title={line.name}>
          {line.name}
        </p>
        <p className="truncate text-[12px] text-ink-muted">
          {line.setName}
          {line.number ? ` · ${line.number}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[12px] text-ink-muted">
              $
            </span>
            <input
              inputMode="decimal"
              value={text}
              placeholder="No price"
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              aria-label={`Unit price for ${line.name}`}
              aria-invalid={invalid || undefined}
              aria-describedby={`basis-${line.id}`}
              className={cn(
                'input h-8 w-[6.25rem] pl-5 font-mono text-[12.5px] tabular-nums',
                invalid && 'border-loss',
                unit == null && 'border-warn'
              )}
            />
          </span>
          <span id={`basis-${line.id}`} className="text-[11.5px] text-ink-muted">
            {custom ? (
              <>
                Your price ·{' '}
                <button
                  type="button"
                  onClick={() => onOverride(null)}
                  className="text-accent hover:underline"
                >
                  {line.unitPrice != null ? 'use market' : 'clear'}
                </button>
              </>
            ) : unit != null ? (
              'Market when added'
            ) : (
              <span className="text-warn">No market price. Enter one to count it.</span>
            )}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <span className="flex items-center gap-1">
          <Price value={lineTotal} size="sm" unavailableLabel="—" />
          <button
            type="button"
            onClick={onRemove}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-loss-muted hover:text-loss"
            aria-label={`Remove ${line.name}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
        <span
          className="inline-flex items-center rounded-md border border-border-default"
          role="group"
          aria-label={`Quantity of ${line.name}`}
        >
          <button
            type="button"
            className="grid h-7 w-7 place-items-center text-ink-muted hover:text-ink-primary disabled:opacity-40"
            aria-label="One fewer"
            disabled={line.quantity <= 1}
            onClick={() => onQty(Math.max(1, line.quantity - 1))}
          >
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span className="w-6 text-center font-mono text-[12.5px] tabular-nums" aria-live="polite">
            {line.quantity}
          </span>
          <button
            type="button"
            className="grid h-7 w-7 place-items-center text-ink-muted hover:text-ink-primary disabled:opacity-40"
            aria-label="One more"
            disabled={line.quantity >= 99}
            onClick={() => onQty(Math.min(99, line.quantity + 1))}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      </div>
    </li>
  );
}
