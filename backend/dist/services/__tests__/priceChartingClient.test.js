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
        expect(score).toBe(135);
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
    it('rejects substring number collisions (base #34 vs full art #114)', () => {
        const fullArt = {
            productId: '958307',
            url: 'https://www.pricecharting.com/game/pokemon-phantom-forces/gengar-ex-114',
            title: 'Gengar EX #114',
            setName: 'Pokemon Phantom Forces',
        };
        const base = {
            productId: '958226',
            url: 'https://www.pricecharting.com/game/pokemon-phantom-forces/gengar-ex-34',
            title: 'Gengar EX #34',
            setName: 'Pokemon Phantom Forces',
        };
        expect((0, priceChartingClient_1.isAcceptableMatch)(fullArt, {
            cardName: 'Gengar-EX',
            setName: 'Phantom Forces',
            cardNumber: '34',
        })).toBe(false);
        expect((0, priceChartingClient_1.isAcceptableMatch)(base, {
            cardName: 'Gengar-EX',
            setName: 'Phantom Forces',
            cardNumber: '34',
        })).toBe(true);
        expect((0, priceChartingClient_1.isAcceptableMatch)(fullArt, {
            cardName: 'Gengar-EX',
            setName: 'Phantom Forces',
            cardNumber: '114',
        })).toBe(true);
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
describe('print-family matching when collector number is missing', () => {
    const regularGx = {
        productId: '964029',
        url: 'https://www.pricecharting.com/game/pokemon-hidden-fates/charizard-gx-9',
        title: 'Charizard GX #9',
        setName: 'Pokemon Hidden Fates',
    };
    const shinyGx = {
        productId: '964133',
        url: 'https://www.pricecharting.com/game/pokemon-hidden-fates/charizard-gx-sv49',
        title: 'Charizard GX #SV49',
        setName: 'Pokemon Hidden Fates',
    };
    const tin = {
        productId: '2253083',
        url: 'https://www.pricecharting.com/game/pokemon-hidden-fates/charizard-gx-hidden-fates-tin',
        title: 'Charizard GX Hidden Fates Tin',
        setName: 'Pokemon Hidden Fates',
    };
    it('maps unnumbered Hidden Fates GX to #9, not Shiny Vault SV49', () => {
        const best = (0, priceChartingClient_1.selectBestProductMatch)([shinyGx, regularGx, tin], {
            cardName: 'Charizard GX',
            setName: 'Hidden Fates',
        });
        expect(best === null || best === void 0 ? void 0 : best.row.productId).toBe('964029');
    });
    it('maps unnumbered Shiny Vault GX to SV49, not #9', () => {
        const best = (0, priceChartingClient_1.selectBestProductMatch)([shinyGx, regularGx, tin], {
            cardName: 'Charizard GX',
            setName: 'Hidden Fates: Shiny Vault',
        });
        expect(best === null || best === void 0 ? void 0 : best.row.productId).toBe('964133');
    });
    it('does not award a number bonus when the collector number is unknown', () => {
        expect((0, priceChartingClient_1.scoreCandidate)(regularGx, { cardName: 'Charizard GX', setName: 'Hidden Fates' })).toBe(115);
        expect((0, priceChartingClient_1.scoreCandidate)(regularGx, {
            cardName: 'Charizard GX',
            setName: 'Hidden Fates',
            cardNumber: '9',
        })).toBe(135);
    });
    it('refuses to guess when several numeric printings share a set', () => {
        const base = {
            productId: '1',
            url: 'https://www.pricecharting.com/game/pokemon-cosmic-eclipse/charizard-gx-20',
            title: 'Charizard GX #20',
            setName: 'Pokemon Cosmic Eclipse',
        };
        const fullArt = {
            productId: '2',
            url: 'https://www.pricecharting.com/game/pokemon-cosmic-eclipse/charizard-gx-212',
            title: 'Charizard GX #212',
            setName: 'Pokemon Cosmic Eclipse',
        };
        expect((0, priceChartingClient_1.selectBestProductMatch)([fullArt, base], {
            cardName: 'Charizard GX',
            setName: 'Cosmic Eclipse',
        })).toBeNull();
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
            { grader: 'psa', grade: '10', price: null, soldListings: 0, lastSoldDate: null, lastSoldPrice: null },
        ]);
    });
    it('attaches the most recent PSA 10 completed sale date and price', () => {
        const prices = (0, priceChartingClient_1.parseFullPrices)(productHtml);
        const psa10 = prices.find((p) => p.grader === 'psa' && p.grade === '10');
        expect(psa10.lastSoldDate).toBe('2026-08-18');
        expect(psa10.lastSoldPrice).toBe(2410);
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
    it('keeps apostrophes and inserts reverse-holo before the collector number', () => {
        expect((0, priceChartingClient_1.cardSlug)("Rocket's Wobbuffet")).toBe("rocket's-wobbuffet");
        expect((0, priceChartingClient_1.buildDirectProductUrl)('Pokemon Team Rocket Returns', "Rocket's Wobbuffet", '47', 'reverseHolofoil')).toBe("https://www.pricecharting.com/game/pokemon-team-rocket-returns/rocket's-wobbuffet-reverse-holo-47");
        expect((0, priceChartingClient_1.buildDirectProductUrl)('Pokemon Team Rocket Returns', "Rocket's Wobbuffet", '47', 'normal')).toBe("https://www.pricecharting.com/game/pokemon-team-rocket-returns/rocket's-wobbuffet-47");
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
describe('titleIncludesSet', () => {
    it('requires set tokens in the listing title', () => {
        expect((0, priceChartingClient_1.titleIncludesSet)('Charizard Base Set 2 #4 PSA 10', 'Base Set 2')).toBe(true);
        expect((0, priceChartingClient_1.titleIncludesSet)('Charizard ex 199/165 SV 151 SIR PSA 10', 'Obsidian Flames')).toBe(false);
        expect((0, priceChartingClient_1.titleIncludesSet)('2008 Stormfront Holo Charizard #103 PSA 10', 'Stormfront')).toBe(true);
    });
});
describe('PriceCharting finish matching', () => {
    const unlimited = {
        productId: '886381',
        url: "https://www.pricecharting.com/game/pokemon-team-rocket-returns/rocket's-wobbuffet-47",
        title: "Rocket's Wobbuffet #47",
        setName: 'Pokemon Team Rocket Returns',
    };
    const reverse = {
        productId: '886492',
        url: "https://www.pricecharting.com/game/pokemon-team-rocket-returns/rocket's-wobbuffet-reverse-holo-47",
        title: "Rocket's Wobbuffet [Reverse Holo] #47",
        setName: 'Pokemon Team Rocket Returns',
    };
    const input = {
        cardName: "Rocket's Wobbuffet",
        setName: 'Team Rocket Returns',
        cardNumber: '47',
    };
    it('detects reverse vs unlimited from title/url', () => {
        expect((0, priceChartingClient_1.detectPcFinishFamily)(reverse.title, reverse.url)).toBe('reverse');
        expect((0, priceChartingClient_1.detectPcFinishFamily)(unlimited.title, unlimited.url)).toBe('standard');
        expect((0, priceChartingClient_1.expectedPcFinishFamily)('reverseHolofoil')).toBe('reverse');
        expect((0, priceChartingClient_1.expectedPcFinishFamily)('normal')).toBe('standard');
        expect((0, priceChartingClient_1.inferVariantKeyFromPc)(reverse.title, reverse.url)).toBe('reverseholofoil');
    });
    it('rejects the unlimited print when the selected finish is reverse holo', () => {
        var _a;
        expect((0, priceChartingClient_1.isAcceptableMatch)(unlimited, { ...input, variant: 'reverseHolofoil' })).toBe(false);
        expect((0, priceChartingClient_1.isAcceptableMatch)(reverse, { ...input, variant: 'reverseHolofoil' })).toBe(true);
        expect((_a = (0, priceChartingClient_1.selectBestProductMatch)([unlimited, reverse], { ...input, variant: 'reverseHolofoil' })) === null || _a === void 0 ? void 0 : _a.row.productId).toBe('886492');
    });
    it('rejects reverse holo when the selected finish is the base print', () => {
        var _a;
        expect((0, priceChartingClient_1.isAcceptableMatch)(reverse, { ...input, variant: 'normal' })).toBe(false);
        expect((0, priceChartingClient_1.isAcceptableMatch)(unlimited, { ...input, variant: 'normal' })).toBe(true);
        expect((_a = (0, priceChartingClient_1.selectBestProductMatch)([reverse, unlimited], { ...input, variant: 'normal' })) === null || _a === void 0 ? void 0 : _a.row.productId).toBe('886381');
    });
    it('does not fall back to the base print when reverse is requested but missing', () => {
        expect((0, priceChartingClient_1.selectBestProductMatch)([unlimited], { ...input, variant: 'reverseHolofoil' })).toBeNull();
    });
    it('aliases onto the untagged product when allowStandardFinishAlias is set', () => {
        var _a;
        expect((0, priceChartingClient_1.isAcceptableMatch)(unlimited, {
            ...input,
            variant: 'reverseHolofoil',
            allowStandardFinishAlias: true,
        })).toBe(true);
        expect((_a = (0, priceChartingClient_1.selectBestProductMatch)([unlimited], {
            ...input,
            variant: 'reverseHolofoil',
            allowStandardFinishAlias: true,
        })) === null || _a === void 0 ? void 0 : _a.row.productId).toBe('886381');
    });
    it('finishesMatch only aliases standard onto reverse when opted in', () => {
        expect((0, priceChartingClient_1.finishesMatch)('reverse', 'standard')).toBe(false);
        expect((0, priceChartingClient_1.finishesMatch)('reverse', 'standard', { allowStandardAlias: true })).toBe(true);
        expect((0, priceChartingClient_1.finishesMatch)('standard', 'reverse', { allowStandardAlias: true })).toBe(false);
    });
});
