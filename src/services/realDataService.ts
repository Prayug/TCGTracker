import { PSAData, PricePoint } from '../types/pokemon';
import { seededRandom } from '../utils/random';

class RealDataService {
  // This is a MOCK service that generates realistic but fake data.
  // The original implementation attempted to scrape live websites, which is
  // brittle and unreliable for a demo application. This mock service ensures
  // the app is always populated with interesting and varied data.

  async fetchRealPSAPopulation(cardName: string, setName: string): Promise<PSAData | null> {
    // Generate a consistent seed from the card name and set name.
    // This ensures that the same card always gets the same mock data.
    const seed = cardName + setName;
    
    const grade10 = this.generatePopulation(seed, 'g10', 3, 500);
    const grade9 = this.generatePopulation(seed, 'g9', 10, 2000);
    const grade8 = this.generatePopulation(seed, 'g8', 20, 3000);
    const grade7 = this.generatePopulation(seed, 'g7', 30, 4000);
    const total = grade10 + grade9 + grade8 + grade7;

    const basePrice = this.generateBasePrice(seed, 5, 300);

    const psaData: PSAData = {
      population: {
        grade10,
        grade9,
        grade8,
        grade7,
        total,
      },
      prices: {
        grade10: basePrice * this.getPriceMultiplier(10),
        grade9: basePrice * this.getPriceMultiplier(9),
        grade8: basePrice * this.getPriceMultiplier(8),
        raw: basePrice,
      },
      popReport: {
        lowPop: total > 0 && grade10 < 100,
        grade10Percentage: total > 0 ? (grade10 / total) * 100 : 0,
        totalSubmissions: total,
      },
      returnRate: total > 0 ? ((grade9 + grade10) / total) * 100 : 0,
    };
    
    return Promise.resolve(psaData);
  }

  async fetchRealPriceHistory(cardName: string, setName: string): Promise<PricePoint[]> {
    const seed = cardName + setName;
    const pricePoints: PricePoint[] = [];
    const today = new Date();
    
    let currentPrice = this.generateBasePrice(seed, 5, 300);
    const trendFactor = (seededRandom(seed + 'trend')() - 0.5) * 0.1; // -5% to +5% monthly trend

    for (let i = 365; i > 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);

      // Fluctuate price based on trend and randomness
      const randomFactor = (seededRandom(seed + i)() - 0.5) * 0.05; // Daily noise
      currentPrice *= (1 + trendFactor / 30 + randomFactor);
      
      // Ensure price doesn't go below a floor
      currentPrice = Math.max(0.5, currentPrice);

      pricePoints.push({
        date: date.toISOString().split('T')[0],
        price: parseFloat(currentPrice.toFixed(2)),
        volume: this.generatePopulation(seed, 'vol' + i, 1, 20),
      });
    }

    return Promise.resolve(pricePoints);
  }

  private generatePopulation(seed: string, salt: string, min: number, max: number): number {
    const random = seededRandom(seed + salt)();
    return min + Math.floor(random * (max - min + 1));
  }

  private generateBasePrice(seed: string, min: number, max: number): number {
    return this.generatePopulation(seed, 'price', min, max);
  }

  private getPriceMultiplier(grade: number): number {
    const seed = 'multiplier_seed_' + grade;
    if (grade === 10) return seededRandom(seed)() * 10 + 5; // 5x - 15x
    if (grade === 9) return seededRandom(seed)() * 3 + 2;   // 2x - 5x
    if (grade === 8) return seededRandom(seed)() * 1.5 + 1; // 1x - 2.5x
    return 1;
  }
}

export const realDataService = new RealDataService();