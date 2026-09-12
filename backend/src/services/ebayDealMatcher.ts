import {
  expectedPcFinishFamily,
  finishesMatch,
  normalizeCardNumber,
  titleIncludesName,
  titleIncludesNumber,
  titleIncludesSet,
  type PcFinishFamily,
} from './priceChartingClient';
import { setsSharePrintFamily } from '../utils/setPrintFamily';
import { matchConfidenceTier, type MatchConfidenceTier } from '../utils/dealScoring';
import type { ParsedEbayListing, ParsedListingLanguage } from './ebayListingParser';

export type MatchEvidenceCode =
  | 'exact_card_number'
  | 'set_match'
  | 'name_match'
  | 'language_match'
  | 'grade_match'
  | 'grading_company_match'
  | 'variant_finish_match';

export interface CatalogCardRef {
  cardId: string;
  cardName: string;
  matchName?: string | null;
  setId: string;
  setName: string;
  cardNumber?: string | null;
  rarity?: string | null;
  variantKey?: string | null;
  uniqueIdentifier: string;
  language?: string | null;
  imageSmall?: string | null;
  imageLarge?: string | null;
}

export interface ListingMatchResult {
  card: CatalogCardRef;
  confidence: number;
  confidenceTier: MatchConfidenceTier;
  evidence: MatchEvidenceCode[];
  languageMismatch: boolean;
  finishMismatch: boolean;
  reprintRisk: boolean;
}

export function listingLanguageCompatible(
  parsed: ParsedListingLanguage,
  cardLanguage?: string | null
): { ok: boolean; matched: boolean } {
  const cardLang = (cardLanguage || 'en').toLowerCase();
  if (parsed === 'other') return { ok: false, matched: false };
  if (parsed === 'unknown') {
    return { ok: cardLang === 'en', matched: false };
  }
  if (parsed === cardLang) return { ok: true, matched: true };
  return { ok: false, matched: false };
}

export function isEnglishCatalogCard(card: {
  language?: string | null;
  uniqueIdentifier?: string;
}): boolean {
  if ((card.uniqueIdentifier || '').startsWith('ja|')) return false;
  return (card.language || 'en').toLowerCase() === 'en';
}

export function finishMatchesListing(
  listingFinish: PcFinishFamily,
  cardVariant?: string | null
): boolean {
  const expected = expectedPcFinishFamily(cardVariant);
  return finishesMatch(expected, listingFinish, { allowStandardAlias: false });
}

export function scoreListingAgainstCard(
  title: string,
  parsed: ParsedEbayListing,
  card: CatalogCardRef,
  options?: { requireExactGrade?: boolean }
): ListingMatchResult | null {
  const evidence: MatchEvidenceCode[] = [];
  let confidence = 0;

  const nameForMatch = card.matchName || card.cardName;
  const hasName = titleIncludesName(title, nameForMatch) || titleIncludesName(title, card.cardName);

  const numberToCheck = parsed.onePieceNumber || parsed.collectorNumber || parsed.cardNumber;
  const cardNumber = card.cardNumber || '';
  const hasNumber =
    Boolean(numberToCheck) &&
    Boolean(cardNumber) &&
    (titleIncludesNumber(title, cardNumber) ||
      normalizeCardNumber(cardNumber) === normalizeCardNumber(numberToCheck || ''));

  const hasSet =
    Boolean(card.setName) &&
    (titleIncludesSet(title, card.setName) || setsSharePrintFamily(title, card.setName));

  if (!hasName && !(hasNumber && hasSet)) return null;

  if (hasName) {
    evidence.push('name_match');
    confidence += 0.28;
  }
  if (hasNumber) {
    evidence.push('exact_card_number');
    confidence += 0.34;
  }
  if (hasSet) {
    evidence.push('set_match');
    confidence += 0.18;
  }

  const lang = listingLanguageCompatible(parsed.language, card.language);
  if (!lang.ok) return null;
  if (lang.matched) {
    evidence.push('language_match');
    confidence += 0.08;
  }

  const finishOk = finishMatchesListing(parsed.finishFamily, card.variantKey);
  if (!finishOk) return null;
  evidence.push('variant_finish_match');
  confidence += 0.08;

  if (parsed.isGraded && parsed.grade) {
    evidence.push('grading_company_match', 'grade_match');
    confidence += 0.06;
  } else if (options?.requireExactGrade) {
    return null;
  }

  if (!hasNumber && !hasSet) return null;
  if (!hasNumber && hasSet) {
    confidence -= 0.12;
  }
  if (!hasName) {
    confidence -= 0.08;
  }

  confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));

  const reprintRisk =
    Boolean(parsed.collectorNumber) &&
    Boolean(card.setName) &&
    !titleIncludesSet(title, card.setName) &&
    hasNumber;

  return {
    card,
    confidence,
    confidenceTier: matchConfidenceTier(confidence),
    evidence,
    languageMismatch: false,
    finishMismatch: false,
    reprintRisk,
  };
}

export function pickBestListingMatch(
  title: string,
  parsed: ParsedEbayListing,
  cards: CatalogCardRef[]
): ListingMatchResult | null {
  const scored: ListingMatchResult[] = [];
  for (const card of cards) {
    const result = scoreListingAgainstCard(title, parsed, card);
    if (result) scored.push(result);
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  const second = scored[1];
  if (
    second &&
    best.confidence - second.confidence < 0.08 &&
    best.card.cardId !== second.card.cardId
  ) {
    return {
      ...best,
      confidence: Math.min(best.confidence, 0.44),
      confidenceTier: 'unresolved',
    };
  }
  return best;
}
