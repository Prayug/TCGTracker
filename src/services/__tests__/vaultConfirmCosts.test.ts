import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../vaultSyncService', () => ({ syncVaultToServer: vi.fn() }));

import { vaultService } from '../vaultService';
import { costStatus } from '../../utils/vaultCost';
import type { VaultCard } from '../../types/pokemon';

const card = {
  id: 'swsh7-215',
  name: 'Umbreon VMAX',
  images: { small: 'x.png', large: 'x.png' },
  tcgplayer: { prices: { holofoil: { market: 420 } } },
};

function seed(rows: Partial<VaultCard>[]) {
  localStorage.setItem(
    'tcg_vault_cards_pokemon',
    JSON.stringify(
      rows.map((r, i) => ({
        id: `v${i}`,
        card,
        purchaseDate: '2024-01-01',
        quantity: 1,
        condition: 'raw',
        purchasePrice: 0,
        ...r,
      }))
    )
  );
}

describe('vaultService.confirmCosts', () => {
  beforeEach(() => localStorage.clear());

  it('confirms only unverified prices and keeps the stored amount', () => {
    seed([
      { purchasePrice: 420 },
      { purchasePrice: 0, costKnown: false },
      { purchasePrice: 99, costKnown: true },
    ]);
    const n = vaultService.confirmCosts(['v0', 'v1', 'v2'], 'pokemon');
    expect(n).toBe(1);
    const after = vaultService.getVaultCards('pokemon');
    expect(after[0].purchasePrice).toBe(420);
    expect(costStatus(after[0])).toBe('recorded');
    expect(costStatus(after[1])).toBe('unknown');
    expect(after[2].purchasePrice).toBe(99);
  });

  it('never turns a blank cost into a recorded one', () => {
    seed([{ purchasePrice: 0 }]);
    expect(vaultService.confirmCosts(['v0'], 'pokemon')).toBe(0);
    expect(costStatus(vaultService.getVaultCards('pokemon')[0])).toBe('unknown');
  });
});
