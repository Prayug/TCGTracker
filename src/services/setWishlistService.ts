const WISHLIST_STORAGE_KEY = 'tcg_set_wishlist';

export type SetWishlistMap = Record<string, string[]>;

class SetWishlistService {
  private load(): SetWishlistMap {
    try {
      const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SetWishlistMap) : {};
    } catch {
      return {};
    }
  }

  private save(map: SetWishlistMap): void {
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(map));
  }

  getWishlistForSet(setId: string): Set<string> {
    const map = this.load();
    return new Set(map[setId] || []);
  }

  isWishlisted(setId: string, cardId: string): boolean {
    return this.getWishlistForSet(setId).has(cardId);
  }

  toggleWishlist(setId: string, cardId: string): boolean {
    const map = this.load();
    const list = new Set(map[setId] || []);
    if (list.has(cardId)) {
      list.delete(cardId);
    } else {
      list.add(cardId);
    }
    map[setId] = [...list];
    this.save(map);
    return list.has(cardId);
  }

  removeFromWishlist(setId: string, cardId: string): void {
    const map = this.load();
    const list = (map[setId] || []).filter((id) => id !== cardId);
    if (list.length) map[setId] = list;
    else delete map[setId];
    this.save(map);
  }

  getPinnedSets(): string[] {
    try {
      const raw = localStorage.getItem('tcg_pinned_sets');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  togglePinnedSet(setId: string): boolean {
    const pinned = new Set(this.getPinnedSets());
    if (pinned.has(setId)) pinned.delete(setId);
    else pinned.add(setId);
    localStorage.setItem('tcg_pinned_sets', JSON.stringify([...pinned]));
    return pinned.has(setId);
  }

  isPinned(setId: string): boolean {
    return this.getPinnedSets().includes(setId);
  }
}

export const setWishlistService = new SetWishlistService();
