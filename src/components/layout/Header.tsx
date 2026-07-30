import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Search, Sun } from 'lucide-react';
import { UserMenu } from './UserMenu';
import { openCommandPalette } from '../common/CommandPalette';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '@/lib/utils';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-all duration-300',
        scrolled
          ? 'border-border-subtle bg-surface-base/70 shadow-sm backdrop-blur-2xl'
          : 'border-transparent bg-transparent'
      )}
    >
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 transition-opacity duration-200 md:hidden"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-accent/35 bg-accent/15 text-accent">
            <span className="font-display text-sm font-bold tracking-tight">T</span>
          </div>
          <span className="font-display text-base font-semibold tracking-tight text-ink-primary">
            TCGTracker
          </span>
        </Link>

        <div className="hidden flex-1 md:block" />

        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3 md:flex-none">
          <button
            type="button"
            onClick={openCommandPalette}
            className="glass hidden h-10 w-72 cursor-pointer items-center gap-2 rounded-full border border-border-default px-4 text-sm text-ink-muted transition-all duration-200 hover:border-foil/40 hover:text-ink-secondary focus-visible:border-accent lg:flex"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5 text-foil" />
            <span className="flex-1 text-left">Search cards…</span>
            <kbd className="rounded-md border border-border-subtle bg-surface-raised/80 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
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

          <button
            type="button"
            onClick={toggleTheme}
            className="btn-icon"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span key={theme} className="flex">
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </span>
          </button>

          <UserMenu />
        </div>
      </div>
    </header>
  );
};
