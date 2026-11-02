import { Link, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Moon, Search, Settings, Sun } from 'lucide-react';
import {
  NAV_AREAS,
  areaEntry,
  findArea,
  findSection,
  sectionsForGame,
  type NavArea,
} from '../../app/navigation';
import { AREA_ICONS } from './icons';
import { BrandMark, Wordmark } from '../layout/BrandMark';
import { GameSwitch } from './GameSwitch';
import { AlertsButton } from './AlertsButton';
import { UserMenu } from '../layout/UserMenu';
import { openCommandPalette } from '../common/CommandPalette';
import { useTheme } from '../../hooks/useTheme';
import { useGame } from '../../contexts/GameContext';
import { cn } from '@/lib/utils';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Desktop rail: brand, five labelled areas, and utility controls at the foot.
 * Active state = filled tile + bold label + a 2px ink bar, so it does not
 * depend on the accent colour.
 */
export function AppRail() {
  const { pathname } = useLocation();
  const active = findArea(pathname);
  const { theme, toggleTheme } = useTheme();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-[var(--rail-w)] flex-col border-r border-border-default bg-surface-chrome md:flex"
      aria-label="Primary"
    >
      <Link
        to="/"
        className="flex h-[var(--header-h)] items-center justify-center"
        aria-label="TCGTracker home"
      >
        <BrandMark className="h-7 w-7 text-ink-primary" />
      </Link>

      <nav className="mt-2 flex flex-1 flex-col items-stretch gap-1 px-2">
        {NAV_AREAS.map((area) => {
          const Icon = AREA_ICONS[area.id];
          const isActive = active?.id === area.id;
          return (
            <Link
              key={area.id}
              to={areaEntry(area)}
              aria-current={isActive ? 'page' : undefined}
              title={area.summary}
              className={cn(
                'group relative flex flex-col items-center gap-1 rounded-md py-2 text-[11px] transition-colors duration-100',
                isActive
                  ? 'bg-surface-raised font-semibold text-ink-primary shadow-[0_0_0_1px_var(--border-default)]'
                  : 'font-medium text-ink-secondary hover:bg-surface-hover hover:text-ink-primary'
              )}
            >
              {isActive ? (
                <motion.span
                  layoutId="nav-rail-mark"
                  aria-hidden
                  className="absolute -left-2 bottom-2 top-2 w-[3px] rounded-r bg-accent"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              ) : null}
              <span className={cn('transition-colors', isActive && 'text-accent')}>
                <Icon size={22} strokeWidth={isActive ? 1.75 : 1.5} />
              </span>
              <span>{area.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-1 border-t border-border-subtle py-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="btn-icon"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        >
          {theme === 'dark' ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn('btn-icon', isActive && 'bg-surface-hover text-ink-primary')
          }
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="h-[18px] w-[18px]" />
        </NavLink>
      </div>
    </aside>
  );
}

function SectionTabs({ area, className }: { area: NavArea; className?: string }) {
  const { pathname } = useLocation();
  const { game } = useGame();
  const current = findSection(pathname);
  const sections = sectionsForGame(area, game);
  if (sections.length === 0) return null;
  return (
    <nav aria-label={`${area.label} sections`} className={className}>
      <ul className="flex items-stretch gap-1">
        {sections.map((section) => {
          const isActive = current?.to === section.to;
          return (
            <li key={section.to} className="flex">
              <Link
                to={section.to}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex items-center whitespace-nowrap px-2.5 text-[13.5px] transition-colors',
                  isActive
                    ? 'font-semibold text-ink-primary'
                    : 'text-ink-secondary hover:text-ink-primary'
                )}
              >
                {section.label}
                {isActive ? (
                  <motion.span
                    layoutId="nav-tab-mark"
                    aria-hidden
                    className="absolute inset-x-2.5 bottom-0 h-[2px] rounded-t bg-accent"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Global header. Left: the area's identity and its sections. Right: search
 * (a real command palette trigger), game, alerts, account.
 */
export function AppHeader() {
  const { pathname } = useLocation();
  const area = findArea(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-border-default bg-surface-base/95 backdrop-blur supports-[backdrop-filter]:bg-surface-base/85">
      <div className="flex h-[var(--header-h)] items-stretch gap-3 px-4 sm:px-6">
        {/* Mobile identity */}
        <Link to="/" className="flex items-center gap-2 md:hidden" aria-label="TCGTracker home">
          <BrandMark className="h-6 w-6 text-ink-primary" />
          {area && area.id !== 'home' ? (
            <span className="font-display text-[19px] font-medium">{area.label}</span>
          ) : (
            <Wordmark className="hidden min-[400px]:inline" />
          )}
        </Link>

        {/* Desktop identity + sections */}
        <div className="hidden min-w-0 items-stretch gap-5 md:flex">
          <p className="flex items-center font-display text-[20px] font-medium tracking-[-0.01em]">
            {area ? area.label : pathname.startsWith('/settings') ? 'Settings' : 'TCGTracker'}
          </p>
          {area ? <SectionTabs area={area} className="flex items-stretch" /> : null}
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden h-9 w-[clamp(14rem,24vw,22rem)] cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface-raised pl-3 pr-1.5 text-[13.5px] text-ink-muted transition-colors hover:border-ink-muted lg:flex"
            aria-label="Search cards, sets and pages"
            aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
          >
            <Search className="h-4 w-4" />
            <span className="min-w-0 flex-1 truncate text-left">Search cards, sets, pages</span>
            <kbd className="rounded border border-border-default bg-surface-inset px-1.5 py-0.5 font-mono text-[11px] text-ink-secondary">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
          <button
            type="button"
            onClick={openCommandPalette}
            className="btn-icon lg:hidden"
            aria-label="Search"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
          <GameSwitch className="hidden sm:inline-flex" />
          <GameSwitch compact className="sm:hidden" />
          <AlertsButton />
          <UserMenu />
        </div>
      </div>

      {/* Mobile section tabs */}
      {area && area.sections.length > 0 ? (
        <SectionTabs
          area={area}
          className="scrollbar-none flex h-10 items-stretch overflow-x-auto border-t border-border-subtle px-2 md:hidden"
        />
      ) : null}
    </header>
  );
}

/** Mobile bottom navigation: the five areas, 56px targets, labelled. */
export function MobileNav() {
  const { pathname } = useLocation();
  const active = findArea(pathname);
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-surface-chrome pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV_AREAS.map((area) => {
          const Icon = AREA_ICONS[area.id];
          const isActive = active?.id === area.id;
          return (
            <li key={area.id}>
              <Link
                to={areaEntry(area)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10.5px]',
                  isActive ? 'font-semibold text-ink-primary' : 'text-ink-muted'
                )}
              >
                {isActive ? (
                  <motion.span
                    layoutId="nav-bottom-mark"
                    aria-hidden
                    className="absolute inset-x-5 top-0 h-[2px] rounded-b bg-accent"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                ) : null}
                <span className={cn(isActive && 'text-accent')}>
                  <Icon size={22} strokeWidth={isActive ? 1.8 : 1.5} />
                </span>
                {area.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
