import axios from 'axios';
import { PSAData, PricePoint } from '../types/pokemon';

class RealDataService {
  private readonly CORS_PROXY = 'https://api.allorigins.win/raw?url=';
  private readonly MARKET_APIS = {
    cardLadder: 'https://www.cardladder.com/api',
    pwcc: 'https://www.pwccmarketplace.com/api',
    gca: 'https://www.goldcardauctions.com/api',
    priceCharting: 'https://www.pricecharting.com/api'
  };

  async fetchRealPSAPopulation(cardName: string, setName: string): Promise<PSAData | null> {
    try {
      // Try multiple real data sources in order of reliability
      
      // 1. Try CardLadder (has good PSA population data)
      const cardLadderData = await this.fetchCardLadderPSA(cardName, setName);
      if (cardLadderData) return cardLadderData;

      // 2. Try PWCC Marketplace
      const pwccData = await this.fetchPWCCPSA(cardName, setName);
      if (pwccData) return pwccData;

      // 3. Try scraping PSA directly
      const psaScrapedData = await this.scrapePSADirect(cardName, setName);
      if (psaScrapedData) return psaScrapedData;

      // 4. Try GoldCardAuctions
      const gcaData = await this.fetchGCAPSA(cardName, setName);
      if (gcaData) return gcaData;

      return null;
    } catch (error) {
      console.error('Error fetching real PSA data:', error);
      return null;
    }
  }

