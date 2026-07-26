import React, { useMemo, useState } from 'react';
import { ShoppingCart, Download } from 'lucide-react';
import { SetTrackerCard } from '../../../services/setTrackerService';
import { formatCurrency } from '../../../utils/cardDisplay';
import { SectionLabel } from '../../../components/common/SectionLabel';

type ShopMode = 'cheapest' | 'chase';

interface SetShoppingListProps {
  cards: SetTrackerCard[];
  setName: string;
  onCardClick: (card: SetTrackerCard) => void;
  onAddToVault: (card: SetTrackerCard) => void;
}

export const SetShoppingList: React.FC<SetShoppingListProps> = ({
  cards,
  setName,
  onCardClick,
  onAddToVault,
}) => {
  const [mode, setMode] = useState<ShopMode>('cheapest');
  const [open, setOpen] = useState(false);

  const missing = useMemo(() => {
    const list = cards.filter((c) => !c.owned);
    const sorted = [...list].sort((a, b) => {
      const pa = a.marketPrice ?? 0;
      const pb = b.marketPrice ?? 0;
      if (mode === 'cheapest') return pa - pb;
      return pb - pa; // chase-first: expensive first
    });
    return sorted;
  }, [cards, mode]);

  const totalCost = missing.reduce((s, c) => s + (c.marketPrice ?? 0), 0);

  const exportList = () => {
    const rows = [
      ['Name', 'Number', 'Rarity', 'Price', 'Mode'].join(','),
      ...missing.map((c) =>
        [
          `"${c.name.replace(/"/g, '""')}"`,
          c.number ?? '',
          c.rarity ?? '',
          (c.marketPrice ?? 0).toFixed(2),
          mode,
        ].join(',')
      ),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${setName.replace(/\s+/g, '-').toLowerCase()}-shopping-${mode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (missing.length === 0) return null;

  return (
    <section className="rounded-xl border border-border-default bg-surface-raised p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionLabel className="text-accent/90">Complete the set</SectionLabel>
          <h3 className="mt-1 flex items-center gap-2 text-base font-semibold text-ink-primary">
            <ShoppingCart className="h-4 w-4 text-accent" />
            Missing-card shopping list
          </h3>
          <p className="mt-1 text-xs text-ink-muted">
            {missing.length} missing · est. {formatCurrency(totalCost)} at market
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-lg border border-border-subtle p-0.5">
            <button
              type="button"
              onClick={() => setMode('cheapest')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                mode === 'cheapest' ? 'bg-accent/20 text-accent' : 'text-ink-muted'
              }`}
            >
              Cheapest first
            </button>
            <button
              type="button"
              onClick={() => setMode('chase')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                mode === 'chase' ? 'bg-accent/20 text-accent' : 'text-ink-muted'
              }`}
            >
              Chase first
            </button>
          </div>
          <button type="button" onClick={exportList} className="btn-secondary text-xs">
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="btn-secondary text-xs"
          >
            {open ? 'Hide list' : 'Show list'}
          </button>
        </div>
      </div>

      {open && (
        <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {missing.map((card) => (
            <li
              key={card.id}
              className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-inset px-2 py-1.5"
            >
              <button
                type="button"
                onClick={() => onCardClick(card)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {card.images?.small && (
                  <img
                    src={card.images.small}
                    alt=""
                    className="h-12 w-9 rounded object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-primary">{card.name}</p>
                  <p className="text-[11px] text-ink-muted">
                    #{card.number}
                    {card.rarity ? ` · ${card.rarity}` : ''}
                  </p>
                </div>
              </button>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-secondary">
                {formatCurrency(card.marketPrice ?? 0)}
              </span>
              <button
                type="button"
                onClick={() => onAddToVault(card)}
                className="shrink-0 rounded-md border border-border-default px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted hover:text-accent"
              >
                Vault
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
