import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { pokemonApi } from '../../services/pokemonApi';
import { onePieceApi } from '../../services/onepieceApi';
import { useGame } from '../../contexts/GameContext';
import { useCardModal } from '../../contexts/CardModalContext';
import { getCardPrice, type AnyCard } from '../../utils/cardPrice';
import { CardArt } from '../../components/exchange/CardArt';
import { Price } from '../../components/exchange/Price';
import { cn } from '@/lib/utils';

const STARTERS: Record<'pokemon' | 'onepiece', string[]> = {
  pokemon: ['Charizard', 'Umbreon VMAX', 'Pikachu Illustrator', 'Lugia'],
  onepiece: ['Monkey D. Luffy', 'Shanks', 'Nami', 'Roronoa Zoro'],
};

/**
 * The visitor demo: a real search box that returns real catalog cards and
 * opens the research page. The product explains itself by working.
 */
export function CardLookup({ autoFocus = false }: { autoFocus?: boolean }) {
  const { game, isOnePiece } = useGame();
  const { openCard } = useCardModal();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AnyCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState(false);
  const listId = useId();
  const req = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const id = ++req.current;
    setLoading(true);
    setError(false);
    const t = window.setTimeout(() => {
      const run = isOnePiece
        ? onePieceApi.searchCards(term)
        : pokemonApi.searchCards(term, undefined, 8);
      run
        .then((cards) => {
          if (id !== req.current) return;
          setResults((cards as AnyCard[]).slice(0, 6));
          setActive(0);
        })
        .catch(() => id === req.current && setError(true))
        .finally(() => id === req.current && setLoading(false));
    }, 220);
    return () => window.clearTimeout(t);
  }, [q, isOnePiece]);

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Look up any card
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" />
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- only on the visitor home, where search is the task
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && results[active]) {
              e.preventDefault();
              openCard(results[active]);
            }
          }}
          placeholder={isOnePiece ? 'Try “Luffy OP05”' : 'Try “Charizard Base Set”'}
          className="h-14 w-full rounded-lg border border-border-strong bg-surface-raised pl-12 pr-4 text-[17px] shadow-sm placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-[var(--ring-accent)]"
        />
      </div>

      {q.trim().length < 2 ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-meta text-ink-muted">
          Start with
          {STARTERS[game].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQ(s)}
              className="rounded-full border border-border-strong px-2.5 py-0.5 text-[12.5px] text-ink-secondary hover:border-ink-muted hover:text-ink-primary"
            >
              {s}
            </button>
          ))}
        </p>
      ) : null}

      <div aria-live="polite" className="sr-only">
        {loading ? 'Searching' : q.trim().length >= 2 ? `${results.length} results` : ''}
      </div>

      {q.trim().length >= 2 ? (
        <div className="mt-3">
          {error ? (
            <p className="text-meta text-loss">
              Search is unavailable right now. Try again in a moment.
            </p>
          ) : loading && results.length === 0 ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-14 rounded" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="text-meta text-ink-muted">
              No cards match “{q}”. Check the spelling or try the set name.
            </p>
          ) : (
            <ul id={listId} role="listbox" className="border-t border-rule-strong">
              {results.map((card, i) => (
                <li
                  key={`${card.id}-${i}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => openCard(card)}
                  onKeyDown={() => undefined}
                  className={cn(
                    'grid cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-rule px-1 py-2',
                    i === active && 'bg-surface-hover'
                  )}
                >
                  <span className="w-10">
                    <CardArt card={card} flat />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{card.name}</span>
                    <span className="block truncate text-meta text-ink-muted">
                      {card.set?.name}
                      {card.number ? ` · No. ${card.number}` : ''}
                      {card.rarity ? ` · ${card.rarity}` : ''}
                      {'language' in card && card.language === 'ja' ? ' · Japanese' : ''}
                    </span>
                  </span>
                  <span className="text-right">
                    <Price value={getCardPrice(card)} size="sm" className="block" />
                    <span className="text-[11px] text-ink-muted">market</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
