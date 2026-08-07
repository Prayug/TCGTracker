"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const priceChartingClient_1 = require("../priceChartingClient");
const fixtureDir = path.join(__dirname, 'fixtures');
const searchHtml = fs.readFileSync(path.join(fixtureDir, 'pcSearch.html'), 'utf8');
const productHtml = fs.readFileSync(path.join(fixtureDir, 'pcProduct.html'), 'utf8');
describe('parseSearchRows', () => {
    it('extracts product id, url, title, and set name from search rows', () => {
        const rows = (0, priceChartingClient_1.parseSearchRows)(searchHtml);
        expect(rows.length).toBeGreaterThanOrEqual(3);
        const pikachu = rows.find((r) => r.productId === '11816194');
        expect(pikachu).toBeDefined();
        expect(pikachu.url).toBe('https://www.pricecharting.com/game/pokemon-ascended-heroes/pikachu-ex-276');
        expect(pikachu.title).toBe('Pikachu ex #276');
        expect(pikachu.setName).toBe('Pokemon Ascended Heroes');
    });
    it('decodes &amp; in product hrefs', () => {
        const rows = (0, priceChartingClient_1.parseSearchRows)(searchHtml);
        const sv151 = rows.find((r) => r.productId === '5809554');
        expect(sv151).toBeDefined();
        expect(sv151.url).toBe('https://www.pricecharting.com/game/pokemon-scarlet-&-violet-151/pikachu-173');
    });
});
describe('strict product matching', () => {
    const pikachu = { productId: '11816194', url: 'x', title: 'Pikachu ex #276', setName: 'Pokemon Ascended Heroes' };
    const decoy173 = { productId: '5809554', url: 'y', title: 'Pikachu #173', setName: 'Pokemon Scarlet & Violet 151' };
    it('accepts the correct card: name + set + number all match', () => {
        const score = (0, priceChartingClient_1.scoreCandidate)(pikachu, { cardName: 'Pikachu ex', setName: 'Ascended Heroes', cardNumber: '276' });
        expect(score).toBe(110);
        expect((0, priceChartingClient_1.isAcceptableMatch)(pikachu, { cardName: 'Pikachu ex', setName: 'Ascended Heroes', cardNumber: '276' })).toBe(true);
    });
    it('rejects a card whose number does not match', () => {
        expect((0, priceChartingClient_1.isAcceptableMatch)(decoy173, { cardName: 'Pikachu ex', setName: 'Scarlet & Violet 151', cardNumber: '276' })).toBe(false);
    });
    it('rejects a card whose set does not match', () => {
        expect((0, priceChartingClient_1.isAcceptableMatch)(pikachu, { cardName: 'Pikachu ex', setName: 'Surging Sparks', cardNumber: '276' })).toBe(false);
    });
    it('rejects when the name does not appear in the title', () => {
        expect((0, priceChartingClient_1.isAcceptableMatch)(decoy173, { cardName: 'Zapdos ex', setName: 'Scarlet & Violet 151', cardNumber: '173' })).toBe(false);
    });
    it('requires set + name when no card number is known', () => {
        expect((0, priceChartingClient_1.isAcceptableMatch)(decoy173, { cardName: 'Pikachu', setName: 'Scarlet & Violet 151' })).toBe(true);
        expect((0, priceChartingClient_1.isAcceptableMatch)(decoy173, { cardName: 'Pikachu', setName: 'Surging Sparks' })).toBe(false);
    });
    it('accepts promo cards matched to PriceCharting\'s generic Pokemon Promo console', () => {
        const promo = {
            productId: '844608',
            url: 'x',
            title: 'Magikarp #XY143',
            setName: 'Pokemon Promo',
        };
        expect((0, priceChartingClient_1.isAcceptableMatch)(promo, {
            cardName: 'Magikarp',
            setName: 'XY Black Star Promos',
            cardNumber: 'XY143',
        })).toBe(true);
        expect((0, priceChartingClient_1.isAcceptableMatch)(promo, {
            cardName: 'Magikarp',
            setName: 'XY Black Star Promos',
            cardNumber: 'XY144',
        })).toBe(false);
    });
});
describe('parsePopData', () => {
    it('parses positional 10-element pop arrays (index 9 = top grade) and product id', () => {
        const { psaPop, cgcPop, productId } = (0, priceChartingClient_1.parsePopData)(productHtml);
        expect(productId).toBe('11816194');
        expect(psaPop).toHaveLength(10);
        expect(cgcPop).toHaveLength(10);
        expect(psaPop[9]).toBe(2595);
        expect(psaPop[0]).toBe(0);
        expect(psaPop.reduce((a, b) => a + b, 0)).toBe(3819);
        expect(cgcPop[9]).toBe(221);
    });
    it('rejects truncated/invalid arrays', () => {
        const bad = (0, priceChartingClient_1.parsePopData)('<html><body>VGPC.pop_data = {"psa":[1,2,3]};</body></html>');
        expect(bad.psaPop).toBeNull();
        const nan = (0, priceChartingClient_1.parsePopData)('<html><body>VGPC.pop_data = {"psa":[0,0,0,0,0,0,0,0,0,"x"]};</body></html>');
        expect(nan.psaPop).toBeNull();
        expect((0, priceChartingClient_1.parsePopData)('<html></html>').psaPop).toBeNull();
    });
});
describe('parseFullPrices', () => {
    it('maps company-graded labels to grader/grade/price and drops generic Grade N rows', () => {
        const prices = (0, priceChartingClient_1.parseFullPrices)(productHtml);
        expect(prices).toHaveLength(9); // Ungraded + PSA/CGC/BGS/SGC/TAG/ACE 10s + Pristine + Black
        const psa10 = prices.find((p) => p.grader === 'psa' && p.grade === '10');
        expect(psa10.price).toBe(2381);
        expect(psa10.soldListings).toBe(30);
        const cgc10 = prices.find((p) => p.grader === 'cgc' && p.grade === '10');
        expect(cgc10.price).toBe(1599.5);
        expect(cgc10.soldListings).toBe(23);
        const pristine = prices.find((p) => p.grade === '10 pristine');
        expect(pristine.price).toBe(2700);
        expect(pristine.soldListings).toBe(11);
        const bgsBlack = prices.find((p) => p.grade === '10 black');
        expect(bgsBlack.price).toBe(15828);
        expect(bgsBlack.soldListings).toBe(2);
        const raw = prices.find((p) => p.grader === 'ungraded');
        expect(raw.price).toBe(1113.51);
        expect(raw.soldListings).toBe(60);
        expect(prices.find((p) => p.grader === 'generic')).toBeUndefined();
    });
    it('stores null for dashes and keeps zero sold counts as 0', () => {
        const dash = (0, priceChartingClient_1.parseFullPrices)('<html><body><div id="full-prices"><table>' +
            '<tr><td>PSA 10</td><td class="price js-price">-</td></tr>' +
            '</table></div>' +
            '<select id="completed-auctions-condition"><option>PSA 10 (0)</option></select>' +
            '</body></html>');
        expect(dash).toEqual([
            { grader: 'psa', grade: '10', price: null, soldListings: 0 },
        ]);
    });
});
describe('PriceCharting slugs keep ampersands', () => {
    it('slugifies Tag Team card names with & (not "and")', () => {
        expect((0, priceChartingClient_1.cardSlug)('Magikarp & Wailord-GX')).toBe('magikarp-&-wailord-gx');
        expect((0, priceChartingClient_1.cardSlug)('Latias & Latios-GX')).toBe('latias-&-latios-gx');
        expect((0, priceChartingClient_1.slugify)('Magikarp &amp; Wailord-GX')).toBe('magikarp-&-wailord-gx');
    });
    it('slugifies Scarlet & Violet console names with &', () => {
        expect((0, priceChartingClient_1.consoleSlug)('Pokemon Scarlet & Violet 151')).toBe('pokemon-scarlet-&-violet-151');
    });
    it('builds the PriceCharting product URL Tag Team pages actually use', () => {
        expect((0, priceChartingClient_1.buildDirectProductUrl)('Pokemon Team Up', 'Magikarp & Wailord-GX', '161')).toBe('https://www.pricecharting.com/game/pokemon-team-up/magikarp-&-wailord-gx-161');
    });
});
describe('HTML entity decoding for match verification', () => {
    it('decodes &amp; so Tag Team titles match our card names', () => {
        expect((0, priceChartingClient_1.decodeHtmlEntities)('Magikarp &amp; Wailord GX #161')).toBe('Magikarp & Wailord GX #161');
        expect((0, priceChartingClient_1.normalize)('Magikarp &amp; Wailord GX #161')).toBe('magikarpwailordgx161');
        expect((0, priceChartingClient_1.normalize)('Magikarp & Wailord-GX')).toBe('magikarpwailordgx');
        expect((0, priceChartingClient_1.normalize)('Magikarp &amp; Wailord GX #161').includes((0, priceChartingClient_1.normalize)('Magikarp & Wailord-GX'))).toBe(true);
    });
    it('accepts a product page whose meta title still has &amp;', () => {
        expect((0, priceChartingClient_1.verifyProductPage)({
            productId: '123',
            title: (0, priceChartingClient_1.decodeHtmlEntities)('Magikarp &amp; Wailord GX #161'),
            setName: 'Pokemon Team Up',
            psaPop: null,
            cgcPop: null,
            gradedPrices: [],
        }, {
            cardName: 'Magikarp & Wailord-GX',
            setName: 'Team Up',
            cardNumber: '161',
        })).toBe(true);
    });
});
