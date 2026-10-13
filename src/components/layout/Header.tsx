import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Search, Sun } from 'lucide-react';
import { UserMenu } from './UserMenu';
import { openCommandPalette } from '../common/CommandPalette';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '@/lib/utils';
import { BrandMark } from './BrandMark';

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
        'sticky top-0 z-40 border-b transition-[background-color,border-color] duration-200 ease-out',
        scrolled
          ? 'border-border-subtle bg-surface-base/75 backdrop-blur-xl backdrop-saturate-150'
          : 'border-transparent bg-transparent'
      )}
    >
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 md:hidden"
          aria-label="TCGTracker home"
        >
          <BrandMark className="h-5 w-5 text-accent" />
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink-primary">
            TCGTracker
          </span>
        </Link>

        <div className="hidden flex-1 md:block" />

        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3 md:flex-none">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden h-9 w-64 cursor-pointer items-center gap-2 rounded-[10px] bg-surface-raised pl-3 pr-1.5 text-[13px] text-ink-muted shadow-[inset_0_0_0_1px_var(--border-default)] transition-[box-shadow,color] duration-150 ease-out hover:text-ink-secondary hover:shadow-[inset_0_0_0_1px_var(--border-strong)] lg:flex"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Search cards</span>
            <kbd className="rounded-md bg-surface-hover px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
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
