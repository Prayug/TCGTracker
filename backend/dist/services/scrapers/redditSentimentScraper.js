"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedditSentimentScraper = void 0;
const logger_1 = require("../../utils/logger");
/**
 * Scrapes r/pokemontcg hot posts for card-related sentiment signals.
 * Uses Reddit's public JSON API (no auth required).
 */
class RedditSentimentScraper {
    constructor() {
        this.name = 'reddit';
        this.SUBREDDITS = ['pokemontcg', 'PokemonTCG'];
        this.CARD_KEYWORDS = [
            'charizard', 'pikachu', 'mew', 'lugia', 'umbreon', 'espeon',
            'rayquaza', 'arceus', ' Giratina', 'palkia', 'darkrai',
            'sunny', 'moonbreon', 'moon', 'alt art', 'illustration rare',
            'special illustration', 'secret rare', 'hyper rare', 'rainbow',
            'gold', 'vmax', 'vstar', 'ex', 'gx', 'v ',
        ];
    }
    async scrape() {
        const signals = [];
        for (const sub of this.SUBREDDITS) {
            try {
                const posts = await this.fetchSubredditPosts(sub);
                signals.push(...posts);
            }
            catch (err) {
                logger_1.logger.warn(`Reddit scraper failed for r/${sub}:`, err);
            }
        }
        logger_1.logger.info(`Reddit scraper found ${signals.length} signals`);
        return signals;
    }
    async fetchSubredditPosts(subreddit) {
        var _a, _b;
        const response = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=25`, {
            headers: {
                'User-Agent': 'TCGTracker/1.0 (card price analysis bot)',
            },
        });
        if (!response.ok) {
            logger_1.logger.warn(`Reddit API returned ${response.status} for r/${subreddit}`);
            return [];
        }
        const data = await response.json();
        const signals = [];
        const now = Date.now();
        for (const child of data.data.children) {
            const post = child.data;
            const ageHours = (now / 1000 - post.created_utc) / 3600;
            // Only process posts from the last 48 hours
            if (ageHours > 48)
                continue;
            const titleLower = post.title.toLowerCase();
            const textLower = (post.selftext || '').toLowerCase();
            const combined = `${titleLower} ${textLower}`;
            // Check if post mentions specific cards
            const mentionedCards = this.CARD_KEYWORDS.filter(kw => combined.includes(kw));
            if (mentionedCards.length === 0)
                continue;
            // Compute sentiment from upvote ratio and engagement
            const upvoteSentiment = (post.upvote_ratio - 0.5) * 2; // [-1, 1]
            const engagementBoost = Math.min(0.2, post.num_comments / 500);
            const sentiment = Math.max(-1, Math.min(1, upvoteSentiment + engagementBoost));
            // Determine signal type
            let riskType = 'character_hype';
            if (combined.includes('ban') || combined.includes('errata')) {
                riskType = 'ban_list';
            }
            else if (combined.includes('tournament') || combined.includes('regionals') || combined.includes('competitive')) {
                riskType = 'tournament_meta';
            }
            else if (combined.includes('reprint') || combined.includes('promo')) {
                riskType = 'reprint';
            }
            else if (combined.includes('price') && (combined.includes('drop') || combined.includes('crash'))) {
                riskType = 'manipulation';
            }
            signals.push({
                cardName: (_a = mentionedCards[0]) === null || _a === void 0 ? void 0 : _a.toUpperCase(),
                sourceUrl: `https://reddit.com${post.permalink}`,
                sourceType: 'social',
                title: post.title.slice(0, 200),
                summary: ((_b = post.selftext) === null || _b === void 0 ? void 0 : _b.slice(0, 300)) || post.title,
                sentiment,
                relevance: Math.min(1, mentionedCards.length * 0.3 + 0.2),
                riskType,
                expiresAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
            });
        }
        return signals;
    }
}
exports.RedditSentimentScraper = RedditSentimentScraper;
