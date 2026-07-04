import React from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Target, Award } from 'lucide-react';
import { CardInvestmentData } from '../../../types/pokemon';

interface InvestmentBadgeProps {
  investmentData: CardInvestmentData;
  compact?: boolean;
}

export const InvestmentBadge: React.FC<InvestmentBadgeProps> = ({ investmentData, compact = false }) => {
  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case 'BUY': return 'bg-gain-muted text-gain border-gain/25';
      case 'HOLD': return 'bg-accent-muted text-accent border-accent/25';
      case 'SELL': return 'bg-loss-muted text-loss border-loss/25';
      case 'WATCH': return 'bg-surface-hover text-ink-secondary border-border-default';
      default: return 'bg-surface-inset text-ink-muted border-border-default';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'BULLISH': return <TrendingUp className="w-3 h-3" aria-hidden="true" />;
      case 'BEARISH': return <TrendingDown className="w-3 h-3" aria-hidden="true" />;
      default: return <Minus className="w-3 h-3" aria-hidden="true" />;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-gain';
      case 'MEDIUM': return 'text-accent';
      case 'HIGH': return 'text-loss';
      default: return 'text-ink-muted';
    }
  };

  if (compact) {
    return (
      <div className="flex gap-1 flex-wrap">
        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getRecommendationColor(investmentData.recommendation)}`}>
          {investmentData.recommendation}
        </span>
        <span className="px-2 py-1 bg-accent-muted text-accent rounded-full text-xs font-medium flex items-center gap-1">
          <Target className="w-3 h-3" aria-hidden="true" />
          {investmentData.investmentScore}
        </span>
        {investmentData.psaData.popReport.lowPop && (
          <span className="px-2 py-1 bg-surface-hover text-ink-secondary rounded-full text-xs font-medium flex items-center gap-1">
            <Award className="w-3 h-3" aria-hidden="true" />
            Low Pop
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getRecommendationColor(investmentData.recommendation)}`}>
          {investmentData.recommendation}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-muted">Score:</span>
          <span className="font-bold text-accent">{investmentData.investmentScore}/100</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1">
          {getTrendIcon(investmentData.marketAnalysis.trend)}
          <span className="text-ink-muted">Trend:</span>
          <span className="font-medium text-ink-primary">{investmentData.marketAnalysis.trend}</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertTriangle className={`w-3 h-3 ${getRiskColor(investmentData.riskLevel)}`} aria-hidden="true" />
          <span className="text-ink-muted">Risk:</span>
          <span className={`font-medium ${getRiskColor(investmentData.riskLevel)}`}>
            {investmentData.riskLevel}
          </span>
        </div>
      </div>

      {(investmentData.marketAnalysis.isUndervalued || investmentData.marketAnalysis.isOvervalued) && (
        <div className="text-xs">
          {investmentData.marketAnalysis.isUndervalued && (
            <span className="px-2 py-1 bg-gain-muted text-gain rounded-full">
              Undervalued
            </span>
          )}
          {investmentData.marketAnalysis.isOvervalued && (
            <span className="px-2 py-1 bg-loss-muted text-loss rounded-full">
              Overvalued
            </span>
          )}
        </div>
      )}
    </div>
  );
};
