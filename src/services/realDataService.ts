import axios, { AxiosError } from 'axios';
import { load, CheerioAPI } from 'cheerio';
import { PSAData, PricePoint } from '../types/pokemon';

class RealDataService {
  private readonly API_BASE = '/api/pokemonprice';

  async fetchRealPSAPopulation(cardName: string, setName: string): Promise<PSAData | null> {
    try {
      const searchHtml = await this.searchForCard(cardName, setName);
      if (!searchHtml) return null;

      const cardPageLink = this.findCardPageLink(searchHtml, cardName, setName);
      if (!cardPageLink) {
        console.warn(`Could not find a matching card link for ${cardName} on pokemonprice.com`);
        return null;
      }

      const cardPageHtml = await this.getCardPage(cardPageLink);
      if (!cardPageHtml) return null;

      return this.parseCardPage(cardPageHtml);

    } catch (error) {
      console.error(`Error processing ${cardName}:`, (error as Error).message);
      return null;
    }
  }
  
  private async searchForCard(cardName: string, setName: string): Promise<string | null> {
    // pokemonprice.com uses a simple GET request for search
    const searchQuery = `${cardName} ${setName}`;
    const searchUrl = `${this.API_BASE}/?s=${encodeURIComponent(searchQuery)}`;

    try {
      const response = await axios.get(searchUrl);
      return response.data;
    } catch (error) {
      console.error(`Failed to search for card: ${searchQuery}`, (error as AxiosError).message);
      return null;
    }
  }

  private findCardPageLink($: CheerioAPI | string, cardName: string, setName: string): string | null {
    const html = typeof $ === 'string' ? load($) : $;
    let bestMatchLink: string | null = null;
    let highestScore = 0;
    
    html('div.card-container a').each((_i, el) => {
      const link = html(el);
      const title = link.find('h3').text();
      const score = this.calculateMatchScore(title, cardName, setName);
      
      if (score > highestScore) {
        highestScore = score;
        bestMatchLink = link.attr('href') || null;
      }
    });

    // We need a reasonably high score to be confident it's the right card
    return highestScore > 3 ? bestMatchLink : null;
  }

  private calculateMatchScore(title: string, cardName: string, setName: string): number {
    const lowerTitle = title.toLowerCase();
    const lowerCardName = cardName.toLowerCase();
    const lowerSetName = setName.toLowerCase();
    let score = 0;

    if (lowerTitle.includes(lowerCardName)) score += 5;
    if (lowerTitle.includes(lowerSetName)) score += 3;
    if (lowerTitle.includes('psa')) score += 1;

    // Penalize for incorrect terms to avoid false positives
    if (lowerTitle.includes('sealed') || lowerTitle.includes('booster')) score -= 10;
    
    return score;
  }

  private async getCardPage(cardLink: string): Promise<string | null> {
    try {
      const response = await axios.get(`${this.API_BASE}${cardLink}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch card page: ${cardLink}`, (error as AxiosError).message);
      return null;
    }
  }
  
  private parseCardPage(html: string): PSAData | null {
    const $ = load(html);
    const popData: { [grade: string]: number } = {};

    // As per the reddit post, the data is in a clean table.
    // Let's find the PSA Population table
    $('h3:contains("PSA Population Report")').next('table').find('tr').each((_i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 2) {
        const grade = $(cells[0]).text().trim();
        const population = parseInt($(cells[1]).text().trim().replace(/,/g, ''), 10);
        popData[grade] = population;
      }
    });
    
    const grade10 = popData['PSA 10'] || 0;
    const grade9 = popData['PSA 9'] || 0;
    const grade8 = popData['PSA 8'] || 0;
    const grade7 = popData['PSA 7'] || 0;

    // If we didn't find any data, it's not a valid card page for our needs.
    if (grade10 === 0 && grade9 === 0) {
      return null;
    }

    return this.buildPSAData(grade10, grade9, grade8, grade7);
  }

  private buildPSAData(grade10: number, grade9: number, grade8: number, grade7: number): PSAData {
    const total = grade10 + grade9 + grade8 + grade7;
    const prices = {
        grade10: 0, // Price history will be handled separately
        grade9: 0,
        grade8: 0,
        raw: 0
    };
    return {
      population: { grade10, grade9, grade8, grade7, total },
      prices,
      popReport: {
        lowPop: grade10 < 100 && grade10 > 0,
        grade10Percentage: total > 0 ? (grade10 / total) * 100 : 0,
        totalSubmissions: total,
      },
      returnRate: total > 0 ? ((grade10 + grade9) / total) * 100 : 0
    };
  }

  async fetchRealPriceHistory(cardName: string): Promise<PricePoint[]> {
    // This is a placeholder. A full implementation would scrape the price history table
    // from pokemonprice.com in a similar fashion to the PSA population.
    console.warn(`Real price history for ${cardName} from pokemonprice.com is not fully implemented.`);
    return [];
  }
}

export const realDataService = new RealDataService();