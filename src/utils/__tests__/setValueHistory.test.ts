import { describe, expect, it } from 'vitest';
import { trimUnreliableSetValueHistory } from '../setValueHistory';

describe('trimUnreliableSetValueHistory', () => {
  it('drops leading sparse days before coverage and value look legit', () => {
    const history = [
      { date: '2026-03-28', setValue: 12.29, cardsPriced: 2 },
      { date: '2026-04-06', setValue: 12.29, cardsPriced: 2 },
      { date: '2026-05-20', setValue: 12.29, cardsPriced: 2 },
      { date: '2026-05-27', setValue: 2994, cardsPriced: 140 },
      { date: '2026-06-26', setValue: 3595.47, cardsPriced: 172 },
    ];

    const trimmed = trimUnreliableSetValueHistory(history, 172);

    expect(trimmed[0].date).toBe('2026-05-27');
    expect(trimmed).toHaveLength(2);
  });

  it('keeps full history when the first point is already reliable', () => {
    const history = [
      { date: '2026-05-27', setValue: 2994, cardsPriced: 140 },
      { date: '2026-06-26', setValue: 3595.47, cardsPriced: 172 },
    ];

    expect(trimUnreliableSetValueHistory(history, 172)).toEqual(history);
  });

  it('infers catalog size from peak priced cards when total is omitted', () => {
    const history = [
      { date: '2026-03-28', setValue: 5, cardsPriced: 1 },
      { date: '2026-06-26', setValue: 100, cardsPriced: 10 },
    ];

    const trimmed = trimUnreliableSetValueHistory(history);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0].date).toBe('2026-06-26');
  });
});
