import React from 'react';
import { Link } from 'react-router-dom';
import { Moon, Search, Sun } from 'lucide-react';
import { UserMenu } from './UserMenu';
import { openCommandPalette } from '../common/CommandPalette';
import { useTheme } from '../../hooks/useTheme';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface-base">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2 md:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border-default bg-accent-muted">
            <span className="font-mono text-sm font-semibold text-accent">T</span>
          </div>
          <span className="text-sm font-semibold text-ink-primary">TCGTracker</span>
        </Link>

        <div className="hidden flex-1 md:block" />

        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3 md:flex-none">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden h-9 w-56 items-center gap-2 rounded-md border border-border-default bg-surface-inset px-3 text-sm text-ink-muted transition-colors hover:border-border-strong hover:text-ink-secondary lg:flex"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Search cards…</span>
            <kbd className="rounded border border-border-subtle bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-muted">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>

          <button
            type="button"
            onClick={openCommandPalette}
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary lg:hidden"
            aria-label="Search"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <UserMenu />
        </div>
      </div>
    </header>
  );
};
