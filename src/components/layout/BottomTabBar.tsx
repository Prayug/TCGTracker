import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BookOpen,
  Camera,
  LayoutGrid,
  LineChart,
  MoreHorizontal,
  Swords,
  TrendingUp,
} from 'lucide-react';
import { useGame, GameType } from '../../contexts/GameContext';

const PRIMARY_TABS: { to: string; label: string; icon: React.ElementType; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: LayoutGrid, end: true },
  { to: '/browse', label: 'Browse', icon: LayoutGrid },
];

const SECONDARY_TABS: { to: string; label: string; icon: React.ElementType }[] = [
  { to: '/vault', label: 'Vault', icon: BookOpen },
];

const MORE_ITEMS: { to: string; label: string; icon: React.ElementType }[] = [
  { to: '/sets', label: 'Sets', icon: LayoutGrid },
  { to: '/packs', label: 'Packs', icon: LayoutGrid },
  { to: '/prices', label: 'Prices', icon: LineChart },
  { to: '/market-insights', label: 'Insights', icon: TrendingUp },
];

const GAME_OPTIONS: { value: GameType; label: string; icon: React.ElementType }[] = [
  { value: 'pokemon', label: 'Pokemon', icon: LayoutGrid },
  { value: 'onepiece', label: 'One Piece', icon: Swords },
];

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex h-full min-w-[56px] flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
    isActive ? 'text-accent' : 'text-ink-muted hover:text-ink-secondary'
  }`;

export const BottomTabBar: React.FC = () => {
  const [moreOpen, setMoreOpen] = useState(false);
  const { game, setGame } = useGame();
  const location = useLocation();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const moreActive = MORE_ITEMS.some((item) => location.pathname.startsWith(item.to));

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 md:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}

      {moreOpen && (
        <div
          ref={sheetRef}
          role="menu"
          aria-label="More destinations"
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 animate-slide-up rounded-lg border border-border-default bg-surface-overlay p-2 shadow-lg md:hidden"
        >
          {/* Game Switcher in More menu */}
          <div className="mb-2 flex rounded-lg border border-border-default bg-surface-inset p-0.5">
            {GAME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setGame(value)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                  game === value
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {MORE_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              role="menuitem"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-surface-hover text-ink-primary'
                    : 'text-ink-secondary hover:bg-surface-hover'
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      )}

      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-50 h-16 border-t border-border-subtle bg-surface-raised pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
          {PRIMARY_TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={tabClass}>
              <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
              {label}
            </NavLink>
          ))}

          <NavLink
            to="/scanner"
            aria-label="Scan a card"
            className={({ isActive }) =>
              `relative -mt-2 flex flex-col items-center justify-start gap-1 text-[10px] font-medium ${
                isActive ? 'text-accent' : 'text-ink-muted'
              }`
            }
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-white transition-transform active:scale-95">
              <Camera className="h-5 w-5" aria-hidden="true" />
            </span>
            Scan
          </NavLink>

          {SECONDARY_TABS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={tabClass}>
              <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
              {label}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            className={`flex h-full min-w-[56px] flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
              moreActive || moreOpen ? 'text-accent' : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            <MoreHorizontal className="h-[22px] w-[22px]" aria-hidden="true" />
            More
          </button>
        </div>
      </nav>
    </>
  );
};
