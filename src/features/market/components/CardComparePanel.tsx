import React, { useEffect, useMemo, useState } from 'react';
import { GitCompareArrows, Loader2, Search, X } from 'lucide-react';
import { PokemonCard } from '../../../types/pokemon';
import { pokemonApi } from '../../../services/pokemonApi';
import { PriceHistoryApi } from '../../../services/priceHistoryApi';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { SectionLabel } from '../../../components/common/SectionLabel';
import { PriceChart } from './PriceChart';

interface CompareSlot {
  card: PokemonCard;
  history: { date: string; price: number }[];
  loading: boolean;
  changePct: number | null;
}

async function loadHistory(card: PokemonCard): Promise<{ date: string; price: number }[]> {
  try {
    const history = await PriceHistoryApi.getPokemonCardPriceHistory({
      id: card.id,
      name: card.name,
      set: card.set,
      number: card.number,
      rarity: card.rarity,
      productId: card.tcgplayer?.productId,
      variant: card.preferredVariant,
    });
    return history ?? [];
  } catch {
    return [];
  }
}

function pctChange(history: { date: string; price: number }[]): number | null {
  if (history.length < 2) return null;
  const first = history[0].price;
  const last = history[history.length - 1].price;
  if (first <= 0) return null;
  return ((last - first) / first) * 100;
}

export const CardComparePanel: React.FC = () => {
  const [slots, setSlots] = useState<(CompareSlot | null)[]>([null, null]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PokemonCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeSlot, setActiveSlot] = useState(0);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const found = await pokemonApi.searchCards(query.trim());
      setResults(found.slice(0, 8));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const pickCard = async (card: PokemonCard) => {
    setSlots((prev) => {
      const next = [...prev];
      next[activeSlot] = { card, history: [], loading: true, changePct: null };
      return next;
    });
    setResults([]);
    setQuery('');
    const history = await loadHistory(card);
    setSlots((prev) => {
      const next = [...prev];
      next[activeSlot] = {
        card,
        history,
        loading: false,
        changePct: pctChange(history),
      };
      return next;
    });
  };

  const clearSlot = (index: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  };

  const filled = slots.filter(Boolean) as CompareSlot[];

  const overlaySeries = useMemo(() => {
    if (filled.length < 2) return null;
    // Normalize each series to % of first point for overlay comparison
    return filled.map((slot) => {
      const base = slot.history[0]?.price || 1;
      return {
        name: slot.card.name,
        points: slot.history.map((p) => ({
          date: p.date,
          price: (p.price / base) * 100,
        })),
      };
    });
  }, [filled]);

  useEffect(() => {
    // no-op placeholder for future productId compare API enrichment
  }, []);

  return (
    <section className="rounded-xl border border-border-default bg-surface-raised p-4 shadow-sm">
      <div className="mb-4">
        <SectionLabel className="text-accent/90">Compare</SectionLabel>
        <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-ink-primary">
          <GitCompareArrows className="h-5 w-5 text-accent" />
          Side-by-side cards
        </h3>
        <p className="mt-1 text-xs text-ink-muted">
          Pick two cards to compare price history (normalized to 100 at start).
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {[0, 1].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveSlot(i)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${
              activeSlot === i
                ? 'border-accent/40 bg-accent-muted text-accent'
                : 'border-border-default text-ink-muted'
            }`}
          >
            Slot {i + 1}
            {slots[i] ? `: ${slots[i]!.card.name.slice(0, 18)}` : ' (empty)'}
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
            placeholder={`Search card for slot ${activeSlot + 1}…`}
            className="input w-full pl-9"
          />
        </div>
        <button type="button" onClick={() => void handleSearch()} className="btn-secondary" disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <ul className="mb-4 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border-subtle p-2">
          {results.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => void pickCard(card)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-hover"
              >
                <img src={card.images.small} alt="" className="h-10 w-7 rounded object-cover" />
                <span className="min-w-0 flex-1 truncate text-ink-primary">{card.name}</span>
                <span className="text-xs text-ink-muted">{card.set?.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot, i) => (
          <div
            key={i}
            className="relative rounded-lg border border-border-subtle bg-surface-inset p-3"
          >
            {!slot ? (
              <p className="py-6 text-center text-sm text-ink-muted">Select slot {i + 1}</p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => clearSlot(i)}
                  className="absolute right-2 top-2 rounded p-1 text-ink-muted hover:text-ink-primary"
                  aria-label="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex gap-3">
                  <img
                    src={slot.card.images.small}
                    alt=""
                    className="h-20 w-14 rounded border border-border-subtle object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-primary">{slot.card.name}</p>
                    <p className="text-xs text-ink-muted">{slot.card.set?.name}</p>
                    {slot.loading ? (
                      <Loader2 className="mt-2 h-4 w-4 animate-spin text-accent" />
                    ) : (
                      <p className="mt-1 text-sm tabular-nums text-ink-secondary">
                        {formatCurrency(slot.history.at(-1)?.price ?? slot.card.marketPrice ?? 0)}
                        {slot.changePct != null && (
                          <span
                            className={`ml-2 ${
                              slot.changePct >= 0 ? 'text-gain' : 'text-loss'
                            }`}
                          >
                            {formatPercent(slot.changePct, { signed: true })}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                {!slot.loading && slot.history.length > 1 && (
                  <div className="mt-2">
                    <PriceChart
                      priceHistory={slot.history}
                      variant="dark"
                      height={140}
                      compact
                    />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {overlaySeries && overlaySeries[0].points.length > 1 && (
        <p className="mt-3 text-center text-[11px] text-ink-muted">
          Individual charts above · both series loaded for comparison
          {overlaySeries.map((s) => ` · ${s.name}`).join('')}
        </p>
      )}
    </section>
  );
};
