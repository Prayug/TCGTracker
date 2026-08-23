import { describe, expect, it } from 'vitest';
import {
  decodeSharePayload,
  draftToSharePayload,
  encodeSharePayload,
  sharePayloadToDraft,
} from '../shareCodec';
import type { TradeDraft } from '../types';

const draft: TradeDraft = {
  id: 'local',
  title: 'Charizard for Luffy',
  game: 'pokemon',
  cashGive: 15,
  cashGet: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
  give: [
    {
      id: '1',
      cardId: 'base1-4',
      uniqueIdentifier: 'base1|4|charizard|holofoil',
      name: 'Charizard',
      setId: 'base1',
      setName: 'Base',
      number: '4',
      imageSmall: '/z.png',
      rarity: 'Rare Holo',
      quantity: 1,
      unitPrice: 400,
      game: 'pokemon',
    },
  ],
  get: [
    {
      id: '2',
      cardId: 'sv1-12',
      name: 'Pikachu',
      setId: 'sv1',
      setName: 'Scarlet & Violet',
      quantity: 2,
      unitPrice: 8,
      game: 'pokemon',
    },
  ],
};

describe('shareCodec', () => {
  it('round-trips a draft through the compact payload', () => {
    const encoded = encodeSharePayload(draftToSharePayload(draft));
    const decoded = decodeSharePayload(encoded);
    expect(decoded).not.toBeNull();
    const restored = sharePayloadToDraft(decoded!);
    expect(restored.game).toBe('pokemon');
    expect(restored.title).toBe('Charizard for Luffy');
    expect(restored.cashGive).toBe(15);
    expect(restored.give[0]?.cardId).toBe('base1-4');
    expect(restored.give[0]?.uniqueIdentifier).toBe('base1|4|charizard|holofoil');
    expect(restored.get[0]?.quantity).toBe(2);
  });

  it('rejects a bad payload', () => {
    expect(decodeSharePayload('not-valid')).toBeNull();
    expect(
      decodeSharePayload(encodeSharePayload({ ...draftToSharePayload(draft), v: 2 } as never))
    ).toBeNull();
  });
});
