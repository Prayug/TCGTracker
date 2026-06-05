import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Camera,
  Clock,
  CornerDownLeft,
  LayoutGrid,
  Layers,
  LineChart,
  Loader2,
  Package,
  Search,
} from 'lucide-react';
import { pokemonApi } from '../../services/pokemonApi';
import { PokemonCard } from '../../types/pokemon';
import { useCardModal } from '../../contexts/CardModalContext';
import { browseSearchPath } from '../../utils/routes';

const OPEN_EVENT = 'tcg:open-command-palette';

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

interface NavCommand {
  label: string;
  to: string;
  keywords: string;
  icon: React.ElementType;
  shortcut?: string;
}

const NAV_COMMANDS: NavCommand[] = [
  { label: 'Home', to: '/', keywords: 'home start dashboard', icon: LayoutGrid, shortcut: 'G H' },
  { label: 'Browse cards', to: '/browse', keywords: 'browse cards marketplace', icon: LayoutGrid, shortcut: 'G B' },
  { label: 'Price tracker', to: '/prices', keywords: 'prices tracking watchlist alerts', icon: LineChart, shortcut: 'G P' },
  { label: 'My vault', to: '/vault', keywords: 'vault collection portfolio', icon: BookOpen, shortcut: 'G V' },
  { label: 'Sets', to: '/sets', keywords: 'sets eras binder completion', icon: Layers, shortcut: 'G S' },
  { label: 'Open packs', to: '/packs', keywords: 'packs booster rip simulator', icon: Package },
  { label: 'Scan a card', to: '/scanner', keywords: 'scanner camera identify photo', icon: Camera },
];

const GO_TARGETS: Record<string, string> = {
  h: '/',
  b: '/browse',
  p: '/prices',
  v: '/vault',
  s: '/sets',
};

const SHORTCUTS_HELP: { keys: string; action: string }[] = [
  { keys: '⌘K / Ctrl+K', action: 'Open command palette' },
  { keys: '/', action: 'Open palette (search)' },
  { keys: 'G then B / P / V / S / H', action: 'Go to Browse / Prices / Vault / Sets / Home' },
  { keys: '↑ ↓', action: 'Move selection' },
  { keys: 'Enter', action: 'Open selection' },
  { keys: 'Esc', action: 'Close palette or modal' },
  { keys: '?', action: 'Show this cheat sheet' },
];

