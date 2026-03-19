import { ScrapedSignal, SignalScraper } from './types';
import { logger } from '../../utils/logger';

/**
 * Scrapes YouTube search results for Pokemon card hype/review signals.
 * Uses YouTube's public search without API key by scraping the search results page.
 */
export class YoutubeScraper implements SignalScraper {
  name = 'youtube';

  private readonly SEARCH_QUERIES = [
    'pokemon card opening 2025',
    'pokemon TCG new set review',
    'pokemon card pull rates',
    'pokemon card investment',
    'pokemon card price prediction',
  ];

  async scrape(): Promise<ScrapedSignal[]> {
    const signals: ScrapedSignal[] = [];

    for (const query of this.SEARCH_QUERIES) {
      try {
        const results = await this.searchYouTube(query);
        signals.push(...results);
        // Rate limit between searches
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        logger.warn(`YouTube scraper failed for query "${query}":`, err);
      }
    }

    logger.info(`YouTube scraper found ${signals.length} signals`);
    return signals;
  }

  private async searchYouTube(query: string): Promise<ScrapedSignal[]> {
    // Use YouTube's public search results page
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      logger.warn(`YouTube search returned ${response.status}`);
      return [];
    }

    const html = await response.text();
    const signals: ScrapedSignal[] = [];

    // Extract video data from the initial page data JSON
    const dataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s);
    if (!dataMatch) return [];

    try {
      const data = JSON.parse(dataMatch[1]);
      const contents = data?.contents?.twoColumnSearchResultsRenderer
        ?.primaryContents?.sectionListRenderer?.contents?.[0]
        ?.itemSectionRenderer?.contents || [];

      for (const item of contents.slice(0, 10)) {
        const video = item.videoRenderer;
        if (!video) continue;

        const title = video.title?.runs?.[0]?.text || '';
        const videoId = video.videoId;
        const viewCount = parseInt(video.viewCountText?.simpleText?.replace(/[^0-9]/g, '') || '0');
        const publishedTime = video.publishedTimeText?.simpleText || '';

        if (!videoId || !title) continue;

        // Only process recent videos (within last 7 days)
        if (publishedTime && !publishedTime.includes('hour') && !publishedTime.includes('day')) {
          if (publishedTime.includes('week') || publishedTime.includes('month')) continue;
        }

        // Compute relevance based on view count and title keywords
        const titleLower = title.toLowerCase();
        const hasCardName = /\b(charizard|pikachu|mew|lugia|umbreon|espeon|rayquaza)\b/i.test(title);
        const hasPriceKeyword = /\b(price|invest|value|worth|expensive|rare)\b/i.test(title);
        const hasSetKeyword = /\b(set|release|new|opening|pull|chase)\b/i.test(title);

        const relevance = Math.min(1,
          (hasCardName ? 0.4 : 0) +
          (hasPriceKeyword ? 0.3 : 0) +
          (hasSetKeyword ? 0.2 : 0) +
          (viewCount > 10000 ? 0.1 : 0)
        );

        if (relevance < 0.2) continue;

        // Simple sentiment from title keywords
        let sentiment = 0;
        if (/\b(amazing|incredible|best|insane|crazy)\b/i.test(title)) sentiment += 0.3;
        if (/\b(bad|worst|terrible|scam|avoid)\b/i.test(title)) sentiment -= 0.3;
        if (/\b(invest|buy|hold|moon|🚀)\b/i.test(title)) sentiment += 0.2;
        if (/\b(crash|drop|fall|lose|sell)\b/i.test(title)) sentiment -= 0.2;

        signals.push({
          sourceUrl: `https://youtube.com/watch?v=${videoId}`,
          sourceType: 'youtube',
          title: title.slice(0, 200),
          summary: `YouTube video with ${viewCount.toLocaleString()} views. ${publishedTime}`,
          sentiment: Math.max(-1, Math.min(1, sentiment)),
          relevance,
          riskType: hasPriceKeyword ? 'character_hype' : 'announcement',
          expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    } catch (err) {
      logger.warn('YouTube HTML parsing failed:', err);
    }

    return signals;
  }
}
