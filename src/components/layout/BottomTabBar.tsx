import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ArrowLeftRight,
  Award,
  BookOpen,
  Boxes,
  Camera,
  Heart,
  Home,
  Layers,
  LayoutGrid,
  LineChart,
  MoreHorizontal,
  Package,
  Percent,
  Settings,
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
  { to: '/open', label: 'Open Packs', icon: Boxes },
  { to: '/sets', label: 'Sets', icon: Layers },
  { to: '/wishlist', label: 'Wishlist', icon: Heart },
  { to: '/trade', label: 'Trade', icon: ArrowLeftRight },
  { to: '/packs', label: 'Packs', icon: Package },
  { to: '/grading', label: 'Grade', icon: Award },
  { to: '/prices', label: 'Slabs', icon: Layers },
  { to: '/market-insights', label: 'Insights', icon: TrendingUp },
  { to: '/investments', label: 'Investments', icon: LineChart },
  { to: '/deals', label: 'Deals', icon: Percent },
  { to: '/binders', label: 'Binders', icon: BookOpen },
  { to: '/scanner', label: 'Scanner', icon: Camera },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const GAME_OPTIONS: { value: GameType; label: string; icon: React.ElementType }[] = [
  { value: 'pokemon', label: 'Pokemon', icon: LayoutGrid },
  { value: 'onepiece', label: 'One Piece', icon: Swords },
];

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative flex h-full min-w-[56px] cursor-pointer flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-wide transition-colors duration-200',
    isActive ? 'text-sticker' : 'text-felt-muted hover:text-felt-secondary'
  );

const TabIndicator: React.FC<{ isActive: boolean }> = ({ isActive }) => (
  <span
    className={cn(
      'absolute top-0 h-0.5 w-6 bg-sticker transition-opacity duration-200',
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
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 animate-slide-up border border-border-page bg-page p-2 shadow-elevated md:hidden"
          style={{ borderRadius: 'var(--radius-ui)' }}
        >
          <div
            className="mb-2 flex border border-border-page bg-sleeve p-0.5"
            style={{ borderRadius: 'var(--radius-ui)' }}
          >
            {GAME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setGame(value)}
                className={cn(
                  'flex flex-1 cursor-pointer items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium transition-colors',
                  game === value
                    ? 'bg-foil/15 text-ink-primary'
                    : 'text-ink-muted hover:text-ink-secondary'
                )}
                style={{ borderRadius: 'var(--radius-ui)' }}
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
                  'flex cursor-pointer items-center gap-3 px-4 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sticker/10 text-sticker'
                    : 'text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
                )
              }
              style={{ borderRadius: 'var(--radius-ui)' }}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      )}

      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-50 h-16 border-t border-white/10 bg-chrome/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
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
                isActive ? 'text-sticker' : 'text-felt-muted'
              )
            }
          >
            <span
              className="flex h-11 w-11 items-center justify-center border border-sticker/45 bg-sticker/15 text-sticker transition-transform duration-200 active:scale-95"
              style={{ borderRadius: 'var(--radius-ui)' }}
            >
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
              moreActive || moreOpen ? 'text-sticker' : 'text-felt-muted hover:text-felt-secondary'
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
