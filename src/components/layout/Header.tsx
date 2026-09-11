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
          ? 'border-white/10 bg-felt/90 shadow-sm backdrop-blur-xl'
          : 'border-transparent bg-transparent'
      )}
    >
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center transition-opacity duration-200 md:hidden"
        >
          <span className="font-display text-lg font-extrabold tracking-tight text-felt-ink">
            TCG Tracker
          </span>
        </Link>

        <div className="hidden flex-1 md:block" />

        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3 md:flex-none">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden h-10 w-60 cursor-pointer items-center gap-2 border border-white/15 bg-black/20 px-4 text-sm text-felt-muted transition-all duration-200 hover:border-foil/40 hover:text-felt-secondary focus-visible:border-foil lg:flex"
            style={{ borderRadius: 'var(--radius-ui)' }}
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5 text-foil" />
            <span className="flex-1 text-left">Search cards…</span>
            <kbd
              className="border border-white/15 bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-felt-muted"
              style={{ borderRadius: '2px' }}
            >
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>

          <button
            type="button"
            onClick={openCommandPalette}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center text-felt-secondary transition-colors hover:bg-white/10 hover:text-felt-ink lg:hidden"
            style={{ borderRadius: 'var(--radius-ui)' }}
            aria-label="Search"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center text-felt-secondary transition-colors hover:bg-white/10 hover:text-felt-ink"
            style={{ borderRadius: 'var(--radius-ui)' }}
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
