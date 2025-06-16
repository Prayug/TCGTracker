import React from 'react';
import { PokemonCard } from '../types/pokemon';
import { Modal } from './Modal';
import { InvestmentBadge } from './InvestmentBadge';
import { PSAPopulationChart } from './PSAPopulationChart';
import { PriceChart } from './PriceChart';
import { TrendingUp, Award, Target, AlertTriangle } from 'lucide-react';

interface InvestmentModalProps {
  card: PokemonCard | null;
  isOpen: boolean;
  onClose: () => void;
}

export const InvestmentModal: React.FC<InvestmentModalProps> = ({ card, isOpen, onClose }) => {
  if (!card || !card.investmentData) return null;

  const { investmentData } = card;
  const formattedDate = new Date(card.set.releaseDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="large">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start gap-6 mb-6">
          <img
            src={card.images.large}
            alt={card.name}
            className="w-48 rounded-xl shadow-lg flex-shrink-0"
            loading="lazy"
          />
          
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{card.name}</h2>
              <p className="text-lg text-gray-600">{card.set.name} • {formattedDate}</p>
              {card.types && card.types.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {card.types.map((type) => (
                    <span
                      key={type}
                      className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                    >
                      {type}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <InvestmentBadge investmentData={investmentData} />

            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-700">Investment Score</span>
                </div>
                <div className="text-2xl font-bold text-purple-800">
                  {investmentData.investmentScore}/100
                </div>
              </div>
              
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Award className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">PSA 10 Pop</span>
                </div>
                <div className="text-2xl font-bold text-green-800">
                  {investmentData.psaData.population.grade10.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Market Analysis */}
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Market Analysis
          </h3>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-sm text-gray-600">30-Day Change</div>
              <div className={`text-lg font-bold ${
                investmentData.marketAnalysis.priceChange30d >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {investmentData.marketAnalysis.priceChange30d >= 0 ? '+' : ''}
                {investmentData.marketAnalysis.priceChange30d.toFixed(1)}%
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-sm text-gray-600">Fair Value</div>
              <div className="text-lg font-bold text-gray-900">
                ${investmentData.marketAnalysis.fairValue.toFixed(2)}
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg text-center">
              <div className="text-sm text-gray-600">Confidence</div>
              <div className="text-lg font-bold text-blue-600">
                {investmentData.marketAnalysis.confidence}%
              </div>
            </div>
          </div>

          {/* Risk Assessment */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <span className="font-semibold text-yellow-800">Risk Assessment</span>
            </div>
            <div className="text-sm text-yellow-700">
              Risk Level: <span className="font-semibold">{investmentData.riskLevel}</span>
              {investmentData.riskLevel === 'HIGH' && (
                <span className="ml-2">⚠️ High volatility and market uncertainty</span>
              )}
              {investmentData.riskLevel === 'MEDIUM' && (
                <span className="ml-2">⚡ Moderate risk with growth potential</span>
              )}
              {investmentData.riskLevel === 'LOW' && (
                <span className="ml-2">✅ Stable investment with lower volatility</span>
              )}
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <PriceChart priceHistory={investmentData.priceHistory} />
          </div>
          
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <PSAPopulationChart psaData={investmentData.psaData} />
          </div>
        </div>
      </div>
    </Modal>
  );
};