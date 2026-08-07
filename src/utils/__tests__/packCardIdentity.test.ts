import { describe, expect, it } from 'vitest';
import { packCardIdentity } from '../packCardIdentity';

describe('packCardIdentity', () => {
  it('collapses POP Series 3 Blastoise API and TCGCSV ids', () => {
    expect(
      packCardIdentity({
        id: 'pop3-1',
        name: 'Blastoise',
        number: '1',
        set: { id: 'pop3', name: 'POP Series 3' },
      })
    ).toBe(
      packCardIdentity({
        id: 'tcgcsv-83891',
        name: 'Blastoise',
        number: '1',
        set: { id: 'popseries3', name: 'POP Series 3' },
      })
    );
  });
});
