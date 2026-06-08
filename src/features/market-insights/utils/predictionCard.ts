import { PokemonCard } from '../../../types/pokemon';
import { CardPrediction, CardPredictionDetail } from '../types';

function cleanCardNumber(value?: string): string {
  if (!value) return '';
  return value.replace(/^#/, '').trim();
}

function productIdFromCardId(cardId: string, explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (cardId.startsWith('tcgcsv-')) return cardId.slice('tcgcsv-'.length);
  return undefined;
}

export function buildPokemonCardFromPrediction(
  source: Pick<
    CardPrediction,
    | 'cardId'
    | 'cardName'
    | 'setId'
    | 'setName'
    | 'cardNumber'
    | 'rarity'
    | 'currentPrice'
    | 'imageSmall'
    | 'imageLarge'
    | 'tcgplayerProductId'
  >
): PokemonCard {
  const productId = productIdFromCardId(source.cardId, source.tcgplayerProductId);
  const cardNumber = cleanCardNumber(source.cardNumber) || productId || '';
  return {
    id: source.cardId,
    name: source.cardName,
    images: {
      small: source.imageSmall || '',
      large: source.imageLarge || source.imageSmall || '',
    },
    set: {
      id: source.setId,
      name: source.setName,
      releaseDate: '',
      total: 0,
    },
    number: cardNumber,
    rarity: source.rarity || undefined,
    marketPrice: source.currentPrice,
    tcgplayer: productId ? { productId } : undefined,
  };
}

/** Card display data from prediction payload (no extra network calls). */
export function resolvePredictionCard(
  source: Pick<
    CardPrediction,
    | 'cardId'
    | 'cardName'
    | 'setId'
    | 'setName'
    | 'cardNumber'
    | 'rarity'
    | 'currentPrice'
    | 'imageSmall'
    | 'imageLarge'
    | 'tcgplayerProductId'
  >
): PokemonCard {
  return buildPokemonCardFromPrediction(source);
}

export function predictionFromDetail(detail: CardPredictionDetail['prediction']): CardPrediction {
  return {
    id: detail.id,
    cardId: detail.cardId,
    cardName: detail.cardName,
    setId: detail.setId,
    setName: detail.setName,
    cardNumber: detail.cardNumber,
    rarity: detail.rarity,
    imageSmall: detail.imageSmall,
    imageLarge: detail.imageLarge,
    tcgplayerProductId: detail.tcgplayerProductId,
    currentPrice: detail.currentPrice,
    predicted7dLow: detail.predicted7d.low,
    predicted7dMid: detail.predicted7d.mid,
    predicted7dHigh: detail.predicted7d.high,
    predicted30dLow: detail.predicted30d.low,
    predicted30dMid: detail.predicted30d.mid,
    predicted30dHigh: detail.predicted30d.high,
    predicted90dLow: detail.predicted90d.low,
    predicted90dMid: detail.predicted90d.mid,
    predicted90dHigh: detail.predicted90d.high,
    expected7dReturn: detail.expected7dReturn,
    expected30dReturn: detail.expected30dReturn,
    expected90dReturn: detail.expected90dReturn,
    confidenceScore: detail.confidenceScore,
    riskScore: detail.riskScore,
    category: detail.category,
    suggestedAction: detail.suggestedAction,
    explanation: detail.explanation,
    riskFactors: detail.riskFactors,
    externalSignals: detail.externalSignals,
    modelVersion: '1.0.0',
  };
}
