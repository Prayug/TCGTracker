"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PkmnPricesNewsScraper = void 0;
const logger_1 = require("../../utils/logger");
/**
 * Scrapes news/articles from pkmnprices.com for card-related signals.
 * Uses the site's HTML structure to extract article data.
 */
class PkmnPricesNewsScraper {
    constructor() {
        this.name = 'pkmnprices';
    }
    async scrape() {
        try {
            const response = await fetch('https://www.pkmnprices.com/', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });
            if (!response.ok) {
                logger_1.logger.warn(`pkmnprices.com returned ${response.status}`);
                return [];
            }
            const html = await response.text();
            const signals = [];
            // Extract articles from the page
            // Look for article patterns in the HTML
            const articleRegex = /<article[^>]*>[\s\S]*?<\/article>/gi;
            const articles = html.match(articleRegex) || [];
            for (const article of articles.slice(0, 15)) {
                const signal = this.parseArticle(article);
                if (signal)
                    signals.push(signal);
            }
            // Also look for news items in common patterns
            const newsRegex = /<div[^>]*class="[^"]*(?:news|article|post|entry)[^"]*"[^>]*>[\s\S]*?<\/div>/gi;
            const newsItems = html.match(newsRegex) || [];
            for (const item of newsItems.slice(0, 10)) {
                const signal = this.parseArticle(item);
                if (signal)
                    signals.push(signal);
            }
            logger_1.logger.info(`pkmnprices scraper found ${signals.length} signals`);
            return signals;
        }
        catch (err) {
            logger_1.logger.error('pkmnprices scraper failed:', err);
            return [];
        }
    }
    parseArticle(html) {
        // Extract title
        const titleMatch = html.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i);
        const title = titleMatch
            ? this.stripHtml(titleMatch[1]).trim()
            : null;
        if (!title || title.length < 10)
            return null;
        // Extract link
        const linkMatch = html.match(/href="(https?:\/\/[^"]*pkmnprices[^"]*)"/i);
        const url = (linkMatch === null || linkMatch === void 0 ? void 0 : linkMatch[1]) || 'https://www.pkmnprices.com/';
        // Extract summary/description
        const descMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        const summary = descMatch
            ? this.stripHtml(descMatch[1]).trim().slice(0, 300)
            : title;
        // Compute sentiment from keywords
        const combined = `${title} ${summary}`.toLowerCase();
        let sentiment = 0;
        if (/\b(bullish|up|gain|rise|increase|strong)\b/i.test(combined))
            sentiment += 0.3;
        if (/\b(bearish|down|drop|fall|decrease|weak)\b/i.test(combined))
            sentiment -= 0.3;
        if (/\b(hot|popular|trending|demand)\b/i.test(combined))
            sentiment += 0.2;
        if (/\b(reprint|overprinted|common)\b/i.test(combined))
            sentiment -= 0.2;
        // Determine risk type
        let riskType = 'announcement';
        if (combined.includes('price') && (combined.includes('drop') || combined.includes('crash'))) {
            riskType = 'manipulation';
        }
        else if (combined.includes('tournament') || combined.includes('meta')) {
            riskType = 'tournament_meta';
        }
        else if (combined.includes('release') || combined.includes('set')) {
            riskType = 'set_release';
        }
        return {
            sourceUrl: url,
            sourceType: 'news',
            title: title.slice(0, 200),
            summary,
            sentiment: Math.max(-1, Math.min(1, sentiment)),
            relevance: 0.6,
            riskType,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };
    }
    stripHtml(html) {
        return html
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }
}
exports.PkmnPricesNewsScraper = PkmnPricesNewsScraper;
