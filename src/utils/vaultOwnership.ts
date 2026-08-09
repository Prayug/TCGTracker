import { PokemonCard, VaultCard } from '../types/pokemon';
import { vaultService } from '../services/vaultService';

/** Normalize card numbers like "112/086", "TG08", "028" → comparable keys. */
export function normalizeCardNumber(raw?: string | null): string {
  if (!raw) return '';
  const left = String(raw).trim().split('/')[0].trim();
  if (!left) return '';
  const m = left.match(/^([A-Za-z]*)(\d+)([A-Za-z]*)$/);
  if (!m) return left.toLowerCase();
  const prefix = m[1].toUpperCase();
  const digits = String(parseInt(m[2], 10));
  const suffix = m[3].toLowerCase();
  return `${prefix}${digits}${suffix}`.toLowerCase();
}

export function normalizeName(raw?: string | null): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type VaultOwnershipIndex = {
  ids: Set<string>;
  /** `${setId}::${normalizedNumber}` */
  bySetNumber: Set<string>;
  /** `${normalizedSetName}::${normalizedNumber}` */
  bySetNameNumber: Set<string>;
  entries: VaultCard[];
};

export function buildVaultOwnershipIndex(game: 'pokemon' | 'onepiece' = 'pokemon'): VaultOwnershipIndex {
  const entries = vaultService.getVaultCards(game);
  const ids = new Set<string>();
  const bySetNumber = new Set<string>();
  const bySetNameNumber = new Set<string>();

  for (const entry of entries) {
    const card = entry.card;
    if (!card) continue;
    if (card.id) ids.add(card.id);
    const num = normalizeCardNumber(card.number);
    if (!num) continue;
    if (card.set?.id) bySetNumber.add(`${card.set.id.toLowerCase()}::${num}`);
    if (card.set?.name) bySetNameNumber.add(`${normalizeName(card.set.name)}::${num}`);
  }

  return { ids, bySetNumber, bySetNameNumber, entries };
}

export function isCardOwned(
  card: Pick<PokemonCard, 'id' | 'number' | 'name' | 'set'>,
  index: VaultOwnershipIndex
): boolean {
  if (card.id && index.ids.has(card.id)) return true;
  const num = normalizeCardNumber(card.number);
  if (!num) return false;
  if (card.set?.id && index.bySetNumber.has(`${card.set.id.toLowerCase()}::${num}`)) return true;
  if (card.set?.name && index.bySetNameNumber.has(`${normalizeName(card.set.name)}::${num}`)) {
    return true;
  }
  return false;
}

/**
 * Rewrite vault holdings for a set to use catalog card IDs / images when we can
 * confidently match by number (or name+number). Persists if anything changed.
 */
export function relinkVaultCardsToSetCatalog(
  catalogCards: PokemonCard[],
  setId: string,
  setName: string,
  game: 'pokemon' | 'onepiece' = 'pokemon'
): number {
  const vault = vaultService.getVaultCards(game);
  if (!vault.length || !catalogCards.length) return 0;

  const byNumber = new Map<string, PokemonCard>();
  const byNameNumber = new Map<string, PokemonCard>();
  for (const c of catalogCards) {
    const num = normalizeCardNumber(c.number);
    if (num) byNumber.set(num, c);
    byNameNumber.set(`${normalizeName(c.name)}::${num}`, c);
  }

  let changed = 0;
  const next = vault.map((entry) => {
    const card = entry.card;
    if (!card) return entry;
    const sameSet =
      card.set?.id === setId ||
      normalizeName(card.set?.name) === normalizeName(setName) ||
      // Collectr slug leftovers
      normalizeName(card.set?.id?.replace(/-/g, ' ')) === normalizeName(setName);
    if (!sameSet) return entry;

    const num = normalizeCardNumber(card.number);
    let match = num ? byNumber.get(num) : undefined;
    if (!match) {
      match = byNameNumber.get(`${normalizeName(card.name)}::${num}`);
    }
    if (!match) return entry;
    if (card.id === match.id && card.set?.id === match.set?.id) return entry;

    changed += 1;
    return {
      ...entry,
      card: {
        ...card,
        id: match.id,
        name: match.name || card.name,
        number: match.number || card.number,
        rarity: match.rarity || card.rarity,
        images: match.images?.small ? match.images : card.images,
        set: {
          id: match.set?.id || setId,
          name: match.set?.name || setName,
          releaseDate: match.set?.releaseDate || card.set?.releaseDate || '',
          total: match.set?.total || card.set?.total || catalogCards.length,
        },
        marketPrice: card.marketPrice ?? match.marketPrice,
      },
    };
  });

  if (changed > 0) {
    vaultService.replaceVaultCards(next, game);
  }
  return changed;
}
