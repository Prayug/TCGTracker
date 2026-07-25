import { useCallback, useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { PokemonCard } from '../../types/pokemon';
import { pokemonApi } from '../../services/pokemonApi';
import { formatCurrency, proxyImageUrl } from '../../utils/cardDisplay';

interface CardCarouselProps {
  onCardClick: (card: PokemonCard) => void;
}

export const CardCarousel: React.FC<CardCarouselProps> = ({ onCardClick }) => {
  const [cards, setCards] = useState<PokemonCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const results = await pokemonApi.searchCards('charizard', undefined, 10);
        if (!mounted) return;
        setCards(results.slice(0, 10));
      } catch {
        /* optional */
      }
      if (mounted) setLoading(false);
    };
    load();
    return () => { mounted = false; };
  }, []);

  const getPrice = useCallback((card: PokemonCard) => {
    return card.marketPrice ?? pokemonApi.extractCardPrice(card);
  }, []);

  const pricedCards = cards
    .map((card) => ({ card, price: getPrice(card) }))
    .filter((entry) => entry.price > 0);

  if (loading) {
    return (
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-52 w-36 shrink-0 rounded-xl" />
        ))}
      </div>
    );
  }

  if (pricedCards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <TrendingUp className="h-8 w-8" style={{ color: 'var(--ink-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Market data loading...</p>
      </div>
    );
  }

  const doubled = [...pricedCards, ...pricedCards];

  return (
    <div className="relative w-full overflow-hidden">
      <div className="animate-carousel-scroll flex gap-5" style={{ width: 'max-content' }}>
        {doubled.map(({ card, price }, index) => (
          <button
            key={`${card.id}-${index}`}
            type="button"
            onClick={() => onCardClick(card)}
            className="card-lift group relative w-36 shrink-0 overflow-hidden rounded-xl border text-left"
            style={{ borderColor: 'var(--border-default)', background: 'var(--gradient-surface)' }}
          >
            <div className="absolute inset-0 holo-sweep pointer-events-none" />
            <div className="absolute inset-0 holo-texture pointer-events-none" />
            <img
              src={proxyImageUrl(card.images.small)}
              alt={card.name}
              className="h-[7.5rem] w-full object-cover object-top"
              loading="lazy"
            />
            <div className="p-2.5">
              <p className="truncate text-xs font-medium" style={{ color: 'var(--ink-primary)' }}>
                {card.name}
              </p>
              <p className="font-mono text-sm tabular-nums" style={{ color: 'var(--gain)' }}>
                {formatCurrency(price)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
