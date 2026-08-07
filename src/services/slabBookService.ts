/**
 * Local owned-slab book (distinct from raw vault).
 * Tracks graded lots with cost basis; marks to PriceCharting via /slab-marks.
 */

export type SlabGrader = 'PSA' | 'CGC' | 'BGS' | 'SGC' | 'TAG' | 'ACE';

export interface SlabLot {
  id: string;
  cardId: string;
  cardName: string;
  setId?: string;
  setName?: string;
  imageSmall?: string;
  grader: SlabGrader;
  grade: string;
  certNumber?: string;
  purchasePrice: number;
  purchaseDate: string;
  quantity: number;
  notes?: string;
  createdAt: string;
}

const STORAGE_KEY = 'tcg_slab_book_pokemon';

function load(): SlabLot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SlabLot[]) : [];
  } catch {
    return [];
  }
}

function save(lots: SlabLot[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lots));
}

function uid(): string {
  return `slab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

class SlabBookService {
  getLots(): SlabLot[] {
    return load();
  }

  addLot(input: Omit<SlabLot, 'id' | 'createdAt' | 'quantity'> & { quantity?: number }): SlabLot {
    const lots = load();
    const lot: SlabLot = {
      ...input,
      id: uid(),
      quantity: Math.max(1, input.quantity ?? 1),
      createdAt: new Date().toISOString(),
    };
    lots.unshift(lot);
    save(lots);
    return lot;
  }

  removeLot(id: string): void {
    save(load().filter((l) => l.id !== id));
  }

  updateLot(id: string, patch: Partial<SlabLot>): SlabLot | null {
    const lots = load();
    const idx = lots.findIndex((l) => l.id === id);
    if (idx < 0) return null;
    lots[idx] = { ...lots[idx], ...patch, id: lots[idx].id };
    save(lots);
    return lots[idx];
  }

  clear(): void {
    save([]);
  }
}

export const slabBookService = new SlabBookService();
