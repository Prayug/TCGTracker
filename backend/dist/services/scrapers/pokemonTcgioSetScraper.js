"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokemonTcgioSetScraper = void 0;
const logger_1 = require("../../utils/logger");
/**
 * Scrapes upcoming set releases from the PokemonTCG.io API.
 * Sets with future release dates are treated as upcoming signals.
 */
class PokemonTcgioSetScraper {
    constructor() {
        this.name = 'pokemonTcgio';
    }
    async scrape() {
        try {
            const response = await fetch('https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=50');
            if (!response.ok) {
                logger_1.logger.warn(`PokemonTCG.io sets API returned ${response.status}`);
                return [];
            }
            const data = await response.json();
            const now = new Date();
            const signals = [];
            for (const set of data.data) {
                const releaseDate = new Date(set.releaseDate);
                if (isNaN(releaseDate.getTime()))
                    continue;
                const daysUntil = Math.ceil((releaseDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                // Only create signals for sets released in the last 30 days or upcoming
                if (daysUntil > 60)
                    continue;
                let sentiment = 0.5;
                let riskType = 'upcoming_set';
                let summary = '';
                if (daysUntil > 0) {
                    // Upcoming set
                    sentiment = 0.7;
                    summary = `Upcoming set "${set.name}" (${set.series}) releasing in ${daysUntil} days. ${set.total} cards expected.`;
                }
                else if (daysUntil > -30) {
                    // Recently released — hype period
                    sentiment = 0.6;
                    riskType = 'set_release';
                    summary = `Recently released set "${set.name}" (${set.series}). ${set.total} cards. Hype period active.`;
                }
                else {
                    // Released 15-30 days ago — settling
                    sentiment = 0.3;
                    riskType = 'set_release';
                    summary = `Set "${set.name}" (${set.series}) released ${Math.abs(daysUntil)} days ago. Market settling.`;
                }
                signals.push({
                    setName: set.name,
                    sourceUrl: `https://pokemon-tcg-api.vercel.app/sets/${set.id}`,
                    sourceType: 'set_release',
                    title: `${daysUntil > 0 ? 'Upcoming' : 'Recent'} Set: ${set.name}`,
                    summary,
                    sentiment,
                    relevance: 0.8,
                    riskType,
                    expiresAt: daysUntil > 0
                        ? new Date(releaseDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
                        : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                });
            }
            logger_1.logger.info(`PokemonTCG.io scraper found ${signals.length} set signals`);
            return signals;
        }
        catch (err) {
            logger_1.logger.error('PokemonTCG.io set scraper failed:', err);
            return [];
        }
    }
}
exports.PokemonTcgioSetScraper = PokemonTcgioSetScraper;