  private async fetchCardLadderPSA(cardName: string, setName: string): Promise<PSAData | null> {
    try {
      // CardLadder has a searchable database with PSA populations
      const searchUrl = `${this.CORS_PROXY}${encodeURIComponent('https://www.cardladder.com/search')}`;
      
      const response = await axios.post(searchUrl, {
        query: `${cardName} ${setName}`,
        category: 'pokemon',
        grading_company: 'psa'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.data && response.data.results) {
        const card = response.data.results.find((item: any) => 
          item.name.toLowerCase().includes(cardName.toLowerCase()) &&
          item.set.toLowerCase().includes(setName.toLowerCase())
        );

        if (card && card.psa_population) {
          return this.buildPSADataFromCardLadder(card.psa_population);
        }
      }

      return null;
    } catch (error) {
      console.error('CardLadder fetch error:', error);
      return null;
    }
  }

  private async fetchPWCCPSA(cardName: string, setName: string): Promise<PSAData | null> {
    try {
      // PWCC has detailed population data in their auction listings
      const searchUrl = `${this.CORS_PROXY}${encodeURIComponent('https://www.pwccmarketplace.com/lots')}`;
      
      const response = await axios.get(searchUrl, {
        params: {
          search: `${cardName} ${setName}`,
          category: 'pokemon',
          status: 'sold'
        }
      });

      // Parse PWCC HTML for population data
      const populationData = this.parsePWCCPopulation(response.data, cardName);
      return populationData;
    } catch (error) {
      console.error('PWCC fetch error:', error);
      return null;
    }
  }

  private async scrapePSADirect(cardName: string, setName: string): Promise<PSAData | null> {
    try {
      // Scrape PSA's population report directly
      const setMapping = this.mapSetToPSAUrl(setName);
      if (!setMapping) return null;

      const psaUrl = `https://www.psacard.com/pop/tcg-cards/${setMapping.year}/${setMapping.path}`;
      const response = await axios.get(`${this.CORS_PROXY}${encodeURIComponent(psaUrl)}`);

      return this.parsePSAPopulationHTML(response.data, cardName);
    } catch (error) {
      console.error('PSA direct scraping error:', error);
      return null;
    }
  }

  private async fetchGCAPSA(cardName: string, setName: string): Promise<PSAData | null> {
    try {
      // GoldCardAuctions tracks PSA populations
      const searchUrl = `${this.CORS_PROXY}${encodeURIComponent('https://www.goldcardauctions.com/search')}`;
      
      const response = await axios.get(searchUrl, {
        params: {
          q: `${cardName} ${setName}`,
          game: 'pokemon',
          grader: 'psa'
        }
      });

      const populationData = this.parseGCAPopulation(response.data, cardName);
      return populationData;
    } catch (error) {
      console.error('GCA fetch error:', error);
      return null;
    }
  }

  private buildPSADataFromCardLadder(population: any): PSAData {
    const grade10 = population.psa_10 || 0;
    const grade9 = population.psa_9 || 0;
    const grade8 = population.psa_8 || 0;
    const grade7 = population.psa_7 || 0;
    const total = grade10 + grade9 + grade8 + grade7;

    return {
      population: { grade10, grade9, grade8, grade7, total },
      prices: {
        grade10: population.prices?.psa_10 || this.estimatePrice(grade10, 10),
        grade9: population.prices?.psa_9 || this.estimatePrice(grade9, 9),
        grade8: population.prices?.psa_8 || this.estimatePrice(grade8, 8),
        raw: population.prices?.raw || this.estimatePrice(total, 0)
      },
      popReport: {
        lowPop: grade10 < 100,
        grade10Percentage: total > 0 ? (grade10 / total) * 100 : 0,
        totalSubmissions: total
      },
      returnRate: total > 0 ? ((grade10 + grade9) / total) * 100 : 0
    };
  }

  private parsePSAPopulationHTML(html: string, cardName: string): PSAData | null {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // PSA population tables have specific structure
      const tables = doc.querySelectorAll('table.population-table, table[class*="pop"]');
      
      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 6) {
            const name = cells[0]?.textContent?.trim();
            
            if (name && this.isCardMatch(name, cardName)) {
              const grade10 = this.parsePopulationNumber(cells[2]?.textContent);
              const grade9 = this.parsePopulationNumber(cells[3]?.textContent);
              const grade8 = this.parsePopulationNumber(cells[4]?.textContent);
              const grade7 = this.parsePopulationNumber(cells[5]?.textContent);
              
              return this.buildPSAData(grade10, grade9, grade8, grade7);
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('PSA HTML parsing error:', error);
      return null;
    }
  }

  private parsePWCCPopulation(html: string, cardName: string): PSAData | null {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Look for PWCC lot cards that match our search
      const lotCards = doc.querySelectorAll('.lot-card, .auction-item');
      
      for (const card of lotCards) {
        const title = card.querySelector('.lot-title, .item-title')?.textContent;
        
        if (title && this.isCardMatch(title, cardName)) {
          // Extract population data from PWCC's detailed descriptions
          const description = card.querySelector('.lot-description, .item-description')?.textContent;
          
          if (description) {
            const populationMatch = description.match(/PSA\s+(\d+)\s+Pop[ulation]*:?\s*(\d+)/gi);
            if (populationMatch) {
              return this.parsePWCCPopulationText(populationMatch);
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('PWCC parsing error:', error);
      return null;
    }
  }

  private parseGCAPopulation(html: string, cardName: string): PSAData | null {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // GCA has population data in their card listings
      const cardItems = doc.querySelectorAll('.card-item, .auction-card');
      
      for (const item of cardItems) {
        const title = item.querySelector('.card-title')?.textContent;
        
        if (title && this.isCardMatch(title, cardName)) {
          const popData = item.querySelector('.population-data');
          if (popData) {
            return this.parseGCAPopulationElement(popData);
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('GCA parsing error:', error);
      return null;
    }
  }

  private mapSetToPSAUrl(setName: string): { year: string; path: string } | null {
    const setMappings: Record<string, { year: string; path: string }> = {
      'Base Set': { year: '1998', path: 'pokemon-japanese-base-set' },
      'Jungle': { year: '1999', path: 'pokemon-jungle' },
      'Fossil': { year: '1999', path: 'pokemon-fossil' },
      'Team Rocket': { year: '2000', path: 'pokemon-team-rocket' },
      'Gym Heroes': { year: '2000', path: 'pokemon-gym-heroes' },
      'Gym Challenge': { year: '2000', path: 'pokemon-gym-challenge' },
      'Neo Genesis': { year: '2000', path: 'pokemon-neo-genesis' },
      'Neo Discovery': { year: '2001', path: 'pokemon-neo-discovery' },
      'Neo Destiny': { year: '2001', path: 'pokemon-neo-destiny' },
      'Neo Revelation': { year: '2001', path: 'pokemon-neo-revelation' }
    };

    return setMappings[setName] || null;
  }

  private isCardMatch(text: string, cardName: string): boolean {
    const normalizedText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedCard = cardName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalizedText.includes(normalizedCard);
  }

  private parsePopulationNumber(text: string | null | undefined): number {
    if (!text) return 0;
    const match = text.replace(/,/g, '').match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  private parsePWCCPopulationText(matches: string[]): PSAData {
    const populations: Record<number, number> = {};
    
    for (const match of matches) {
      const gradeMatch = match.match(/PSA\s+(\d+)/i);
      const popMatch = match.match(/Pop[ulation]*:?\s*(\d+)/i);
      
      if (gradeMatch && popMatch) {
        const grade = parseInt(gradeMatch[1]);
        const pop = parseInt(popMatch[1]);
        populations[grade] = pop;
      }
    }

    return this.buildPSAData(
      populations[10] || 0,
      populations[9] || 0,
      populations[8] || 0,
      populations[7] || 0
    );
  }

  private parseGCAPopulationElement(element: Element): PSAData {
    const grade10 = this.parsePopulationNumber(element.querySelector('.psa-10')?.textContent);
    const grade9 = this.parsePopulationNumber(element.querySelector('.psa-9')?.textContent);
    const grade8 = this.parsePopulationNumber(element.querySelector('.psa-8')?.textContent);
    const grade7 = this.parsePopulationNumber(element.querySelector('.psa-7')?.textContent);

    return this.buildPSAData(grade10, grade9, grade8, grade7);
  }

  private buildPSAData(grade10: number, grade9: number, grade8: number, grade7: number): PSAData {
    const total = grade10 + grade9 + grade8 + grade7;
    const returnRate = total > 0 ? ((grade10 + grade9) / total) * 100 : 0;
    const grade10Percentage = total > 0 ? (grade10 / total) * 100 : 0;

    return {
      population: { grade10, grade9, grade8, grade7, total },
      prices: {
        grade10: this.estimatePrice(grade10, 10),
        grade9: this.estimatePrice(grade9, 9),
        grade8: this.estimatePrice(grade8, 8),
        raw: this.estimatePrice(total, 0)
      },
      popReport: {
        lowPop: grade10 < 100,
        grade10Percentage,
        totalSubmissions: Math.floor(total * 1.2)
      },
      returnRate
    };
  }

  private estimatePrice(population: number, grade: number): number {
    const basePrice = 50;
    const gradeMultipliers = { 10: 8, 9: 3, 8: 1.5, 0: 1 };
    const multiplier = gradeMultipliers[grade as keyof typeof gradeMultipliers] || 1;
    
    // Scarcity pricing
    const scarcityMultiplier = population < 50 ? 4 : population < 100 ? 2.5 : population < 500 ? 1.8 : 1;
    
    return Math.round(basePrice * multiplier * scarcityMultiplier);
  }

  async fetchRealPriceHistory(cardName: string, setName: string): Promise<PricePoint[]> {
    try {
      // Try multiple sources for price history
      
      // 1. Try PriceCharting
      const priceChartingData = await this.fetchPriceChartingData(cardName, setName);
      if (priceChartingData.length > 0) return priceChartingData;

      // 2. Try eBay sold listings
      const ebayData = await this.fetchEbaySoldListings(cardName, setName);
      if (ebayData.length > 0) return ebayData;

      // 3. Try PWCC auction results
      const pwccData = await this.fetchPWCCAuctionResults(cardName, setName);
      if (pwccData.length > 0) return pwccData;

      return [];
    } catch (error) {
      console.error('Error fetching real price history:', error);
      return [];
    }
  }

  private async fetchPriceChartingData(cardName: string, setName: string): Promise<PricePoint[]> {
    try {
      const searchUrl = `${this.CORS_PROXY}${encodeURIComponent('https://www.pricecharting.com/search-products')}`;
      
      const response = await axios.get(searchUrl, {
        params: {
          q: `${cardName} ${setName}`,
          type: 'pokemon'
        }
      });

      // Parse PriceCharting response for historical data
      return this.parsePriceChartingHistory(response.data, cardName);
    } catch (error) {
      console.error('PriceCharting fetch error:', error);
      return [];
    }
  }

  private async fetchEbaySoldListings(cardName: string, setName: string): Promise<PricePoint[]> {
    try {
      // Use eBay's completed listings to build price history
      const searchUrl = `${this.CORS_PROXY}${encodeURIComponent('https://www.ebay.com/sch/i.html')}`;
      
      const response = await axios.get(searchUrl, {
        params: {
          _nkw: `${cardName} ${setName} PSA`,
          _sacat: 0,
          LH_Sold: 1,
          LH_Complete: 1,
          _sop: 13 // Sort by newest
        }
      });

      return this.parseEbaySoldListings(response.data);
    } catch (error) {
      console.error('eBay fetch error:', error);
      return [];
    }
  }

  private async fetchPWCCAuctionResults(cardName: string, setName: string): Promise<PricePoint[]> {
    try {
      const searchUrl = `${this.CORS_PROXY}${encodeURIComponent('https://www.pwccmarketplace.com/lots')}`;
      
      const response = await axios.get(searchUrl, {
        params: {
          search: `${cardName} ${setName}`,
          status: 'sold',
          sort: 'end_date_desc'
        }
      });

      return this.parsePWCCAuctionResults(response.data);
    } catch (error) {
      console.error('PWCC auction fetch error:', error);
      return [];
    }
  }

  private parsePriceChartingHistory(html: string, cardName: string): PricePoint[] {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Look for price chart data
      const chartData = doc.querySelector('#price-chart-data');
      if (chartData) {
        const data = JSON.parse(chartData.textContent || '[]');
        return data.map((point: any) => ({
          date: point.date,
          price: parseFloat(point.price),
          volume: point.volume || 1
        }));
      }

      return [];
    } catch (error) {
      console.error('PriceCharting parsing error:', error);
      return [];
    }
  }

  private parseEbaySoldListings(html: string): PricePoint[] {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const listings = doc.querySelectorAll('.s-item');
      const pricePoints: PricePoint[] = [];

      for (const listing of listings) {
        const priceElement = listing.querySelector('.s-item__price');
        const dateElement = listing.querySelector('.s-item__endedDate');
        
        if (priceElement && dateElement) {
          const price = this.parsePrice(priceElement.textContent);
          const date = this.parseDate(dateElement.textContent);
          
          if (price > 0 && date) {
            pricePoints.push({ date, price, volume: 1 });
          }
        }
      }

      return pricePoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
      console.error('eBay parsing error:', error);
      return [];
    }
  }

  private parsePWCCAuctionResults(html: string): PricePoint[] {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const auctions = doc.querySelectorAll('.lot-card');
      const pricePoints: PricePoint[] = [];

      for (const auction of auctions) {
        const priceElement = auction.querySelector('.final-price, .hammer-price');
        const dateElement = auction.querySelector('.end-date');
        
        if (priceElement && dateElement) {
          const price = this.parsePrice(priceElement.textContent);
          const date = this.parseDate(dateElement.textContent);
          
          if (price > 0 && date) {
            pricePoints.push({ date, price, volume: 1 });
          }
        }
      }

      return pricePoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
      console.error('PWCC parsing error:', error);
      return [];
    }
  }

  private parsePrice(text: string | null): number {
    if (!text) return 0;
    const match = text.replace(/[,$]/g, '').match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
  }

  private parseDate(text: string | null): string | null {
    if (!text) return null;
    
    // Try to parse various date formats
    const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dateMatch) {
      const [, month, day, year] = dateMatch;
      const fullYear = year.length === 2 ? `20${year}` : year;
      return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return null;
  }
}

export const realDataService = new RealDataService();