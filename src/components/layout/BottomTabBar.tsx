import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Award,
  BookOpen,
  Camera,
  Heart,
  Home,
  Layers,
  LayoutGrid,
  LineChart,
  MoreHorizontal,
  Package,
  Swords,
  TrendingUp,
} from 'lucide-react';
import { useGame, GameType } from '../../contexts/GameContext';
import { cn } from '@/lib/utils';

const PRIMARY_TABS: { to: string; label: string; icon: React.ElementType; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/browse', label: 'Browse', icon: LayoutGrid },
];

const SECONDARY_TABS: { to: string; label: string; icon: React.ElementType }[] = [
  { to: '/vault', label: 'Vault', icon: BookOpen },
];

const MORE_ITEMS: { to: string; label: string; icon: React.ElementType }[] = [
  { to: '/sets', label: 'Sets', icon: Layers },
  { to: '/wishlist', label: 'Wishlist', icon: Heart },
  { to: '/packs', label: 'Packs', icon: Package },
  { to: '/grading', label: 'Grade', icon: Award },
  { to: '/prices', label: 'Prices', icon: LineChart },
  { to: '/market-insights', label: 'Insights', icon: TrendingUp },
  { to: '/binders', label: 'Binders', icon: BookOpen },
  { to: '/scanner', label: 'Scanner', icon: Camera },
];

const GAME_OPTIONS: { value: GameType; label: string; icon: React.ElementType }[] = [
  { value: 'pokemon', label: 'Pokemon', icon: LayoutGrid },
  { value: 'onepiece', label: 'One Piece', icon: Swords },
];

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative flex h-full min-w-[56px] cursor-pointer flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-wide transition-colors duration-200',
    isActive ? 'text-accent' : 'text-ink-muted hover:text-ink-secondary'
  );

const TabIndicator: React.FC<{ isActive: boolean }> = ({ isActive }) => (
  <span
    className={cn(
      'absolute top-0 h-0.5 w-6 rounded-full bg-accent shadow-glow-accent transition-opacity duration-200',
      isActive ? 'opacity-100' : 'opacity-0'
    )}
    aria-hidden="true"
  />
);

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
          className="fixed inset-0 z-50 bg-black/50 md:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}

      {moreOpen && (
        <div
          ref={sheetRef}
          role="menu"
          aria-label="More destinations"
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 animate-slide-up rounded-2xl border border-border-default bg-surface-overlay p-2 shadow-elevated md:hidden"
        >
          <div className="mb-2 flex rounded-xl border border-border-default bg-surface-inset p-0.5">
            {GAME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setGame(value)}
                className={cn(
                  'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-medium transition-colors',
                  game === value
                    ? 'bg-accent/15 text-accent'
                    : 'text-ink-muted hover:text-ink-secondary'
                )}
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
                cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
                )
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
        className="fixed inset-x-0 bottom-0 z-50 h-16 border-t border-border-subtle bg-surface-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
          {PRIMARY_TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={tabClass}>
              {({ isActive }) => (
                <>
                  <TabIndicator isActive={isActive} />
                  <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
                  {label}
                </>
              )}
            </NavLink>
          ))}

          <NavLink
            to="/scanner"
            aria-label="Scan a card"
            className={({ isActive }) =>
              cn(
                'relative -mt-2 flex cursor-pointer flex-col items-center justify-start gap-1 text-[10px] font-medium tracking-wide',
                isActive ? 'text-accent' : 'text-ink-muted'
              )
            }
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/50 bg-accent/15 text-accent transition-transform duration-200 active:scale-95">
              <Camera className="h-5 w-5" aria-hidden="true" />
            </span>
            Scan
          </NavLink>

          {SECONDARY_TABS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={tabClass}>
              {({ isActive }) => (
                <>
                  <TabIndicator isActive={isActive} />
                  <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
                  {label}
                </>
              )}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            className={cn(
              'relative flex h-full min-w-[56px] cursor-pointer flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-wide transition-colors duration-200',
              moreActive || moreOpen ? 'text-accent' : 'text-ink-muted hover:text-ink-secondary'
            )}
          >
            <TabIndicator isActive={moreActive || moreOpen} />
            <MoreHorizontal className="h-[22px] w-[22px]" aria-hidden="true" />
            More
          </button>
        </div>
      </nav>
    </>
  );
};
