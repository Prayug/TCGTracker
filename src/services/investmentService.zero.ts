import { CardInvestmentData, MarketAnalysis, PricePoint, PSAData, PokemonCard } from '../types/pokemon';

// A simple seeded random number generator for consistent results
const seededRandom = (seed: string) => {
  let h = 1779033703, u = 0, i = 0;
  for (i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return () => {
    h = Math.imul(h ^ h >>> 16, 2246822507);
    h = Math.imul(h ^ h >>> 13, 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};

class InvestmentService {
  async getCardInvestmentData(card: PokemonCard, currentPrice: number): Promise<CardInvestmentData> {
    const random = seededRandom(`${card.id}-${card.set.releaseDate}`);

    const finalPSAData = this.getEstimatedPSAData(card, random);
    const finalPriceHistory = this.generatePriceHistory(card, currentPrice, random);

    const marketAnalysis = this.analyzeMarket(finalPriceHistory, currentPrice, finalPSAData);
    const investmentScore = this.calculateInvestmentScore(finalPSAData, marketAnalysis);
    const riskLevel = this.calculateRiskLevel(marketAnalysis, finalPSAData);
    const recommendation = this.getRecommendation(investmentScore, marketAnalysis, riskLevel);

    return {
      psaData: finalPSAData,
      priceHistory: finalPriceHistory,
      marketAnalysis,
      investmentScore,
      riskLevel,
      recommendation
    };
  }

  private analyzeMarket(priceHistory: PricePoint[], currentPrice: number, psaData: PSAData): MarketAnalysis {
    if (priceHistory.length < 2) {
      return this.getDefaultMarketAnalysis(currentPrice);
    }

    const prices = priceHistory.map(p => p.price);
    const firstPrice = prices[0] || currentPrice;
    
    const change = ((currentPrice - firstPrice) / firstPrice) * 100;
    const priceChange30d = this.calculatePriceChange(prices.slice(-30), prices.slice(-60, -30));
    
    const volatility = this.calculateVolatility(prices);

    let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (change > 15 && volatility < 0.3) trend = 'BULLISH';
    if (change < -15 && volatility < 0.3) trend = 'BEARISH';

    const fairValue = this.calculateFairValue(currentPrice, psaData, trend);
    const isUndervalued = currentPrice < fairValue * 0.85;
    const isOvervalued = currentPrice > fairValue * 1.15;
    
    return {
      trend,
      volatility,
      priceChange30d,
      priceChange90d: change,
      priceChange1y: change,
      isUndervalued,
      isOvervalued,
      fairValue,
      confidence: Math.round(Math.max(30, 100 - volatility * 200 - (psaData.popReport.lowPop ? 0 : 10))),
    };
  }

  private calculateInvestmentScore(psaData: PSAData, analysis: MarketAnalysis): number {
    let score = 50;
    
    if (psaData.popReport.lowPop) score += 15;
    if (psaData.popReport.grade10Percentage < 10) score += 10;
    if (psaData.returnRate > 60) score += 5;

    if (analysis.trend === 'BULLISH') score += 15;
    if (analysis.trend === 'BEARISH') score -= 15;
    if (analysis.isUndervalued) score += 20;
    if (analysis.isOvervalued) score -= 20;
    if (analysis.volatility < 0.1) score += 10;

    return Math.min(Math.max(score, 5), 95);
  }

  private calculatePriceChange(recentPrices: number[], olderPrices: number[]): number {
    if (recentPrices.length === 0 || olderPrices.length === 0) return 0;
    
    const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const olderAvg = olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length;
    
    if (olderAvg === 0) return 0;

    return ((recentAvg - olderAvg) / olderAvg) * 100;
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    if (mean === 0) return 0;

    const variance = prices.reduce((acc, price) => acc + Math.pow(price - mean, 2), 0) / prices.length;
    
    return Math.sqrt(variance) / mean; // Coefficient of variation
  }

  private calculateFairValue(currentPrice: number, psaData: PSAData, trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'): number {
    let multiplier = 1.0;
    
    if (psaData.popReport.lowPop) multiplier += 0.15;
    if (psaData.popReport.grade10Percentage < 10) multiplier += 0.1;
    if (trend === 'BULLISH') multiplier += 0.1;
    if (trend === 'BEARISH') multiplier -= 0.1;

    return currentPrice * multiplier;
  }

  private calculateRiskLevel(analysis: MarketAnalysis, psaData: PSAData): 'LOW' | 'MEDIUM' | 'HIGH' {
    let risk = 50;

    risk += analysis.volatility * 300;
    if (analysis.isOvervalued) risk += 20;
    if (psaData.popReport.lowPop) risk -= 10;

    if (risk > 70) return 'HIGH';
    if (risk > 40) return 'MEDIUM';
    return 'LOW';
  }

  private getRecommendation(
    investmentScore: number, 
    analysis: MarketAnalysis, 
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  ): 'BUY' | 'HOLD' | 'SELL' | 'WATCH' {
    if (investmentScore > 75 && analysis.isUndervalued && riskLevel === 'LOW') return 'BUY';
    if (investmentScore > 65 && analysis.isUndervalued) return 'BUY';
    if (investmentScore < 35 && analysis.isOvervalued) return 'SELL';
    if (riskLevel === 'HIGH' && investmentScore < 50) return 'SELL';
    
    if (analysis.trend === 'BULLISH' && riskLevel !== 'HIGH') return 'HOLD';
    if (analysis.trend === 'BEARISH') return 'WATCH';

    return 'HOLD';
  }

  private getDefaultMarketAnalysis(currentPrice: number): MarketAnalysis {
    return {
      trend: 'NEUTRAL',
      volatility: 0,
      priceChange30d: 0,
      priceChange90d: 0,
      priceChange1y: 0,
      isUndervalued: false,
      isOvervalued: false,
      fairValue: currentPrice,
      confidence: 30
    };
  }

  private getEstimatedPSAData(card: PokemonCard, random: () => number): PSAData {
    const basePop = 500 + random() * 4500;
    let grade10Pop = basePop * (0.1 + random() * 0.4);

    const rarity = card.rarity?.toLowerCase() || '';
    if (rarity.includes('rare') || rarity.includes('promo')) {
      grade10Pop /= (2 + random() * 2);
    }
    if (rarity.includes('holo') || rarity.includes('secret')) {
      grade10Pop /= (3 + random() * 3);
    }
    if (rarity.includes('ultra') || rarity.includes('amazing')) {
      grade10Pop /= (4 + random() * 4);
    }
    
    grade10Pop = Math.max(5, Math.floor(grade10Pop));

    const totalGraded = grade10Pop * (2 + random() * 5);
    const grade9 = Math.floor(totalGraded * (0.3 + random() * 0.2));
    const grade8 = Math.floor(totalGraded * (0.1 + random() * 0.1));
    const grade7 = Math.floor(totalGraded * (0.05 + random() * 0.05));
    
    const grade10Percentage = (grade10Pop / totalGraded) * 100;

    return {
      population: {
        grade10: grade10Pop,
        grade9,
        grade8,
        grade7,
        total: totalGraded
      },
      prices: {
        grade10: card.tcgplayer?.prices?.holofoil?.market ? card.tcgplayer.prices.holofoil.market * (3 + random() * 2) : 0,
        grade9: card.tcgplayer?.prices?.holofoil?.market ? card.tcgplayer.prices.holofoil.market * (1.5 + random()) : 0,
        grade8: card.tcgplayer?.prices?.holofoil?.market ? card.tcgplayer.prices.holofoil.market * (1.1 + random() * 0.2) : 0,
        raw: card.tcgplayer?.prices?.holofoil?.market || 0
      },
      popReport: {
        lowPop: grade10Pop < 100,
        grade10Percentage: parseFloat(grade10Percentage.toFixed(2)),
        totalSubmissions: totalGraded,
      },
      returnRate: parseFloat(((grade10Pop + grade9) / totalGraded * 100).toFixed(2)),
    };
  }

  private generatePriceHistory(card: PokemonCard, currentPrice: number, random: () => number): PricePoint[] {
    const history: PricePoint[] = [];
    const days = 90;
    
    if (currentPrice <= 0) return [];

    let price = currentPrice;
    const trend = (random() - 0.4) * 0.02; // -0.008 to +0.012 daily trend
    const volatility = 0.05 + random() * 0.2; // 5% to 25% volatility

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      
      const fluctuation = (random() - 0.5) * 2 * price * volatility;
      price -= (price * trend) - fluctuation;

      // Ensure price doesn't go below a certain threshold
      price = Math.max(0.01, price);
      
      history.push({
        date: date.toISOString().split('T')[0],
        price: parseFloat(price.toFixed(2)),
        volume: Math.floor(random() * (price > 50 ? 5 : 10) + 1)
      });
    }

    // Normalize so the last price is the current price
    const lastGeneratedPrice = history[history.length - 1].price;
    const adjustmentFactor = currentPrice / lastGeneratedPrice;

    const normalizedHistory = history.map(p => ({
      ...p,
      price: parseFloat((p.price * adjustmentFactor).toFixed(2))
    }));

    return normalizedHistory;
  }
}

export const investmentService = new InvestmentService(); 