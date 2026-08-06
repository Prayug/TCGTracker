import {
  dedupePackPoolCards,
  packCardIdentity,
  preferPackPoolCard,
} from '../packPoolDedupe';

describe('packCardIdentity', () => {
  it('treats Pokemon API and TCGCSV ids as the same POP Series 3 Blastoise', () => {
    const api = {
      id: 'pop3-1',
      name: 'Blastoise',
      number: '1',
      set: { id: 'pop3', name: 'POP Series 3' },
    };
    const tcgcsv = {
      id: 'tcgcsv-83891',
      name: 'Blastoise',
      number: '1',
      set: { id: 'popseries3', name: 'POP Series 3' },
    };
    expect(packCardIdentity(api)).toBe(packCardIdentity(tcgcsv));
    expect(packCardIdentity(api)).toBe('popseries3|1|blastoise');
  });

  it('strips leading zeros on card numbers', () => {
    expect(
      packCardIdentity({
        name: 'Pikachu',
        number: '025',
        set: { name: 'Base Set' },
      })
    ).toBe(
      packCardIdentity({
        name: 'Pikachu',
        number: '25',
        set: { name: 'Base Set' },
      })
    );
  });
});

describe('dedupePackPoolCards', () => {
  it('keeps the Pokemon API id and merges PSA 10 price from the TCGCSV row', () => {
    const deduped = dedupePackPoolCards([
      {
        id: 'tcgcsv-83891',
        name: 'Blastoise',
        number: '1',
        set: { id: 'popseries3', name: 'POP Series 3' },
        marketPrice: 136.22,
        psa10Price: 589.02,
      },
      {
        id: 'pop3-1',
        name: 'Blastoise',
        number: '1',
        set: { id: 'pop3', name: 'POP Series 3' },
        marketPrice: 217.5,
        images: { small: 'https://example.com/blastoise.png' },
      },
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('pop3-1');
    expect(deduped[0].psa10Price).toBe(589.02);
  });

  it('prefers a non-tcgcsv id when both have images', () => {
    const winner = preferPackPoolCard(
      { id: 'tcgcsv-1', images: { small: 'a' }, marketPrice: 9 },
      { id: 'base1-4', images: { small: 'b' }, marketPrice: 1 }
    );
    expect(winner.id).toBe('base1-4');
  });
});
