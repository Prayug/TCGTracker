import { AppView } from '../types/ui';

/** Canonical route for each legacy AppView. Single source of truth for navigation. */
export const VIEW_PATHS: Record<AppView, string> = {
  home: '/',
  cards: '/browse',
  tracking: '/prices',
  vault: '/vault',
  sets: '/sets',
  packs: '/packs',
  scanner: '/scanner',
  insights: '/market-insights',
};

export const browseSearchPath = (query: string) =>
  query ? `/browse?q=${encodeURIComponent(query)}` : '/browse';
