import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { useGame } from '../../../contexts/GameContext';
import { onePieceApi } from '../../../services/onepieceApi';
import { pokemonApi } from '../../../services/pokemonApi';
import { OnePieceCard } from '../../../types/onepiece';
import { PokemonCard } from '../../../types/pokemon';
import { getCardPrice } from '../../../utils/cardPrice';
import { formatCurrency } from '../../../utils/cardDisplay';

const PLACEHOLDER_NAMES = new Set(['graded card', 'unknown card', 'card']);

function isUsefulPrefill(name?: string): boolean {
  const trimmed = name?.trim() ?? '';
  if (trimmed.length < 2) return false;
  return !PLACEHOLDER_NAMES.has(trimmed.toLowerCase());
}

function toPokemonShape(card: PokemonCard | OnePieceCard): PokemonCard {
  const set = card.set;
  return {
    ...(card as PokemonCard),
    id: card.id,
    name: card.name,
    images: card.images,
    number: card.number,
    rarity: card.rarity,
    marketPrice: card.marketPrice,
    set: {
      id: set.id,
      name: set.name,
      releaseDate: 'releaseDate' in set ? String(set.releaseDate ?? '') : '',
      total: 'total' in set && typeof set.total === 'number' ? set.total : 0,
    },
  };
}

interface CardSearchPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Prefills the search field (e.g. grading.cardName). */
  initialQuery?: string;
  onSelect: (card: PokemonCard) => void;
  title?: string;
  description?: string;
}

export const CardSearchPickerModal: React.FC<CardSearchPickerModalProps> = ({
  isOpen,
  onClose,
  initialQuery = '',
  onSelect,
  title = 'Match card for vault',
  description = 'Search the catalog and pick the real card to add.',
}) => {
  const { game, isOnePiece } = useGame();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<PokemonCard | OnePieceCard>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSearchKey = useRef<string | null>(null);

  const runSearch = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      if (q.length < 2) {
        setResults([]);
        setSearched(false);
        setError(null);
        return;
      }

      setIsSearching(true);
      setError(null);
      setSearched(true);
      try {
        if (isOnePiece) {
          const found = await onePieceApi.searchCards(q);
          setResults(found.slice(0, 20));
        } else {
          const found = await pokemonApi.searchCards(q, undefined, 30);
          setResults(found.slice(0, 20));
        }
      } catch (err) {
        console.error('Card search failed:', err);
        setResults([]);
        setError('Search failed. Try again.');
      } finally {
        setIsSearching(false);
      }
    },
    [isOnePiece]
  );

  useEffect(() => {
    if (!isOpen) {
      autoSearchKey.current = null;
      return;
    }

    const prefill = isUsefulPrefill(initialQuery) ? initialQuery!.trim() : '';
    setQuery(prefill);
    setResults([]);
    setError(null);
    setSearched(false);

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    const key = `${game}:${prefill}`;
    if (prefill && autoSearchKey.current !== key) {
      autoSearchKey.current = key;
      void runSearch(prefill);
    }

    return () => window.clearTimeout(focusTimer);
  }, [isOpen, initialQuery, game, runSearch]);

  const handleSelect = (card: PokemonCard | OnePieceCard) => {
    onSelect(toPokemonShape(card));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="slab" size="medium">
      <div className="mx-auto max-w-xl">
        <div className="mb-4">
          <h2 className="font-display text-xl text-ink-primary">{title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void runSearch(query);
                }
              }}
              placeholder={
                isOnePiece ? 'Search One Piece cards…' : 'Search Pokémon cards…'
              }
              className="input w-full pl-10"
              aria-label="Search cards"
            />
          </div>
          <button
            type="button"
            onClick={() => void runSearch(query)}
            disabled={isSearching || query.trim().length < 2}
            className="btn-primary justify-center px-5 disabled:opacity-50"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}

        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {isSearching && results.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-muted">Searching catalog…</p>
          )}

          {!isSearching && searched && results.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-muted">
              No matches. Try a shorter name or set number.
            </p>
          )}

          {!searched && !isSearching && (
            <p className="py-8 text-center text-sm text-ink-muted">
              Type a card name and search to match your graded photo.
            </p>
          )}

          {results.map((card) => {
            const price = getCardPrice(card);
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => handleSelect(card)}
                className="flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface-inset p-3 text-left transition-colors hover:bg-surface-hover"
              >
                <img
                  src={card.images.small}
                  alt=""
                  className="h-16 w-11 shrink-0 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-semibold text-ink-primary">{card.name}</h4>
                  <p className="text-xs text-ink-muted">
                    {card.set.name}
                    {card.number ? ` · #${card.number}` : ''}
                  </p>
                  {price > 0 && (
                    <p className="mt-1 text-sm font-semibold text-emerald-300">
                      {formatCurrency(price)}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs font-semibold text-accent">Select</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end border-t border-border-subtle pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};
