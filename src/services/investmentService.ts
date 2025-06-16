import { CardInvestmentData, MarketAnalysis, PricePoint, PSAData } from '../types/pokemon';
import { realDataService } from './realDataService';

class InvestmentService {
  async getCardInvestmentData(cardName: string, setName: string, currentPrice: number): Promise<CardInvestmentData> {
    try {
      // Fetch real PSA and price data
      const [psaData, priceHistory] = await Promise.all([
        realDataService.fetchRealPSAPopulation(cardName, setName),
        realDataService.fetchRealPriceHistory(cardName, setName)
      ]);

      // Use real data if available, otherwise fall back to estimates
      const finalPSAData = psaData || this.getEstimatedPSAData(cardName, setName);
      const finalPriceHistory = priceHistory.length > 0 ? priceHistory : this.generateEstimatedPriceHistory(currentPrice);

      const marketAnalysis = this.analyzeMarket(finalPriceHistory, currentPrice, finalPSAData);
      const investmentScore = this.calculateInvestmentScore(finalPSAData, finalPriceHistory);
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
    } catch (error) {
      console.error('Error getting investment data:', error);
      throw error;
    }
  }

  private analyzeMarket(priceHistory: PricePoint[], currentPrice: number, psaData: PSAData): MarketAnalysis {
    if (priceHistory.length < 2) {
      return this.getDefaultMarketAnalysis(currentPrice);
    }

    const prices = priceHistory.map(p => p.price);
    const recentPrices = prices.slice(-30); // Last 30 data points
    const oldPrices = prices.slice(0, 30); // First 30 data points

    // Calculate price changes using real data
    const priceChange30d = this.calculatePriceChange(prices.slice(-30), prices.slice(-60, -30));
    const priceChange90d = this.calculatePriceChange(prices.slice(-90), prices.slice(-180, -90));
    const priceChange1y = this.calculatePriceChange([currentPrice], [prices[0]]);

    // Calculate volatility from real price movements
    const volatility = this.calculateVolatility(recentPrices);

    // Determine trend based on real data patterns
    const trend = this.determineTrend(priceChange30d, priceChange90d, volatility);

    // Calculate fair value using real PSA population data
    const fairValue = this.calculateFairValue(currentPrice, psaData, priceHistory);

    // Determine if under/overvalued based on real market data
    const valuationThreshold = 0.15; // 15%
    const isUndervalued = currentPrice < fairValue * (1 - valuationThreshold);
    const isOvervalued = currentPrice > fairValue * (1 + valuationThreshold);

    // Calculate confidence based on data quality and recency
    const confidence = this.calculateConfidence(priceHistory, psaData);

    return {
      trend,
      volatility,
      priceChange30d,
      priceChange90d,
      priceChange1y,
      isUndervalued,
      isOvervalued,
      fairValue,
      confidence
    };
  }

  private calculateInvestmentScore(psaData: PSAData, priceHistory: PricePoint[]): number {
    let score = 50; // Base score

    // Real PSA population analysis
    if (psaData.popReport.lowPop) score += 25; // Low pop is very valuable
    if (psaData.population.grade10 < 50) score += 20; // Ultra low pop
    if (psaData.population.grade10 < 25) score += 15; // Extremely rare

    // PSA return rate analysis
    if (psaData.returnRate > 70) score += 15; // High grade success rate
    if (psaData.returnRate > 80) score += 10; // Exceptional grading success
    if (psaData.returnRate < 30) score -= 10; // Poor grading prospects

    // Real price trend analysis
    if (priceHistory.length >= 2) {
      const recentPrice = priceHistory[priceHistory.length - 1].price;
      const oldPrice = priceHistory[0].price;
      const growth = (recentPrice - oldPrice) / oldPrice;
      
      if (growth > 1.0) score += 25; // 100%+ growth is exceptional
      else if (growth > 0.5) score += 20; // 50%+ growth is strong
      else if (growth > 0.2) score += 10; // 20%+ growth is good
      else if (growth < -0.3) score -= 20; // Major decline is concerning
      else if (growth < -0.1) score -= 10; // Minor decline
    }

    // Grade 10 percentage impact (rarity premium)
    if (psaData.popReport.grade10Percentage < 3) score += 30; // Ultra rare grade
    else if (psaData.popReport.grade10Percentage < 5) score += 25; // Very rare grade
    else if (psaData.popReport.grade10Percentage < 10) score += 15; // Rare grade
    else if (psaData.popReport.grade10Percentage > 30) score -= 10; // Common grade

    // Market liquidity factor
    const totalVolume = priceHistory.reduce((sum, p) => sum + (p.volume || 0), 0);
    if (totalVolume > 100) score += 10; // Good liquidity
    else if (totalVolume < 20) score -= 5; // Poor liquidity

    // Price stability factor
    const priceStability = this.calculatePriceStability(priceHistory);
    if (priceStability > 0.8) score += 10; // Very stable
    else if (priceStability < 0.3) score -= 15; // Very volatile

    return Math.min(Math.max(score, 0), 100);
  }

