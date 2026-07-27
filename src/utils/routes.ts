import { AppView } from '../types/ui';

/** Canonical route for each legacy AppView. Single source of truth for navigation. */
export const VIEW_PATHS: Record<AppView, string> = {
  home: '/',
  cards: '/browse',
  tracking: '/prices',
  vault: '/vault',
  wishlist: '/wishlist',
  sets: '/sets',
  binders: '/binders',
  packs: '/packs',
  scanner: '/scanner',
  grading: '/grading',
  insights: '/market-insights',
};

export const browseSearchPath = (query: string) =>
  query ? `/browse?q=${encodeURIComponent(query)}` : '/browse';
