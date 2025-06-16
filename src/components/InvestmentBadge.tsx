import React from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Target, Award } from 'lucide-react';
import { CardInvestmentData } from '../types/pokemon';

interface InvestmentBadgeProps {
  investmentData: CardInvestmentData;
  compact?: boolean;
}

export const InvestmentBadge: React.FC<InvestmentBadgeProps> = ({ investmentData, compact = false }) => {
  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case 'BUY': return 'bg-green-100 text-green-800 border-green-200';
      case 'HOLD': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'SELL': return 'bg-red-100 text-red-800 border-red-200';
      case 'WATCH': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'BULLISH': return <TrendingUp className="w-3 h-3" />;
      case 'BEARISH': return <TrendingDown className="w-3 h-3" />;
      default: return <Minus className="w-3 h-3" />;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-green-600';
      case 'MEDIUM': return 'text-yellow-600';
      case 'HIGH': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  if (compact) {
    return (
      <div className="flex gap-1 flex-wrap">
        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getRecommendationColor(investmentData.recommendation)}`}>
          {investmentData.recommendation}
        </span>
        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium flex items-center gap-1">
          <Target className="w-3 h-3" />
          {investmentData.investmentScore}
        </span>
        {investmentData.psaData.popReport.lowPop && (
          <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium flex items-center gap-1">
            <Award className="w-3 h-3" />
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
          <span className="text-sm text-gray-600">Score:</span>
          <span className="font-bold text-purple-600">{investmentData.investmentScore}/100</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1">
          {getTrendIcon(investmentData.marketAnalysis.trend)}
          <span className="text-gray-600">Trend:</span>
          <span className="font-medium">{investmentData.marketAnalysis.trend}</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertTriangle className={`w-3 h-3 ${getRiskColor(investmentData.riskLevel)}`} />
          <span className="text-gray-600">Risk:</span>
          <span className={`font-medium ${getRiskColor(investmentData.riskLevel)}`}>
            {investmentData.riskLevel}
          </span>
        </div>
      </div>

      {(investmentData.marketAnalysis.isUndervalued || investmentData.marketAnalysis.isOvervalued) && (
        <div className="text-xs">
          {investmentData.marketAnalysis.isUndervalued && (
            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">
              💎 Undervalued
            </span>
          )}
          {investmentData.marketAnalysis.isOvervalued && (
            <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full">
              ⚠️ Overvalued
            </span>
          )}
        </div>
      )}
    </div>
  );
};