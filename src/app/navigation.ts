import type { GameType } from '../contexts/GameContext';

/**
 * Information architecture for the Collector's Exchange shell.
 * Five job-based areas, each with contextual sections. Routes stay stable
 * (existing bookmarks keep working); the shell decides which area owns a path.
 */
export type AreaId = 'home' | 'discover' | 'collection' | 'market' | 'tools';

export interface NavSection {
  to: string;
  label: string;
  /** Extra path prefixes this section owns (e.g. /sets/:id). */
  match?: string[];
  /** Hide for a game where the feature does not apply. */
  games?: GameType[];
}

export interface NavArea {
  id: AreaId;
  label: string;
  to: string;
  /** One-line purpose, used for the accessible description and command palette. */
  summary: string;
  sections: NavSection[];
}

export const NAV_AREAS: NavArea[] = [
  {
    id: 'home',
    label: 'Home',
    to: '/',
    summary: 'Your collection at a glance and today’s market',
    sections: [],
  },
  {
    id: 'discover',
    label: 'Discover',
    to: '/browse',
    summary: 'Catalog, set explorer and deals',
    sections: [
      { to: '/browse', label: 'Catalog', match: ['/card/'] },
      { to: '/sets', label: 'Sets', match: ['/sets/'] },
      { to: '/deals', label: 'Deals' },
    ],
  },
  {
    id: 'collection',
    label: 'Collection',
    to: '/vault',
    summary: 'Vault, binders and wishlist',
    sections: [
      { to: '/vault', label: 'Vault' },
      { to: '/binders', label: 'Binders' },
      { to: '/wishlist', label: 'Wishlist' },
    ],
  },
  {
    id: 'market',
    label: 'Market',
    to: '/money-flow',
    summary: 'Market overview, slabs, insights and investments',
    sections: [
      { to: '/money-flow', label: 'Overview' },
      { to: '/prices', label: 'Slabs' },
      { to: '/market-insights', label: 'Insights' },
      { to: '/investments', label: 'Investments' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    to: '/trade',
    summary: 'Trade calculator, scanner, grading and packs',
    sections: [
      { to: '/trade', label: 'Trade', match: ['/trade/'] },
      { to: '/scanner', label: 'Scan' },
      { to: '/grading', label: 'Grade' },
      { to: '/packs', label: 'Pack shop', games: ['pokemon'] },
      { to: '/open', label: 'Boosters', games: ['onepiece'] },
    ],
  },
];

const ACCOUNT_PATHS = ['/settings', '/verify-email'];

function sectionOwns(section: NavSection, pathname: string): boolean {
  if (pathname === section.to) return true;
  return (section.match ?? []).some((prefix) => pathname.startsWith(prefix));
}

/** The area that owns a pathname, or null for account/utility pages. */
export function findArea(pathname: string): NavArea | null {
  if (pathname === '/') return NAV_AREAS[0];
  if (ACCOUNT_PATHS.some((p) => pathname.startsWith(p))) return null;
  for (const area of NAV_AREAS) {
    if (area.sections.some((s) => sectionOwns(s, pathname))) return area;
  }
  return null;
}

export function findSection(pathname: string): NavSection | null {
  for (const area of NAV_AREAS) {
    const hit = area.sections.find((s) => sectionOwns(s, pathname));
    if (hit) return hit;
  }
  return null;
}

export function sectionsForGame(area: NavArea, game: GameType): NavSection[] {
  return area.sections.filter((s) => !s.games || s.games.includes(game));
}

/**
 * Remember the last section visited in each area so the rail returns you
 * where you left off (Collection → Binders, not always Vault).
 */
const LAST_KEY = 'tcg.nav.last';

export function rememberSection(pathname: string, search: string) {
  const area = findArea(pathname);
  if (!area || area.id === 'home') return;
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[area.id] = pathname + search;
    sessionStorage.setItem(LAST_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable */
  }
}

export function areaEntry(area: NavArea): string {
  if (area.id === 'home') return '/';
  try {
    const raw = sessionStorage.getItem(LAST_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const last = map[area.id];
    if (last && findArea(last.split('?')[0])?.id === area.id) return last;
  } catch {
    /* storage unavailable */
  }
  return area.to;
}
