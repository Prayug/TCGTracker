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
    | 'uniqueIdentifier'
    | 'variantKey'
  >
): PokemonCard {
  const productId = productIdFromCardId(source.cardId, source.tcgplayerProductId);
  const cardNumber = cleanCardNumber(source.cardNumber) || productId || '';
  const variantKey = source.variantKey || undefined;
  return {
    id: source.cardId,
    name: source.cardName,
    uniqueIdentifier: source.uniqueIdentifier,
    preferredVariant: variantKey,
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
    tcgplayer: productId
      ? {
          productId,
          // Seed the predicted finish so InvestmentModal doesn't fall back to
          // a sparse "Normal" option when tcgplayer.prices is otherwise empty.
          prices: variantKey
            ? { [variantKey]: { market: source.currentPrice } }
            : undefined,
        }
      : variantKey
        ? { prices: { [variantKey]: { market: source.currentPrice } } }
        : undefined,
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
    | 'uniqueIdentifier'
    | 'variantKey'
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
    uniqueIdentifier: detail.uniqueIdentifier,
    variantKey: detail.variantKey,
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
    predicted180dLow: detail.predicted180d?.low ?? null,
    predicted180dMid: detail.predicted180d?.mid ?? null,
    predicted180dHigh: detail.predicted180d?.high ?? null,
    predicted365dLow: detail.predicted365d?.low ?? null,
    predicted365dMid: detail.predicted365d?.mid ?? null,
    predicted365dHigh: detail.predicted365d?.high ?? null,
    expected7dReturn: detail.expected7dReturn,
    expected30dReturn: detail.expected30dReturn,
    expected90dReturn: detail.expected90dReturn,
    expected180dReturn: detail.expected180dReturn ?? null,
    expected365dReturn: detail.expected365dReturn ?? null,
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
