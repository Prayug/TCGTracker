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
const priceChartingResolver_1 = require("../priceChartingResolver");
const matchName_1 = require("../../utils/matchName");
const priceChartingClient_1 = require("../priceChartingClient");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
describe('guessConsoleName Japanese', () => {
    it('prefixes English set labels with Pokemon Japanese', () => {
        expect((0, priceChartingResolver_1.guessConsoleName)('Scarlet & Violet 151', 'ja')).toBe('Pokemon Japanese Scarlet & Violet 151');
    });
    it('returns null for Japanese-script set names (needs seeded mapping)', () => {
        expect((0, priceChartingResolver_1.guessConsoleName)('ポケモンカード151', 'ja')).toBeNull();
    });
    it('keeps existing Pokemon Japanese console names', () => {
        expect((0, priceChartingResolver_1.guessConsoleName)('Pokemon Japanese Scarlet & Violet 151', 'ja')).toBe('Pokemon Japanese Scarlet & Violet 151');
    });
    it('does not change English heuristic', () => {
        expect((0, priceChartingResolver_1.guessConsoleName)('Ascended Heroes', 'en')).toBe('Pokemon Ascended Heroes');
    });
});
describe('buildMatchNameFromDex', () => {
    it('maps Charizard dex + EX suffix', () => {
        expect((0, matchName_1.buildMatchNameFromDex)(6, 'EX')).toBe('Charizard EX');
    });
    it('maps Pikachu without suffix', () => {
        expect((0, matchName_1.buildMatchNameFromDex)(25)).toBe('Pikachu');
    });
    it('resolveMatchName prefers explicit matchName', () => {
        expect((0, matchName_1.resolveMatchName)({
            language: 'ja',
            cardName: 'リザードンex',
            matchName: 'Charizard ex',
            dexId: 6,
            suffix: 'EX',
        })).toBe('Charizard ex');
    });
});
describe('Japanese PriceCharting search fixture', () => {
    const searchHtml = fs.readFileSync(path.join(__dirname, 'fixtures', 'pcSearch.html'), 'utf8');
    it('can accept JP 151 Charizard EX via English matchName', () => {
        const rows = (0, priceChartingClient_1.parseSearchRows)(searchHtml);
        // Fixture may not include Charizard; assert matching rules work for JP console naming.
        const candidate = {
            productId: 'jp-sv2a-201',
            url: 'https://www.pricecharting.com/game/pokemon-japanese-scarlet-&-violet-151/charizard-ex-201',
            title: 'Charizard EX #201',
            setName: 'Pokemon Japanese Scarlet & Violet 151',
        };
        expect((0, priceChartingClient_1.isAcceptableMatch)(candidate, {
            cardName: 'Charizard EX',
            setName: 'Pokemon Japanese Scarlet & Violet 151',
            cardNumber: '201',
        })).toBe(true);
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
