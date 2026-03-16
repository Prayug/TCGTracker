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
exports.SetCalendarScraper = void 0;
const cheerio = __importStar(require("cheerio"));
const logger_1 = require("../../utils/logger");
const CALENDAR_URLS = [
    'https://www.pokemon.com/us/pokemon-news/pokemon-tcg-product-releases',
    'https://www.pokemon.com/us/pokemon-tcg/product-gallery',
];
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const DATE_PATTERN = new RegExp(`(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, 'i');
function parseTextDate(text) {
    const match = DATE_PATTERN.exec(text);
    if (!match)
        return null;
    const date = new Date(`${match[1]} ${match[2]}, ${match[3]}`);
    return isNaN(date.getTime()) ? null : date;
}
function truncate(str, maxLen) {
    return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;
}
function isoDaysFromNow(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
async function fetchText(url) {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TCGTracker/1.0)' },
    });
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    return response.text();
}
/**
 * Scrapes official Pokémon TCG release calendar pages for upcoming product
 * releases (sets, special collections). Upcoming releases signal both hype
 * for new-set cards and reprint/supply risk for existing cards.
 */
class SetCalendarScraper {
    constructor() {
        this.name = 'set-calendar';
    }
    async scrape() {
        const signals = [];
        const seenTitles = new Set();
        for (const url of CALENDAR_URLS) {
            let html;
            try {
                html = await fetchText(url);
            }
            catch (err) {
                logger_1.logger.debug(`Set calendar fetch failed for ${url}: ${err.message}`);
                continue;
            }
            const $ = cheerio.load(html);
            // Release entries vary in markup across pokemon.com redesigns, so scan
            // generic content blocks for a product-name + date pairing.
            $('article, li, .tile, .product, section div').each((_i, el) => {
                if (signals.length >= 25)
                    return false;
                const text = $(el).text().replace(/\s+/g, ' ').trim();
                if (text.length < 20 || text.length > 500)
                    return;
                if (!/scarlet|violet|tcg|trading card|expansion|collection|elite trainer/i.test(text))
                    return;
                const releaseDate = parseTextDate(text);
                if (!releaseDate)
                    return;
                const daysUntil = (releaseDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
                if (daysUntil < -14 || daysUntil > 180)
                    return;
                const heading = $(el).find('h1, h2, h3, h4, strong, b').first().text().trim();
                const title = heading || text.slice(0, 120);
                const titleKey = title.toLowerCase();
                if (seenTitles.has(titleKey))
                    return;
                seenTitles.add(titleKey);
                signals.push({
                    setName: heading || undefined,
                    sourceUrl: url,
                    sourceType: 'set_release',
                    title: truncate(`Release calendar: ${title}`, 200),
                    summary: truncate(text, 300),
                    sentiment: daysUntil > 0 ? 0.2 : 0.4,
                    relevance: 0.6,
                    riskType: 'upcoming_set',
                    expiresAt: isoDaysFromNow(Math.max(7, Math.ceil(daysUntil) + 14)),
                });
                return;
            });
            if (signals.length > 0)
                break;
        }
        logger_1.logger.info(`SetCalendarScraper found ${signals.length} signals`);
        return signals;
    }
}
exports.SetCalendarScraper = SetCalendarScraper;
