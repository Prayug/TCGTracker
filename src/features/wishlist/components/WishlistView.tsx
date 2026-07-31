import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Heart, Target, Trash2, Download, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  cardWishlistService,
  WishlistItem,
  WishlistPriority,
} from '../../../services/cardWishlistService';
import { useGame } from '../../../contexts/GameContext';
import { useCardModal } from '../../../contexts/CardModalContext';
import { getCardPrice, getCardImage } from '../../../utils/cardPrice';
import { formatCurrency } from '../../../utils/cardDisplay';
import { PageEmptyState } from '../../../components/common/PageEmptyState';

const PRIORITY_ORDER: Record<WishlistPriority, number> = { high: 0, medium: 1, low: 2 };

export const WishlistView: React.FC = () => {
  const { game, isPokemon } = useGame();
  const { openCard } = useCardModal();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'at-target'>('all');

  const load = useCallback(() => {
    setItems(cardWishlistService.getItems(game));
  }, [game]);

  useEffect(() => {
    load();
    const onUpdate = () => load();
    window.addEventListener('tcg:wishlist-updated', onUpdate);
    return () => window.removeEventListener('tcg:wishlist-updated', onUpdate);
  }, [load]);

  const atTargetIds = useMemo(
    () => new Set(cardWishlistService.getAtTarget(game).map((i) => i.id)),
    [items, game]
  );

  const visible = useMemo(() => {
    const list = filter === 'at-target' ? items.filter((i) => atTargetIds.has(i.id)) : items;
    return [...list].sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.card.name.localeCompare(b.card.name)
    );
  }, [items, filter, atTargetIds]);

  const handleExport = () => {
    const csv = cardWishlistService.exportCsv(game);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tcg-wishlist-${game}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const gameLabel = isPokemon ? 'Pokemon' : 'One Piece';

  return (
    <div className="section-stack">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-foil">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow-accent" aria-hidden />
            Want list
          </p>
          <h1 className="font-display text-h1 text-ink-primary">{gameLabel} Wishlist</h1>
          <p className="max-w-2xl text-sm text-ink-secondary">
            Track cards you want with optional buy targets. At-target badges appear when market ≤ target.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={items.length === 0}
            className="btn-secondary"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: 'all' as const, label: `All (${items.length})` },
            { key: 'at-target' as const, label: `At target (${atTargetIds.size})` },
          ]
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === key
                ? 'border-accent/40 bg-accent-muted text-accent'
                : 'border-border-default text-ink-muted hover:text-ink-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <PageEmptyState
          icon={Heart}
          title={filter === 'at-target' ? 'No cards at target yet' : 'Wishlist is empty'}
          message={
            filter === 'at-target'
              ? 'Set a max buy price on wishlist cards to see hits here.'
              : 'Open any card and tap Wishlist to start your want list.'
          }
          action={
            <Link to="/browse" className="btn-primary gap-2">
              <Search className="h-4 w-4" />
              Browse cards
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => {
            const market = getCardPrice(item.card);
            const atTarget = atTargetIds.has(item.id);
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border-default bg-surface-raised p-3 sm:flex-nowrap"
              >
                <button
                  type="button"
                  onClick={() => openCard(item.card)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <img
                    src={getCardImage(item.card)}
                    alt=""
                    className="h-16 w-12 shrink-0 rounded-md border border-border-subtle object-cover"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-ink-primary">{item.card.name}</p>
                      {atTarget && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-gain/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gain">
                          <Target className="h-3 w-3" />
                          At target
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-ink-muted">
                      {item.card.set?.name}
                      {item.card.number ? ` · #${item.card.number}` : ''}
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-ink-secondary">
                      Market {formatCurrency(market)}
                      {item.targetPrice != null && (
                        <span className="text-ink-muted">
                          {' '}
                          · Target {formatCurrency(item.targetPrice)}
                        </span>
                      )}
                    </p>
                  </div>
                </button>

                <select
                  value={item.priority}
                  onChange={(e) =>
                    cardWishlistService.update(
                      item.id,
                      { priority: e.target.value as WishlistPriority },
                      game
                    )
                  }
                  className="input max-w-[7.5rem] py-1.5 text-xs"
                  aria-label="Priority"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>

                <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                  Max $
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="—"
                    defaultValue={item.targetPrice ?? ''}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      cardWishlistService.update(
                        item.id,
                        { targetPrice: val ? parseFloat(val) : undefined },
                        game
                      );
                    }}
                    className="input w-20 py-1.5 text-xs tabular-nums"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => cardWishlistService.remove(item.card.id, game)}
                  className="rounded-lg border border-border-default p-2 text-ink-muted hover:border-loss/40 hover:text-loss"
                  aria-label={`Remove ${item.card.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
