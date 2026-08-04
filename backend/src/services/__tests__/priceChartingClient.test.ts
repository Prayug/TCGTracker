import * as fs from 'fs';
import * as path from 'path';
import {
  parseSearchRows,
  scoreCandidate,
  isAcceptableMatch,
  parsePopData,
  parseFullPrices,
  slugify,
  cardSlug,
  consoleSlug,
  buildDirectProductUrl,
  decodeHtmlEntities,
  normalize,
  verifyProductPage,
} from '../priceChartingClient';

const fixtureDir = path.join(__dirname, 'fixtures');
const searchHtml = fs.readFileSync(path.join(fixtureDir, 'pcSearch.html'), 'utf8');
const productHtml = fs.readFileSync(path.join(fixtureDir, 'pcProduct.html'), 'utf8');

describe('parseSearchRows', () => {
  it('extracts product id, url, title, and set name from search rows', () => {
    const rows = parseSearchRows(searchHtml);
    expect(rows.length).toBeGreaterThanOrEqual(3);

    const pikachu = rows.find((r) => r.productId === '11816194');
    expect(pikachu).toBeDefined();
    expect(pikachu!.url).toBe(
      'https://www.pricecharting.com/game/pokemon-ascended-heroes/pikachu-ex-276'
    );
    expect(pikachu!.title).toBe('Pikachu ex #276');
    expect(pikachu!.setName).toBe('Pokemon Ascended Heroes');
  });

  it('decodes &amp; in product hrefs', () => {
    const rows = parseSearchRows(searchHtml);
    const sv151 = rows.find((r) => r.productId === '5809554');
    expect(sv151).toBeDefined();
    expect(sv151!.url).toBe(
      'https://www.pricecharting.com/game/pokemon-scarlet-&-violet-151/pikachu-173'
    );
  });
});

describe('strict product matching', () => {
  const pikachu = { productId: '11816194', url: 'x', title: 'Pikachu ex #276', setName: 'Pokemon Ascended Heroes' };
  const decoy173 = { productId: '5809554', url: 'y', title: 'Pikachu #173', setName: 'Pokemon Scarlet & Violet 151' };

  it('accepts the correct card: name + set + number all match', () => {
    const score = scoreCandidate(pikachu, { cardName: 'Pikachu ex', setName: 'Ascended Heroes', cardNumber: '276' });
    expect(score).toBe(110);
    expect(isAcceptableMatch(pikachu, { cardName: 'Pikachu ex', setName: 'Ascended Heroes', cardNumber: '276' })).toBe(true);
  });

  it('rejects a card whose number does not match', () => {
    expect(
      isAcceptableMatch(decoy173, { cardName: 'Pikachu ex', setName: 'Scarlet & Violet 151', cardNumber: '276' })
    ).toBe(false);
  });

  it('rejects a card whose set does not match', () => {
    expect(
      isAcceptableMatch(pikachu, { cardName: 'Pikachu ex', setName: 'Surging Sparks', cardNumber: '276' })
    ).toBe(false);
  });

  it('rejects when the name does not appear in the title', () => {
    expect(
      isAcceptableMatch(decoy173, { cardName: 'Zapdos ex', setName: 'Scarlet & Violet 151', cardNumber: '173' })
    ).toBe(false);
  });

  it('requires set + name when no card number is known', () => {
    expect(
      isAcceptableMatch(decoy173, { cardName: 'Pikachu', setName: 'Scarlet & Violet 151' })
    ).toBe(true);
    expect(
      isAcceptableMatch(decoy173, { cardName: 'Pikachu', setName: 'Surging Sparks' })
    ).toBe(false);
  });

  it('accepts promo cards matched to PriceCharting\'s generic Pokemon Promo console', () => {
    const promo = {
      productId: '844608',
      url: 'x',
      title: 'Magikarp #XY143',
      setName: 'Pokemon Promo',
    };
    expect(
      isAcceptableMatch(promo, {
        cardName: 'Magikarp',
        setName: 'XY Black Star Promos',
        cardNumber: 'XY143',
      })
    ).toBe(true);
    expect(
      isAcceptableMatch(promo, {
        cardName: 'Magikarp',
        setName: 'XY Black Star Promos',
        cardNumber: 'XY144',
      })
    ).toBe(false);
  });
});

