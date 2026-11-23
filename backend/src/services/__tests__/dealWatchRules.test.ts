import {
  alertRejection,
  DEFAULT_ALERT_RULES,
  formatDealAlertEmail,
  isNewSetDeal,
  pickNewestOnePieceSets,
  pickRecentPokemonSets,
  sortAlerts,
  type DealAlert,
} from '../dealWatchRules';
import type { DealCardPayload } from '../ebayDealService';

function deal(overrides: Partial<DealCardPayload> = {}): DealCardPayload {
  return {
    listingId: 'v1|1|0',
    listingUrl: 'https://www.ebay.com/itm/1',
    listingTitle: 'Charizard ex SIR',
    listingImage: null,
    listingType: 'bin',
    condition: 'Ungraded',
    sellerUsername: 'cardshop',
    sellerFeedbackPct: 99.8,
    sellerFeedbackScore: 1200,
    listingPrice: 60,
    shipping: 0,
    allInCost: 60,
    currency: 'USD',
    endDate: null,
    hoursRemaining: null,
    liveAuction: false,
    cardId: 'me5-120',
    uniqueIdentifier: 'me5-120',
    cardName: 'Charizard ex',
    setId: 'me5',
    setName: 'Pitch Black',
    cardNumber: '120',
    rarity: 'Special Illustration Rare',
    language: 'en',
    variantKey: 'holofoil',
    cardImage: null,
    dealCondition: 'raw',
    gradeLabel: 'Raw NM',
    grader: null,
    grade: null,
    cardCondition: 'nm',
    cardConditionLabel: 'NM',
    nmMarketValue: 100,
    conditionFactor: 1,
    marketValue: 100,
    marketSource: 'TCGplayer',
    marketUpdatedAt: null,
    marketStale: false,
    discountAmount: 40,
    discountPercent: 40,
    dealScore: 80,
    scoreBreakdown: {} as DealCardPayload['scoreBreakdown'],
    matchConfidence: 0.95,
    matchConfidenceTier: 'high',
    matchEvidence: [],
    riskFlags: [],
    liquidityScore: null,
    liquidityLabel: null,
    maxBid: null,
    desiredAuctionMargin: null,
    feed: 'deal',
    ...overrides,
  };
}

describe('alertRejection', () => {
  const rules = DEFAULT_ALERT_RULES;

  it('accepts a clean deep discount', () => {
    expect(alertRejection(deal(), false, rules)).toBeNull();
  });

  it('rejects flagged, live-auction, stale and weak-match deals', () => {
    expect(alertRejection(deal({ feed: 'review' }), false, rules)).toBe('review_feed');
    expect(alertRejection(deal({ liveAuction: true }), false, rules)).toBe('live_auction');
    expect(alertRejection(deal({ marketStale: true }), false, rules)).toBe('stale_market');
    expect(alertRejection(deal({ matchConfidenceTier: 'low' }), false, rules)).toBe('weak_match');
  });

  it('uses the looser bar for new sets', () => {
    const d = deal({ discountPercent: 18, discountAmount: 12 });
    expect(alertRejection(d, false, rules)).toBe('discount_too_small');
    expect(alertRejection(d, true, rules)).toBeNull();
  });

  it('requires real dollar savings', () => {
    const d = deal({ marketValue: 30, allInCost: 20, discountPercent: 33, discountAmount: 10 });
    expect(alertRejection(d, false, rules)).toBe('savings_too_small');
  });

  it('honours an optional max price', () => {
    expect(alertRejection(deal(), false, { ...rules, maxPrice: 50 })).toBe('over_max_price');
  });
});

describe('new set detection', () => {
  it('keeps Pokémon sets from the last N days and upcoming ones', () => {
    const index = pickRecentPokemonSets(
      [
        { setId: 'me55', setName: '30th Celebration', setReleaseDate: '2026/09/16' },
        { setId: 'me55c', setName: '30th Celebration: Classic Collection', setReleaseDate: '2026/09/16' },
        { setId: 'me5', setName: 'Pitch Black', setReleaseDate: '2026/07/17' },
        { setId: 'me6', setName: 'Future Set', setReleaseDate: '2026/11/28' },
        { setId: 'sv1', setName: 'Scarlet & Violet', setReleaseDate: '2023/03/31' },
      ],
      new Date('2026-11-08T00:00:00Z'),
      90
    );
    expect([...index.setIds].sort()).toEqual(['me55', 'me55c', 'me6']);
    expect(index.searches).toEqual(['Pokemon Future Set', 'Pokemon 30th Celebration']);
    expect(isNewSetDeal({ setId: 'other-id', setName: '30th Celebration' }, index)).toBe(true);
    expect(isNewSetDeal({ setId: 'me5', setName: 'Pitch Black' }, index)).toBe(false);
  });

  it('picks the newest One Piece boosters by set number', () => {
    const index = pickNewestOnePieceSets([
      { setId: 'OP-13', setName: 'Carrying On His Will' },
      { setId: 'OP14-EB04', setName: "The Azure Sea's Seven" },
      { setId: 'OP14', setName: 'One Piece Promotion Cards' },
      { setId: 'OP15-EB04', setName: "Adventure on Kami's Island" },
      { setId: 'EB-02', setName: 'Anime 25th' },
      { setId: 'EB-03', setName: 'Heroines' },
      { setId: 'PRB-02', setName: 'Premium Booster Vol. 2' },
      { setId: 'ST-36', setName: 'Starter Deck 36' },
    ]);
    expect([...index.setIds].sort()).toEqual(['eb-03', 'op14', 'op14-eb04', 'op15-eb04', 'prb-02']);
    expect(index.searches).toEqual([
      'One Piece OP15',
      'One Piece OP14',
      'One Piece EB03',
      'One Piece PRB02',
    ]);
  });
});

describe('alert email', () => {
  it('puts new-set deals first and includes the link', () => {
    const alerts: DealAlert[] = [
      { game: 'pokemon', isNewSet: false, deal: deal({ listingId: 'a', dealScore: 99, cardName: 'Old Card' }) },
      { game: 'onepiece', isNewSet: true, deal: deal({ listingId: 'b', dealScore: 50, cardName: 'Luffy' }) },
    ];
    expect(sortAlerts(alerts).map((a) => a.deal.listingId)).toEqual(['b', 'a']);
    const { subject, text } = formatDealAlertEmail(alerts, { appUrl: 'http://localhost:5173/' });
    expect(subject).toBe('2 new eBay deals · best: NEW SET Luffy 40% off');
    expect(text.indexOf('Luffy')).toBeLessThan(text.indexOf('Old Card'));
    expect(text).toContain('[NEW SET] One Piece · Luffy');
    expect(text).toContain('$60.00 all-in (Buy It Now) vs market $100.00: 40% off, save $40.00');
    expect(text).toContain('Seller cardshop (99.8%, 1200 ratings)');
    expect(text).toContain('https://www.ebay.com/itm/1');
    expect(text).toContain('All deals: http://localhost:5173/deals');
  });
});
