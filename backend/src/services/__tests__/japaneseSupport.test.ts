import { guessConsoleName } from '../priceChartingResolver';
import { buildMatchNameFromDex, resolveMatchName } from '../../utils/matchName';
import { isAcceptableMatch, parseSearchRows } from '../priceChartingClient';
import * as fs from 'fs';
import * as path from 'path';

describe('guessConsoleName Japanese', () => {
  it('prefixes English set labels with Pokemon Japanese', () => {
    expect(guessConsoleName('Scarlet & Violet 151', 'ja')).toBe(
      'Pokemon Japanese Scarlet & Violet 151'
    );
  });

  it('returns null for Japanese-script set names (needs seeded mapping)', () => {
    expect(guessConsoleName('ポケモンカード151', 'ja')).toBeNull();
  });

  it('keeps existing Pokemon Japanese console names', () => {
    expect(guessConsoleName('Pokemon Japanese Scarlet & Violet 151', 'ja')).toBe(
      'Pokemon Japanese Scarlet & Violet 151'
    );
  });

  it('does not change English heuristic', () => {
    expect(guessConsoleName('Ascended Heroes', 'en')).toBe('Pokemon Ascended Heroes');
  });
});

describe('buildMatchNameFromDex', () => {
  it('maps Charizard dex + EX suffix', () => {
    expect(buildMatchNameFromDex(6, 'EX')).toBe('Charizard EX');
  });

  it('maps Pikachu without suffix', () => {
    expect(buildMatchNameFromDex(25)).toBe('Pikachu');
  });

  it('resolveMatchName prefers explicit matchName', () => {
    expect(
      resolveMatchName({
        language: 'ja',
        cardName: 'リザードンex',
        matchName: 'Charizard ex',
        dexId: 6,
        suffix: 'EX',
      })
    ).toBe('Charizard ex');
  });
});

describe('Japanese PriceCharting search fixture', () => {
  const searchHtml = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'pcSearch.html'),
    'utf8'
  );

  it('can accept JP 151 Charizard EX via English matchName', () => {
    const rows = parseSearchRows(searchHtml);
    // Fixture may not include Charizard; assert matching rules work for JP console naming.
    const candidate = {
      productId: 'jp-sv2a-201',
      url: 'https://www.pricecharting.com/game/pokemon-japanese-scarlet-&-violet-151/charizard-ex-201',
      title: 'Charizard EX #201',
      setName: 'Pokemon Japanese Scarlet & Violet 151',
    };
    expect(
      isAcceptableMatch(candidate, {
        cardName: 'Charizard EX',
        setName: 'Pokemon Japanese Scarlet & Violet 151',
        cardNumber: '201',
      })
    ).toBe(true);

    // Ensure search fixture still parses (regression guard).
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('queryContainsCjk', () => {
  const { queryContainsCjk } = require('../../utils/scriptDetection');

  it('detects katakana Pikachu', () => {
    expect(queryContainsCjk('ピカチュウ')).toBe(true);
  });

  it('detects hiragana', () => {
    expect(queryContainsCjk('ぴかちゅう')).toBe(true);
  });

  it('ignores ascii english names', () => {
    expect(queryContainsCjk('Pikachu')).toBe(false);
  });
});
