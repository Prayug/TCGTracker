import { useEffect, useMemo, useState } from 'react';
import { PokemonCard } from '../../../types/pokemon';
import { PriceHistoryApi, TopMoverEntry } from '../../../services/priceHistoryApi';
import { CardTile } from './CardTile';
import { useCardModal } from '../../../contexts/CardModalContext';

const POKEMON_POPULAR = ['Charizard', 'Pikachu', 'Umbreon', 'Rayquaza', 'Gengar'];
const ONE_PIECE_POPULAR = ['Luffy', 'Zoro', 'Nami', 'Shanks', 'Ace'];

function toPokemonCard(entry: TopMoverEntry): PokemonCard {
  return {
    id: entry.cardId || `prod-${entry.productId}`,
    name: entry.productName,
    uniqueIdentifier: entry.uniqueIdentifier || undefined,
    images: {
      small: entry.imageSmall || entry.imageLarge || '',
      large: entry.imageLarge || entry.imageSmall || '',
    },
    set: {
      id: entry.setId || '',
      name: entry.setName || entry.groupName || '',
      releaseDate: '',
      total: 0,
    },
    number: entry.cardNumber || '',
    rarity: entry.rarity || undefined,
    marketPrice: entry.currentPrice,
  };
}

function hasArt(e: TopMoverEntry) {
  return Boolean(e.imageSmall || e.imageLarge);
}

interface BrowseDiscoveryProps {
  isOnePiece?: boolean;
  onTrySearch: (query: string) => void;
}

/** Default Browse content — live movers instead of a blank “search to start” canvas. */
export function BrowseDiscovery({ isOnePiece = false, onTrySearch }: BrowseDiscoveryProps) {
  const { openCard } = useCardModal();
  const popular = isOnePiece ? ONE_PIECE_POPULAR : POKEMON_POPULAR;
  const [entries, setEntries] = useState<TopMoverEntry[]>(() => {
    const cached = PriceHistoryApi.peekTopMovers(7, 50);
    return cached ? [...(cached.gainers || []), ...(cached.losers || [])] : [];
  });
  const [loading, setLoading] = useState(entries.length === 0 && !isOnePiece);

  useEffect(() => {
    if (isOnePiece) {
      setLoading(false);
      return;
    }
    let mounted = true;
    PriceHistoryApi.getTopMovers(7, 50).then((result) => {
      if (!mounted) return;
      const combined = [...(result.gainers || []), ...(result.losers || [])];
      if (combined.length > 0) setEntries(combined);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [isOnePiece]);

  const trending = useMemo(() => {
    return entries
      .filter((e) => e.changePercent > 0 && hasArt(e) && e.currentPrice >= 0.5)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 12)
      .map(toPokemonCard);
  }, [entries]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Popular right now
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {popular.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onTrySearch(name)}
              className="cursor-pointer rounded-full border border-border-subtle bg-surface-raised px-3 py-1.5 text-sm font-medium text-ink-primary transition-colors hover:border-accent/40 hover:text-accent"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {!isOnePiece ? (
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-ink-primary">Trending</h2>
            <p className="text-xs text-ink-muted">Top 7-day movers</p>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[3/4] rounded-xl" />
              ))}
            </div>
          ) : trending.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {trending.map((card) => (
                <CardTile key={card.id} card={card} onClick={() => openCard(card)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Search a name above to start browsing.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Pick a name to start browsing the catalog.</p>
      )}
    </div>
  );
}