  private calculatePriceStability(priceHistory: PricePoint[]): number {
    if (priceHistory.length < 3) return 0.5;
    
    const prices = priceHistory.map(p => p.price);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((acc, price) => acc + Math.pow(price - mean, 2), 0) / prices.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Return stability score (0-1, where 1 is most stable)
    return Math.max(0, 1 - (standardDeviation / mean));
  }

  private calculatePriceChange(recentPrices: number[], olderPrices: number[]): number {
    if (recentPrices.length === 0 || olderPrices.length === 0) return 0;
    
    const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const olderAvg = olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length;
    
    return ((recentAvg - olderAvg) / olderAvg) * 100;
  }

  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((acc, price) => acc + Math.pow(price - mean, 2), 0) / prices.length;
    
    return Math.sqrt(variance) / mean; // Coefficient of variation
  }

  private determineTrend(change30d: number, change90d: number, volatility: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const strongTrendThreshold = 20; // Increased for real market conditions
    const weakTrendThreshold = 8;

    // Consider both short and long term trends
    if (change30d > strongTrendThreshold && change90d > weakTrendThreshold && volatility < 0.4) {
      return 'BULLISH';
    } else if (change30d < -strongTrendThreshold && change90d < -weakTrendThreshold) {
      return 'BEARISH';
    } else if (change30d > weakTrendThreshold && change90d > 0) {
      return 'BULLISH';
    } else if (change30d < -weakTrendThreshold && change90d < 0) {
      return 'BEARISH';
    } else {
      return 'NEUTRAL';
    }
  }

  private calculateFairValue(currentPrice: number, psaData: PSAData, priceHistory: PricePoint[]): number {
    // Enhanced fair value calculation using real market data
    
    // Method 1: PSA scarcity premium
    const scarcityMultiplier = this.calculateScarcityMultiplier(psaData);
    
    // Method 2: Historical price trend analysis
    const trendMultiplier = this.calculateTrendMultiplier(priceHistory);
    
    // Method 3: Grade distribution premium
    const gradeMultiplier = this.calculateGradeMultiplier(psaData);
    
    // Method 4: Market liquidity adjustment
    const liquidityMultiplier = this.calculateLiquidityMultiplier(priceHistory);
    
    // Weighted fair value calculation
    const fairValue = currentPrice * (
      scarcityMultiplier * 0.3 +
      trendMultiplier * 0.25 +
      gradeMultiplier * 0.25 +
      liquidityMultiplier * 0.2
    );
    
    return Math.round(fairValue * 100) / 100;
  }

  private calculateScarcityMultiplier(psaData: PSAData): number {
    const grade10Pop = psaData.population.grade10;
    
    if (grade10Pop < 10) return 2.5; // Ultra rare
    if (grade10Pop < 25) return 2.0; // Very rare
    if (grade10Pop < 50) return 1.7; // Rare
    if (grade10Pop < 100) return 1.4; // Uncommon
    if (grade10Pop < 500) return 1.2; // Moderate
    return 1.0; // Common
  }

  private calculateTrendMultiplier(priceHistory: PricePoint[]): number {
    if (priceHistory.length < 2) return 1.0;
    
    const recentPrice = priceHistory[priceHistory.length - 1].price;
    const oldPrice = priceHistory[0].price;
    const growth = (recentPrice - oldPrice) / oldPrice;
    
    // Trend-based multiplier
    if (growth > 0.5) return 1.3; // Strong uptrend
    if (growth > 0.2) return 1.15; // Moderate uptrend
    if (growth > 0) return 1.05; // Slight uptrend
    if (growth > -0.1) return 1.0; // Stable
    if (growth > -0.2) return 0.95; // Slight downtrend
    return 0.85; // Strong downtrend
  }

  private calculateGradeMultiplier(psaData: PSAData): number {
    const grade10Percentage = psaData.popReport.grade10Percentage;
    
    if (grade10Percentage < 3) return 1.4; // Ultra selective grading
    if (grade10Percentage < 5) return 1.3; // Very selective
    if (grade10Percentage < 10) return 1.2; // Selective
    if (grade10Percentage < 20) return 1.1; // Moderate
    return 1.0; // Liberal grading
  }

  private calculateLiquidityMultiplier(priceHistory: PricePoint[]): number {
    const totalVolume = priceHistory.reduce((sum, p) => sum + (p.volume || 0), 0);
    const avgVolume = totalVolume / priceHistory.length;
    
    if (avgVolume > 20) return 1.1; // High liquidity premium
    if (avgVolume > 10) return 1.05; // Good liquidity
    if (avgVolume > 5) return 1.0; // Moderate liquidity
    return 0.95; // Low liquidity discount
  }

  private calculateConfidence(priceHistory: PricePoint[], psaData: PSAData): number {
    let confidence = 40; // Base confidence for real data
    
    // Data recency bonus
    if (priceHistory.length > 0) {
      const latestDate = new Date(priceHistory[priceHistory.length - 1].date);
      const daysSinceLatest = (Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceLatest < 30) confidence += 20; // Very recent data
      else if (daysSinceLatest < 90) confidence += 15; // Recent data
      else if (daysSinceLatest < 180) confidence += 10; // Moderately recent
    }
    
    // Data volume bonus
    if (priceHistory.length > 100) confidence += 20; // Lots of data points
    else if (priceHistory.length > 50) confidence += 15;
    else if (priceHistory.length > 20) confidence += 10;
    
    // PSA population data quality
    if (psaData.population.total > 1000) confidence += 15; // Large sample size
    else if (psaData.population.total > 500) confidence += 10;
    else if (psaData.population.total > 100) confidence += 5;
    
    // Trading volume bonus
    const totalVolume = priceHistory.reduce((sum, p) => sum + (p.volume || 0), 0);
    if (totalVolume > 200) confidence += 15; // High trading activity
    else if (totalVolume > 100) confidence += 10;
    else if (totalVolume > 50) confidence += 5;
    
    return Math.min(confidence, 95); // Cap at 95%
  }

  private calculateRiskLevel(analysis: MarketAnalysis, psaData: PSAData): 'LOW' | 'MEDIUM' | 'HIGH' {
    let riskScore = 0;
    
    // Volatility risk (based on real price movements)
    if (analysis.volatility > 0.4) riskScore += 3; // Very volatile
    else if (analysis.volatility > 0.25) riskScore += 2; // Moderately volatile
    else if (analysis.volatility > 0.15) riskScore += 1; // Slightly volatile
    
    // Population risk (scarcity can be risky)
    if (psaData.population.total < 50) riskScore += 2; // Ultra low pop is risky
    else if (psaData.population.total < 100) riskScore += 1; // Low pop has some risk
    
    // Market trend risk
    if (analysis.trend === 'BEARISH') riskScore += 2;
    else if (analysis.trend === 'NEUTRAL' && analysis.priceChange30d < -5) riskScore += 1;
    
    // Overvaluation risk
    if (analysis.isOvervalued) riskScore += 2;
    
    // Confidence risk (low confidence = higher risk)
    if (analysis.confidence < 50) riskScore += 2;
    else if (analysis.confidence < 70) riskScore += 1;
    
    // Grade distribution risk
    if (psaData.popReport.grade10Percentage > 40) riskScore += 1; // Too easy to grade
    
    if (riskScore >= 5) return 'HIGH';
    if (riskScore >= 3) return 'MEDIUM';
    return 'LOW';
  }

  private getRecommendation(
    investmentScore: number, 
    analysis: MarketAnalysis, 
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  ): 'BUY' | 'HOLD' | 'SELL' | 'WATCH' {
    // Strong buy conditions
    if (investmentScore >= 85 && analysis.isUndervalued && riskLevel === 'LOW' && analysis.trend === 'BULLISH') {
      return 'BUY';
    }
    
    // Good buy conditions
    if (investmentScore >= 75 && analysis.isUndervalued && riskLevel !== 'HIGH') {
      return 'BUY';
    }
    
    // Moderate buy conditions
    if (investmentScore >= 65 && !analysis.isOvervalued && riskLevel === 'LOW' && analysis.trend !== 'BEARISH') {
      return 'BUY';
    }
    
    // Sell conditions
    if (analysis.isOvervalued && (investmentScore < 40 || riskLevel === 'HIGH')) {
      return 'SELL';
    }
    
    if (analysis.trend === 'BEARISH' && analysis.priceChange30d < -20 && riskLevel === 'HIGH') {
      return 'SELL';
    }
    
    // Hold conditions
    if (investmentScore >= 50 && !analysis.isOvervalued && riskLevel !== 'HIGH') {
      return 'HOLD';
    }
    
    if (analysis.trend === 'BULLISH' && investmentScore >= 45) {
      return 'HOLD';
    }
    
    // Default to watch
    return 'WATCH';
  }

  private getDefaultMarketAnalysis(currentPrice: number): MarketAnalysis {
    return {
      trend: 'NEUTRAL',
      volatility: 0.15,
      priceChange30d: 0,
      priceChange90d: 0,
      priceChange1y: 0,
      isUndervalued: false,
      isOvervalued: false,
      fairValue: currentPrice,
      confidence: 30
    };
  }

  private getEstimatedPSAData(cardName: string, setName: string): PSAData {
    // Fallback estimation when real data isn't available
    const isCharizard = cardName.toLowerCase().includes('charizard');
    const isPikachu = cardName.toLowerCase().includes('pikachu');
    const isVintage = setName.includes('Base Set') || setName.includes('Jungle') || setName.includes('Fossil');
    const isModern = parseInt(setName.match(/\d{4}/)?.[0] || '2020') >= 2020;

    let basePopulation = 800;
    let grade10Rate = 0.12;

    if (isCharizard) {
      basePopulation = 4000;
      grade10Rate = 0.06;
    } else if (isPikachu) {
      basePopulation = 2500;
      grade10Rate = 0.10;
    }

    if (isVintage) {
      basePopulation *= 0.25;
      grade10Rate *= 0.4;
    } else if (isModern) {
      basePopulation *= 2.5;
      grade10Rate *= 1.8;
    }

    const grade10Pop = Math.floor(basePopulation * grade10Rate);
    const grade9Pop = Math.floor(basePopulation * 0.22);
    const grade8Pop = Math.floor(basePopulation * 0.28);
    const grade7Pop = Math.floor(basePopulation * 0.18);
    const total = grade10Pop + grade9Pop + grade8Pop + grade7Pop;

    return {
      population: { grade10: grade10Pop, grade9: grade9Pop, grade8: grade8Pop, grade7: grade7Pop, total },
      prices: {
        grade10: this.estimateGradePrice(grade10Pop, 10),
        grade9: this.estimateGradePrice(grade9Pop, 9),
        grade8: this.estimateGradePrice(grade8Pop, 8),
        raw: this.estimateGradePrice(total, 0)
      },
      popReport: {
        lowPop: grade10Pop < 100,
        grade10Percentage: (grade10Pop / total) * 100,
        totalSubmissions: Math.floor(total * 1.25)
      },
      returnRate: ((grade10Pop + grade9Pop) / total) * 100
    };
  }

  private generateEstimatedPriceHistory(currentPrice: number): PricePoint[] {
    const history: PricePoint[] = [];
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    // Generate more realistic price history
    for (let i = 0; i < 365; i += 7) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      const seasonalMultiplier = 1 + 0.2 * Math.sin((i / 365) * 2 * Math.PI);
      const volatility = 0.08 * (Math.random() - 0.5);
      const trend = (i / 365) * 0.3; // 30% growth over the year
      
      const price = currentPrice * seasonalMultiplier * (1 + trend + volatility) * 0.8; // Start lower
      
      history.push({
        date: date.toISOString().split('T')[0],
        price: Math.round(price * 100) / 100,
        volume: Math.floor(Math.random() * 30) + 5
      });
    }

    return history;
  }

  private estimateGradePrice(population: number, grade: number): number {
    const basePrice = 45;
    const gradeMultipliers = { 10: 9, 9: 3.5, 8: 1.8, 0: 1 };
    const multiplier = gradeMultipliers[grade as keyof typeof gradeMultipliers] || 1;
    
    const scarcityMultiplier = population < 25 ? 5 : population < 50 ? 3.5 : population < 100 ? 2.2 : population < 500 ? 1.6 : 1;
    
    return Math.round(basePrice * multiplier * scarcityMultiplier);
  }
}

export const investmentService = new InvestmentService();