describe('parsePopData', () => {
  it('parses positional 10-element pop arrays (index 9 = top grade) and product id', () => {
    const { psaPop, cgcPop, productId } = parsePopData(productHtml);
    expect(productId).toBe('11816194');
    expect(psaPop).toHaveLength(10);
    expect(cgcPop).toHaveLength(10);
    expect(psaPop![9]).toBe(2595);
    expect(psaPop![0]).toBe(0);
    expect(psaPop!.reduce((a, b) => a + b, 0)).toBe(3819);
    expect(cgcPop![9]).toBe(221);
  });

  it('rejects truncated/invalid arrays', () => {
    const bad = parsePopData('<html><body>VGPC.pop_data = {"psa":[1,2,3]};</body></html>');
    expect(bad.psaPop).toBeNull();
    const nan = parsePopData('<html><body>VGPC.pop_data = {"psa":[0,0,0,0,0,0,0,0,0,"x"]};</body></html>');
    expect(nan.psaPop).toBeNull();
    expect(parsePopData('<html></html>').psaPop).toBeNull();
  });
});

describe('parseFullPrices', () => {
  it('maps company-graded labels to grader/grade/price and drops generic Grade N rows', () => {
    const prices = parseFullPrices(productHtml);

    expect(prices).toHaveLength(9); // Ungraded + PSA/CGC/BGS/SGC/TAG/ACE 10s + Pristine + Black

    const psa10 = prices.find((p) => p.grader === 'psa' && p.grade === '10');
    expect(psa10!.price).toBe(2381);
    expect(psa10!.soldListings).toBe(30);

    const cgc10 = prices.find((p) => p.grader === 'cgc' && p.grade === '10');
    expect(cgc10!.price).toBe(1599.5);
    expect(cgc10!.soldListings).toBe(23);

    const pristine = prices.find((p) => p.grade === '10 pristine');
    expect(pristine!.price).toBe(2700);
    expect(pristine!.soldListings).toBe(11);

    const bgsBlack = prices.find((p) => p.grade === '10 black');
    expect(bgsBlack!.price).toBe(15828);
    expect(bgsBlack!.soldListings).toBe(2);

    const raw = prices.find((p) => p.grader === 'ungraded');
    expect(raw!.price).toBe(1113.51);
    expect(raw!.soldListings).toBe(60);

    expect(prices.find((p) => p.grader === 'generic')).toBeUndefined();
  });

  it('stores null for dashes and keeps zero sold counts as 0', () => {
    const dash = parseFullPrices(
      '<html><body><div id="full-prices"><table>' +
        '<tr><td>PSA 10</td><td class="price js-price">-</td></tr>' +
        '</table></div>' +
        '<select id="completed-auctions-condition"><option>PSA 10 (0)</option></select>' +
        '</body></html>'
    );
    expect(dash).toEqual([
      { grader: 'psa', grade: '10', price: null, soldListings: 0 },
    ]);
  });
});

describe('PriceCharting slugs keep ampersands', () => {
  it('slugifies Tag Team card names with & (not "and")', () => {
    expect(cardSlug('Magikarp & Wailord-GX')).toBe('magikarp-&-wailord-gx');
    expect(cardSlug('Latias & Latios-GX')).toBe('latias-&-latios-gx');
    expect(slugify('Magikarp &amp; Wailord-GX')).toBe('magikarp-&-wailord-gx');
  });

  it('slugifies Scarlet & Violet console names with &', () => {
    expect(consoleSlug('Pokemon Scarlet & Violet 151')).toBe(
      'pokemon-scarlet-&-violet-151'
    );
  });

  it('builds the PriceCharting product URL Tag Team pages actually use', () => {
    expect(
      buildDirectProductUrl('Pokemon Team Up', 'Magikarp & Wailord-GX', '161')
    ).toBe(
      'https://www.pricecharting.com/game/pokemon-team-up/magikarp-&-wailord-gx-161'
    );
  });
});

describe('HTML entity decoding for match verification', () => {
  it('decodes &amp; so Tag Team titles match our card names', () => {
    expect(decodeHtmlEntities('Magikarp &amp; Wailord GX #161')).toBe(
      'Magikarp & Wailord GX #161'
    );
    expect(normalize('Magikarp &amp; Wailord GX #161')).toBe('magikarpwailordgx161');
    expect(normalize('Magikarp & Wailord-GX')).toBe('magikarpwailordgx');
    expect(
      normalize('Magikarp &amp; Wailord GX #161').includes(
        normalize('Magikarp & Wailord-GX')
      )
    ).toBe(true);
  });

  it('accepts a product page whose meta title still has &amp;', () => {
    expect(
      verifyProductPage(
        {
          productId: '123',
          title: decodeHtmlEntities('Magikarp &amp; Wailord GX #161'),
          setName: 'Pokemon Team Up',
          psaPop: null,
          cgcPop: null,
          gradedPrices: [],
        },
        {
          cardName: 'Magikarp & Wailord-GX',
          setName: 'Team Up',
          cardNumber: '161',
        }
      )
    ).toBe(true);
  });
});
