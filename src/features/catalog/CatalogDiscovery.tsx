import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PriceHistoryApi, type TopMoverEntry } from '../../services/priceHistoryApi';
import { moverKey, moverSubtitle, moverToCard } from '../../utils/topMovers';
import { useCardModal } from '../../contexts/CardModalContext';
import { CardArt } from '../../components/exchange/CardArt';
import { Delta, Price } from '../../components/exchange/Price';

const POPULAR = {
  pokemon: ['Charizard', 'Pikachu', 'Umbreon', 'Rayquaza', 'Gengar', 'Mew', 'Lugia'],
  onepiece: ['Luffy', 'Zoro', 'Nami', 'Shanks', 'Ace', 'Yamato'],
};

/**
 * What the catalog shows before a search: ways in (popular names, sets)
 * and the week's rising cards with their real 7-day change.
 */
export function CatalogDiscovery({
  isOnePiece,
  onSearch,
}: {
  isOnePiece: boolean;
  onSearch: (q: string) => void;
}) {
  const { openCard } = useCardModal();
  const [entries, setEntries] = useState<TopMoverEntry[] | null>(() => {
    const c = PriceHistoryApi.peekTopMovers(7, 50);
    return c ? c.gainers : null;
  });

  useEffect(() => {
    if (isOnePiece) return;
    let alive = true;
    PriceHistoryApi.getTopMovers(7, 50)
      .then((r) => alive && setEntries(r.gainers ?? []))
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, [isOnePiece]);

  const rising = useMemo(() => {
    const seen = new Set<string>();
    return (entries ?? [])
      .filter((e) => {
        const k = moverKey(e);
        if (seen.has(k)) return false;
        seen.add(k);
        return e.changePercent > 0 && e.currentPrice >= 2 && Boolean(e.imageSmall || e.imageLarge);
      })
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 12);
  }, [entries]);

  return (
    <div className="space-y-10">
      <section aria-labelledby="start-h" className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 id="start-h" className="text-h2">
            Start with a name
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {POPULAR[isOnePiece ? 'onepiece' : 'pokemon'].map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onSearch(name)}
                className="h-8 rounded-full border border-border-strong px-3 text-[13px] text-ink-secondary hover:border-ink-muted hover:text-ink-primary"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="md:border-l md:border-rule md:pl-6">
          <h2 className="text-h2">Or work through a set</h2>
          <p className="mt-1 max-w-[52ch] text-[13.5px] text-ink-secondary">
            Every set with its full checklist, what you own, and what is missing.
          </p>
          <Link to="/sets" className="btn-secondary mt-3 inline-flex">
            Browse sets
          </Link>
        </div>
      </section>

      {!isOnePiece ? (
        <section aria-labelledby="rising-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule-strong pb-2">
            <h2 id="rising-h" className="text-h2">
              Rising this week
            </h2>
            <p className="text-meta text-ink-muted">
              7-day change in TCGplayer market price · cards over $2
            </p>
          </div>
          {entries == null ? (
            <div className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[63/88] rounded-md" />
              ))}
            </div>
          ) : rising.length === 0 ? (
            <p className="mt-3 text-meta text-ink-muted">
              No movement data is available right now. Search above to browse the catalog.
            </p>
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:gap-x-6 lg:grid-cols-4 xl:grid-cols-6">
              {rising.map((e) => {
                const card = moverToCard(e);
                return (
                  <li key={moverKey(e)} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => openCard(card)}
                      className="group block w-full text-left"
                    >
                      <CardArt
                        card={card}
                        className="transition-transform duration-150 motion-safe:group-hover:-translate-y-1"
                      />
                      <span className="mt-2.5 block truncate text-[13.5px] font-medium group-hover:underline">
                        {e.productName}
                      </span>
                      <span className="block truncate text-meta text-ink-muted">
                        {moverSubtitle(e)}
                      </span>
                      <span className="mt-1 flex items-baseline gap-2">
                        <Price value={e.currentPrice} size="sm" />
                        <Delta pct={e.changePercent} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
