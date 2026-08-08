import axios from 'axios';
import { buildApiUrl } from '../config/env';
import { authService } from './authService';
import '../config/apiClient';

export type WatchlistKind = 'watchlist' | 'wishlist' | 'tracked';

export interface WatchlistSyncItem {
  id: string;
  cardId: string;
  cardName: string;
  game?: string;
  listType: WatchlistKind;
  priority?: string;
  targetPrice?: number;
  notes?: string;
  card?: unknown;
  addedAt?: string;
  initialPrice?: number;
}

export async function pushWatchlistsToRemote(items: WatchlistSyncItem[]): Promise<number> {
  if (!authService.getUser()) return 0;
  const response = await axios.post<{ success: boolean; data: { synced: number } }>(
    buildApiUrl('/api/watchlists/sync'),
    { items }
  );
  return response.data?.data?.synced ?? items.length;
}

export async function fetchRemoteWatchlists(
  listType?: WatchlistKind
): Promise<WatchlistSyncItem[]> {
  if (!authService.getUser()) return [];
  const params = listType ? `?listType=${listType}` : '';
  const response = await axios.get<{
    success: boolean;
    data: {
      items: Array<{
        client_id: string | null;
        card_id: string;
        card_name: string;
        game: string;
        list_type: WatchlistKind;
        priority: string | null;
        target_price: number | null;
        notes: string | null;
        card_data: string | null;
      }>;
    };
  }>(buildApiUrl(`/api/watchlists${params}`));

  return (response.data?.data?.items ?? []).map((row) => {
    if (row.card_data) {
      try {
        return JSON.parse(row.card_data) as WatchlistSyncItem;
      } catch {
        /* fall through */
      }
    }
    return {
      id: row.client_id || row.card_id,
      cardId: row.card_id,
      cardName: row.card_name,
      game: row.game,
      listType: row.list_type,
      priority: row.priority ?? undefined,
      targetPrice: row.target_price ?? undefined,
      notes: row.notes ?? undefined,
    };
  });
}

/**
 * Push local list items to the server. Replace is scoped to the list_types
 * present in `items` (empty array for a type still needs an explicit wipe —
 * pass a sentinel via syncListTypeWipe).
 */
export async function syncLocalListsToServer(items: WatchlistSyncItem[]): Promise<void> {
  if (!authService.getUser()) return;
  if (items.length === 0) return;
  try {
    await pushWatchlistsToRemote(items);
  } catch (error) {
    console.warn('Watchlist sync failed:', error);
  }
}

/** Clear a single list type on the server (e.g. after untracking the last card). */
export async function syncListTypeWipe(listType: WatchlistKind, game = 'pokemon'): Promise<void> {
  if (!authService.getUser()) return;
  try {
    // Server scopes delete to list types in the payload; send a no-op marker
    // then rely on empty-after-delete: push a temp then... better: POST sync
    // with empty items isn't enough. Use DELETE via a dedicated wipe by syncing
    // zero items of that type with a typed empty body extension.
    await axios.post(buildApiUrl('/api/watchlists/sync'), {
      items: [],
      wipeListTypes: [listType],
      game,
    });
  } catch (error) {
    console.warn('Watchlist wipe failed:', error);
  }
}

/**
 * Remote-wins like vault: if the server has any tracked/wishlist items, hydrate
 * local storage from remote; otherwise push local lists up.
 */
export async function syncWatchlistsOnLogin(): Promise<void> {
  const user = authService.getUser();
  if (!user) return;

  try {
    const remote = await fetchRemoteWatchlists();
    const remoteTracked = remote.filter((i) => i.listType === 'tracked');
    const remoteWishlist = remote.filter((i) => i.listType === 'wishlist');

    if (remote.length > 0) {
      const { priceTrackingService } = await import('./priceTrackingService');
      const { cardWishlistService } = await import('./cardWishlistService');
      priceTrackingService.replaceTrackedFromRemote(remoteTracked);
      cardWishlistService.replaceWishlistFromRemote(remoteWishlist);
      return;
    }

    const { priceTrackingService } = await import('./priceTrackingService');
    const { cardWishlistService } = await import('./cardWishlistService');
    await priceTrackingService.syncTrackedToServer();
    await cardWishlistService.syncWishlistToServer();
  } catch (error) {
    console.warn('Watchlist sync failed — using local data:', error);
  }
}
