const searchEbayListings = jest.fn();

jest.mock('../../db/database', () => ({ getDb: jest.fn() }));
jest.mock('../../db/promisified', () => ({
  dbAll: jest.fn(async () => []),
  dbGet: jest.fn(async () => undefined),
  dbRun: jest.fn(async () => ({ changes: 0, lastID: 0 })),
}));
jest.mock('../canonicalPriceService', () => ({
  getLatestCanonicalPrice: jest.fn(async () => null),
}));
jest.mock('../ebayBrowseClient', () => ({
  CCG_INDIVIDUAL_CARDS_CATEGORY: '183454',
  EBAY_BROWSE_MAX_OFFSET: 10_000,
  EBAY_BROWSE_PAGE_SIZE: 200,
  getEbayCooldownRemainingMs: jest.fn(async () => 0),
  isEbayBrowseConfigured: jest.fn(() => true),
  searchEbayListings: (...args: unknown[]) => searchEbayListings(...args),
}));

import { getDeals } from '../ebayDealService';

type SearchOptions = { query: string; offset: number; sort: string };

const HOUR = 3_600_000;
let nextId = 0;

function page(count: number, createdAgoMs: number, endsInMs: number) {
  const now = Date.now();
  return Array.from({ length: count }, () => {
    nextId += 1;
    return {
      listingId: `v1|${nextId}|0`,
      title: 'Pokemon card lot',
      url: 'https://www.ebay.com/itm/1',
      imageUrl: null,
      listingPrice: 20,
      shipping: 0,
      currency: 'USD',
      listingType: 'bin',
      buyingOptions: ['FIXED_PRICE'],
      endDate: new Date(now + endsInMs).toISOString(),
      createdDate: new Date(now - createdAgoMs).toISOString(),
      condition: null,
      conditionId: null,
      conditionDescription: null,
      conditionDescriptors: [],
      sellerUsername: null,
      sellerFeedbackPct: null,
      sellerFeedbackScore: null,
      shortDescription: null,
      itemCountry: 'US',
    };
  });
}

async function waitForScan(query: Parameters<typeof getDeals>[0]) {
  for (let i = 0; i < 500; i += 1) {
    const result = await getDeals({ ...query, refresh: false, fullRescan: false });
    if (!result.meta.scanning) return result;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('scan did not finish');
}

describe('eBay deal crawl', () => {
  it('runs a full scan first, then quick refreshes that stop at listings already covered', async () => {
    // Full scan: every search has two pages, so each one asks eBay twice.
    searchEbayListings.mockImplementation(async (options: SearchOptions) => ({
      listings: page(options.offset === 0 ? 200 : 50, 10 * HOUR, 72 * HOUR),
      total: 250,
    }));
    await getDeals({ game: 'pokemon' });
    const full = await waitForScan({ game: 'pokemon' });
    const fullCalls = searchEbayListings.mock.calls.length;
    const searches = full.meta.queriesTotal;
    expect(full.meta.scanMode).toBe('full');
    expect(fullCalls).toBe(searches * 2);
    expect(full.meta.listingsScanned).toBe(searches * 250);

    // Quick refresh: listings are older than the last scan's start and
    // auctions end beyond the bid horizon, so each search stops after one page.
    searchEbayListings.mockClear();
    searchEbayListings.mockImplementation(async () => ({
      listings: page(200, 10 * HOUR, 72 * HOUR),
      total: 5000,
    }));
    const started = await getDeals({ game: 'pokemon', refresh: true });
    expect(started.meta.scanMode).toBe('quick');
    const quick = await waitForScan({ game: 'pokemon' });
    expect(searchEbayListings.mock.calls.length).toBe(searches);
    // Nothing new was posted, so the page still describes the full scan.
    expect(quick.meta.listingsScanned).toBe(full.meta.listingsScanned);
    expect(quick.meta.ebayTotal).toBe(full.meta.ebayTotal);

    // New listings keep a quick search paging until it reaches older ones.
    searchEbayListings.mockClear();
    searchEbayListings.mockImplementation(async (options: SearchOptions) => ({
      listings: options.offset === 0 ? page(200, -HOUR, 2 * HOUR) : page(200, 10 * HOUR, 72 * HOUR),
      total: 5000,
    }));
    await getDeals({ game: 'pokemon', refresh: true });
    const topped = await waitForScan({ game: 'pokemon' });
    expect(topped.meta.scanMode).toBe('quick');
    expect(searchEbayListings.mock.calls.length).toBe(searches * 2);
    // Every first page held 200 listings posted since the last scan.
    expect(topped.meta.listingsScanned).toBe(full.meta.listingsScanned + searches * 200);

    // Full rescan walks every page again.
    searchEbayListings.mockClear();
    searchEbayListings.mockImplementation(async (options: SearchOptions) => ({
      listings: page(options.offset === 0 ? 200 : 50, 10 * HOUR, 72 * HOUR),
      total: 250,
    }));
    const rescan = await getDeals({ game: 'pokemon', refresh: true, fullRescan: true });
    expect(rescan.meta.scanMode).toBe('full');
    await waitForScan({ game: 'pokemon' });
    expect(searchEbayListings.mock.calls.length).toBe(searches * 2);
  });

  it('asks eBay for the next page before the current page finishes evaluating', async () => {
    const order: string[] = [];
    const { dbRun } = jest.requireMock('../../db/promisified') as { dbRun: jest.Mock };
    dbRun.mockImplementation(async (sql: string) => {
      // The scan cache is written once a page has been evaluated.
      if (sql.includes('INSERT INTO ebay_deal_scan_cache')) order.push('page evaluated');
      return { changes: 0, lastID: 0 };
    });
    searchEbayListings.mockReset();
    searchEbayListings.mockImplementation(async (options: SearchOptions) => {
      order.push(`fetch ${options.offset}`);
      return { listings: page(options.offset < 400 ? 200 : 10, 10 * HOUR, 72 * HOUR), total: 410 };
    });
    await getDeals({ game: 'onepiece', refresh: true, fullRescan: true });
    await waitForScan({ game: 'onepiece' });
    expect(order.slice(0, 3)).toEqual(['fetch 0', 'fetch 200', 'page evaluated']);
    // The short third page ends the search without asking for a fourth.
    expect(order.filter((entry) => entry.startsWith('fetch')).slice(0, 4)).toEqual([
      'fetch 0',
      'fetch 200',
      'fetch 400',
      'fetch 0',
    ]);
  });
});
