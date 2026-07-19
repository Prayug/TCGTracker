export interface ScrapedSignal {
  cardId?: string;
  cardName?: string;
  setName?: string;
  sourceUrl: string;
  sourceType: 'news' | 'social' | 'youtube' | 'tournament' | 'set_release' | 'ban_list';
  title: string;
  summary: string;
  sentiment: number;
  relevance: number;
  riskType?: string;
  expiresAt?: string;
}

export interface SignalScraper {
  name: string;
  scrape(): Promise<ScrapedSignal[]>;
}

export interface ScrapeResult {
  scraped: number;
  stored: number;
  errors: string[];
}
