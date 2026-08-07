import { describe, it, expect } from 'vitest';
import { toPullCard, isReprintInsert, classifyVariant } from '../rarityClassifier';
import { normalizeNumber } from '../rarityClassifier';

/**
 * Mirrors the phantom-SP exclusion in onePiecePackService.getPools:
 * drop native (SP) rows when a Red Super / SAA already exists for that number.
 */
function filterPhantomSp(
  cards: Array<{ name: string; number: string; rarity?: string; marketPrice?: number }>,
  setCode: string
) {
  const pulls = cards.map((c) =>
    toPullCard({
      id: `${c.number}::${c.name}`,
      name: c.name,
      number: c.number,
      rarity: c.rarity,
      marketPrice: c.marketPrice,
    })
  );
  const ultraChaseNumbers = new Set(
    pulls
      .filter((p) => p.rarity === 'SAA' || p.rarity === 'MANGA')
      .map((p) => normalizeNumber(p.number))
  );
  return pulls.filter((pull) => {
    if (
      pull.rarity === 'SP' &&
      !isReprintInsert(pull.number, setCode) &&
      ultraChaseNumbers.has(normalizeNumber(pull.number))
    ) {
      return false;
    }
    return true;
  });
}

describe('OP-13 phantom SP / price identity', () => {
  it('excludes Sabo (120) (SP) when Red Super Alt Art exists', () => {
    const kept = filterPhantomSp(
      [
        {
          name: 'Sabo (120) (SP)',
          number: 'OP13-120',
          rarity: 'SEC',
          marketPrice: 4800,
        },
        {
          name: 'Sabo (120) (Red Super Alternate Art)',
          number: 'OP13-120',
          rarity: 'SEC',
          marketPrice: 4749.98,
        },
        {
          name: 'Sabo - OP07-118 (SP)',
          number: 'OP07-118',
          rarity: 'SEC',
          marketPrice: 72.78,
        },
        {
          name: 'Smoker - OP10-030 (SP)',
          number: 'OP10-030',
          rarity: 'SR',
          marketPrice: 90.62,
        },
      ],
      'OP-13'
    );

    // Phantom native SP dropped; Red Super kept as SAA; reprint SPs kept.
    expect(kept.some((c) => c.rarity === 'SP' && c.number === 'OP13-120')).toBe(false);
    expect(kept.some((c) => c.rarity === 'SAA' && c.number === 'OP13-120')).toBe(true);
    expect(kept.some((c) => c.rarity === 'SP' && c.number === 'OP07-118')).toBe(true);
    expect(kept.some((c) => c.rarity === 'SP' && c.number === 'OP10-030')).toBe(true);
  });

  it('does not put Wanted Poster or Red Super into the SP bucket', () => {
    expect(classifyVariant('Sabo (120) (Wanted Poster)', 'SEC').rarity).toBe('AA');
    expect(classifyVariant('Sabo (120) (Red Super Alternate Art)', 'SEC').rarity).toBe('SAA');
    expect(classifyVariant('Sabo (120) (SP)', 'SEC').rarity).toBe('SP');
  });
});
