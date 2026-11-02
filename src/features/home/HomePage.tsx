import { Link } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { useVault } from '../../hooks/useVault';
import { useGame } from '../../contexts/GameContext';
import { CardLookup } from './CardLookup';
import { MarketMovers } from './MarketMovers';
import { CinematicCardHero } from './CinematicCardHero';
import { CollectionDashboard } from './CollectionDashboard';

export function HomePage() {
  const { cards } = useVault();
  return (
    <>
      <CinematicCardHero />
      <div className="mx-auto w-full max-w-[1520px] px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        {cards.length > 0 ? <CollectionDashboard /> : <VisitorHome />}
        <div className="mt-14">
          <MarketMovers />
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── New visitor ───────────────────────── */

function VisitorHome() {
  const { isOnePiece } = useGame();
  return (
    <section
      aria-labelledby="visitor-h"
      className="grid gap-10 border-b-2 border-rule-strong pb-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16"
    >
      <div>
        <h2
          id="visitor-h"
          className="font-display text-[clamp(1.6rem,3vw,2.4rem)] font-semibold tracking-[-0.02em]"
        >
          What is this card worth?
        </h2>
        <p className="mt-3 max-w-[52ch] text-[15px] text-ink-secondary">
          Look up any {isOnePiece ? 'One Piece' : 'Pokémon'} card to see its market price for each
          finish, where that number comes from, graded comparisons and whether grading would pay.
        </p>
        <div className="mt-6 max-w-[38rem]">
          <CardLookup />
        </div>
      </div>
      <aside aria-label="What you can do here" className="lg:pt-2">
        <ol className="space-y-0">
          {[
            [
              'Look up',
              'Market estimate per finish, with source and date, plus recent sales and listings kept apart.',
            ],
            [
              'Decide',
              'Raw against PSA, CGC and BGS prices, population, and a calculator that includes fees and shipping.',
            ],
            [
              'Collect',
              'Log what you own and what you paid. P/L counts only the holdings where the cost is known.',
            ],
            [
              'Act',
              'Wishlist targets, price alerts, trade comparisons, photo grading and scanning.',
            ],
          ].map(([k, v], i) => (
            <li
              key={k}
              className="grid grid-cols-[2rem_6rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-rule py-3"
            >
              <span className="font-mono text-[12px] text-ink-muted">0{i + 1}</span>
              <span className="text-[14px] font-semibold">{k}</span>
              <span className="text-[13.5px] text-ink-secondary">{v}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/browse" className="btn-secondary">
            Browse the catalog
          </Link>
          <Link to="/scanner" className="btn-ghost">
            <Camera className="h-4 w-4" /> Scan a card
          </Link>
        </div>
      </aside>
    </section>
  );
}
