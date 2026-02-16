import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LayoutGrid, List } from 'lucide-react';
import { CardTile, AnyCard } from './CardTile';
import { CardListRow } from './CardListRow';
import { getCardReactKey } from '../../../utils/cardPrice';

export type CardViewMode = 'grid' | 'list';

interface CardGridProps {
  cards: AnyCard[];
  viewMode?: CardViewMode;
  onCardClick: (card: AnyCard) => void;
  onAddToCollection?: (card: AnyCard) => void;
  onViewPriceHistory?: (card: AnyCard) => void;
}

const PAGE_SIZE = 60;
const AUTO_PAGES = 3;

/**
 * Hybrid pagination: the first 3 "pages" reveal automatically as you scroll
 * (IntersectionObserver sentinel), then an explicit Load more button takes
 * over so the footer stays reachable and scroll position stays predictable.
 */
function useIncrementalReveal(cards: AnyCard[]) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listKey = `${cards.length}:${cards[0]?.id ?? ''}`;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [listKey]);

  const autoLimit = PAGE_SIZE * AUTO_PAGES;
  const hasMore = visibleCount < cards.length;
  const autoMode = hasMore && visibleCount < autoLimit;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !autoMode) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, cards.length));
        }
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [autoMode, cards.length, listKey]);

  return {
    visibleCards: cards.slice(0, visibleCount),
    hasMore,
    autoMode,
    sentinelRef,
    loadMore: () => setVisibleCount((count) => Math.min(count + PAGE_SIZE, cards.length)),
    visibleCount: Math.min(visibleCount, cards.length),
  };
}

function RevealFooter({
  total,
  visibleCount,
  hasMore,
  autoMode,
  sentinelRef,
  loadMore,
}: {
  total: number;
  visibleCount: number;
  hasMore: boolean;
  autoMode: boolean;
  sentinelRef: React.RefObject<HTMLDivElement>;
  loadMore: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      {autoMode && <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />}
      <p className="text-center text-xs tabular-nums text-ink-muted" aria-live="polite">
        Showing {visibleCount} of {total} cards
      </p>
      {hasMore && !autoMode && (
        <button type="button" onClick={loadMore} className="btn-secondary">
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
          Load {Math.min(PAGE_SIZE, total - visibleCount)} more
        </button>
      )}
    </div>
  );
}

export const CardGrid: React.FC<CardGridProps> = ({
  cards,
  viewMode = 'grid',
  onCardClick,
  onAddToCollection,
  onViewPriceHistory,
}) => {
  const reveal = useIncrementalReveal(cards);

  if (viewMode === 'list') {
    return (
      <section className="stagger-children space-y-3">
        {reveal.visibleCards.map((card, index) => (
          <CardListRow
            key={getCardReactKey(card, index)}
            card={card}
            onClick={() => onCardClick(card)}
            onAddToCollection={onAddToCollection ? () => onAddToCollection(card) : undefined}
            onViewPriceHistory={onViewPriceHistory ? () => onViewPriceHistory(card) : undefined}
          />
        ))}
        <RevealFooter
          total={cards.length}
          visibleCount={reveal.visibleCount}
          hasMore={reveal.hasMore}
          autoMode={reveal.autoMode}
          sentinelRef={reveal.sentinelRef}
          loadMore={reveal.loadMore}
        />
      </section>
    );
  }

  return (
    <section className="animate-fade-in">
      <div className="stagger-children grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {reveal.visibleCards.map((card, index) => (
          <CardTile
            key={getCardReactKey(card, index)}
            card={card}
            onClick={() => onCardClick(card)}
            onAddToCollection={onAddToCollection ? () => onAddToCollection(card) : undefined}
            onViewPriceHistory={onViewPriceHistory ? () => onViewPriceHistory(card) : undefined}
          />
        ))}
      </div>
      <RevealFooter
        total={cards.length}
        visibleCount={reveal.visibleCount}
        hasMore={reveal.hasMore}
        autoMode={reveal.autoMode}
        sentinelRef={reveal.sentinelRef}
        loadMore={reveal.loadMore}
      />
    </section>
  );
};

interface ViewModeToggleProps {
  viewMode: CardViewMode;
  onChange: (mode: CardViewMode) => void;
}

export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ viewMode, onChange }) => (
  <div className="inline-flex rounded-lg border border-border-default bg-surface-inset p-0.5">
    <button
      type="button"
      onClick={() => onChange('grid')}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        viewMode === 'grid' ? 'bg-white/12 text-white' : 'text-ink-muted hover:text-ink-secondary'
      }`}
      aria-pressed={viewMode === 'grid'}
    >
      <LayoutGrid className="h-3.5 w-3.5" />
      Grid
    </button>
    <button
      type="button"
      onClick={() => onChange('list')}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        viewMode === 'list' ? 'bg-white/12 text-white' : 'text-ink-muted hover:text-ink-secondary'
      }`}
      aria-pressed={viewMode === 'list'}
    >
      <List className="h-3.5 w-3.5" />
      List
    </button>
  </div>
);