const RECENT_KEY = 'tcg.recentSearches';

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function pushRecentSearch(query: string) {
  const next = [query, ...getRecentSearches().filter((q) => q !== query)].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function isTypingContext(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  shortcut?: string;
  run: () => void;
}

export const CommandPalette: React.FC = () => {
  const navigate = useNavigate();
  const { openCard } = useCardModal();
  const [open, setOpen] = useState(false);
  const [helpMode, setHelpMode] = useState(false);
  const [query, setQuery] = useState('');
  const [cardResults, setCardResults] = useState<PokemonCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const goPending = useRef<number | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setHelpMode(false);
    setQuery('');
    setCardResults([]);
    setActiveIndex(0);
    previousFocus.current?.focus?.();
  }, []);

  const show = useCallback((help = false) => {
    previousFocus.current = document.activeElement as HTMLElement;
    setHelpMode(help);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => {
          if (v) close();
          else show();
          return !v;
        });
        return;
      }

      if (open || isTypingContext(e.target)) return;

      if (e.key === '/') {
        e.preventDefault();
        show();
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        show(true);
        return;
      }
      if (goPending.current !== null) {
        const target = GO_TARGETS[e.key.toLowerCase()];
        window.clearTimeout(goPending.current);
        goPending.current = null;
        if (target) {
          e.preventDefault();
          navigate(target);
        }
        return;
      }
      if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        goPending.current = window.setTimeout(() => {
          goPending.current = null;
        }, 1200);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close, show, navigate]);

  useEffect(() => {
    const onOpen = () => show();
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [show]);

  useEffect(() => {
    if (open && !helpMode) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(id);
    }
  }, [open, helpMode]);

  useEffect(() => {
    if (!open || query.trim().length < 3) {
      setCardResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = window.setTimeout(async () => {
      try {
        const results = await pokemonApi.searchCards(query.trim(), undefined, 8);
        setCardResults(results.slice(0, 6));
      } catch {
        setCardResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [query, open]);

  const items: PaletteItem[] = useMemo(() => {
    const trimmed = query.trim();
    const lower = trimmed.toLowerCase();

    const navItems: PaletteItem[] = NAV_COMMANDS.filter(
      (cmd) => !lower || cmd.label.toLowerCase().includes(lower) || cmd.keywords.includes(lower)
    ).map((cmd) => ({
      id: `nav-${cmd.to}`,
      label: cmd.label,
      icon: <cmd.icon className="h-4 w-4 text-ink-muted" aria-hidden="true" />,
      shortcut: cmd.shortcut,
      run: () => {
        navigate(cmd.to);
        close();
      },
    }));

    if (!trimmed) {
      const recents: PaletteItem[] = getRecentSearches().map((q) => ({
        id: `recent-${q}`,
        label: q,
        sublabel: 'Recent search',
        icon: <Clock className="h-4 w-4 text-ink-muted" aria-hidden="true" />,
        run: () => {
          navigate(browseSearchPath(q));
          close();
        },
      }));
      return [...recents, ...navItems];
    }

    const searchRow: PaletteItem = {
      id: 'search-browse',
      label: `Search Browse for "${trimmed}"`,
      icon: <Search className="h-4 w-4 text-accent" aria-hidden="true" />,
      run: () => {
        pushRecentSearch(trimmed);
        navigate(browseSearchPath(trimmed));
        close();
      },
    };

    const cardItems: PaletteItem[] = cardResults.map((card) => {
      const price = card.marketPrice ?? pokemonApi.extractCardPrice(card);
      return {
        id: `card-${card.id}`,
        label: card.name,
        sublabel: `${card.set.name}${card.rarity ? ` · ${card.rarity}` : ''}${
          price > 0 ? ` · $${price.toFixed(2)}` : ''
        }`,
        icon: card.images?.small ? (
          <img src={card.images.small} alt="" className="h-8 w-6 rounded-sm object-cover" />
        ) : (
          <LayoutGrid className="h-4 w-4 text-ink-muted" aria-hidden="true" />
        ),
        run: () => {
          pushRecentSearch(trimmed);
          openCard(card);
          close();
        },
      };
    });

    return [searchRow, ...cardItems, ...navItems];
  }, [query, cardResults, navigate, close, openCard]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, cardResults.length]);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[activeIndex]?.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onClick={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={helpMode ? 'Keyboard shortcuts' : 'Command palette'}
        className="w-full max-w-xl animate-scale-in overflow-hidden rounded-lg border border-border-default bg-surface-overlay shadow-popover"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            close();
          }
        }}
      >
        {helpMode ? (
          <div className="p-5">
            <h2 className="text-sm font-semibold text-ink-primary">Keyboard shortcuts</h2>
            <ul className="mt-4 space-y-2.5">
              {SHORTCUTS_HELP.map(({ keys, action }) => (
                <li key={keys} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-ink-secondary">{action}</span>
                  <kbd className="rounded border border-border-subtle bg-surface-inset px-2 py-1 font-mono text-xs font-medium text-ink-muted">
                    {keys}
                  </kbd>
                </li>
              ))}
            </ul>
            <button type="button" onClick={close} className="btn-secondary mt-5 w-full justify-center">
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4 text-ink-muted" aria-hidden="true" />
              )}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search cards, or jump to a view…"
                className="flex-1 bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-palette-results"
                aria-activedescendant={items[activeIndex]?.id}
              />
              <kbd className="rounded border border-border-subtle bg-surface-inset px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-muted">
                ESC
              </kbd>
            </div>

            <ul
              id="command-palette-results"
              role="listbox"
              className="custom-scrollbar max-h-[50vh] overflow-y-auto p-2"
            >
              {items.length === 0 && (
                <li className="px-3 py-8 text-center text-sm text-ink-muted">
                  {searching ? 'Searching…' : 'No matches. Try a card name or view.'}
                </li>
              )}
              {items.map((item, index) => (
                <li key={item.id} id={item.id} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    onClick={item.run}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                      index === activeIndex
                        ? 'bg-surface-hover text-ink-primary'
                        : 'text-ink-secondary'
                    }`}
                  >
                    <span className="flex w-7 shrink-0 justify-center">{item.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.label}</span>
                      {item.sublabel && (
                        <span className="block truncate text-xs text-ink-muted">{item.sublabel}</span>
                      )}
                    </span>
                    {item.shortcut && (
                      <kbd className="rounded border border-border-subtle bg-surface-inset px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-muted">
                        {item.shortcut}
                      </kbd>
                    )}
                    {index === activeIndex && (
                      <CornerDownLeft className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>

            <div className="border-t border-border-subtle px-4 py-2 text-[11px] text-ink-muted">
              <span className="font-medium text-ink-secondary">↑↓</span> navigate ·{' '}
              <span className="font-medium text-ink-secondary">Enter</span> open ·{' '}
              <span className="font-medium text-ink-secondary">?</span> shortcuts
            </div>
          </>
        )}
      </div>
    </div>
  );
};
