"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listingLanguageCompatible = listingLanguageCompatible;
exports.isEnglishCatalogCard = isEnglishCatalogCard;
exports.finishMatchesListing = finishMatchesListing;
exports.scoreListingAgainstCard = scoreListingAgainstCard;
exports.pickBestListingMatch = pickBestListingMatch;
const priceChartingClient_1 = require("./priceChartingClient");
const setPrintFamily_1 = require("../utils/setPrintFamily");
const dealScoring_1 = require("../utils/dealScoring");
function listingLanguageCompatible(parsed, cardLanguage) {
    const cardLang = (cardLanguage || 'en').toLowerCase();
    if (parsed === 'other')
        return { ok: false, matched: false };
    if (parsed === 'unknown') {
        return { ok: cardLang === 'en', matched: false };
    }
    if (parsed === cardLang)
        return { ok: true, matched: true };
    return { ok: false, matched: false };
}
function isEnglishCatalogCard(card) {
    if ((card.uniqueIdentifier || '').startsWith('ja|'))
        return false;
    return (card.language || 'en').toLowerCase() === 'en';
}
function finishMatchesListing(listingFinish, cardVariant) {
    const expected = (0, priceChartingClient_1.expectedPcFinishFamily)(cardVariant);
    return (0, priceChartingClient_1.finishesMatch)(expected, listingFinish, { allowStandardAlias: false });
}
function scoreListingAgainstCard(title, parsed, card, options) {
    const evidence = [];
    let confidence = 0;
    const nameForMatch = card.matchName || card.cardName;
    const hasName = (0, priceChartingClient_1.titleIncludesName)(title, nameForMatch) || (0, priceChartingClient_1.titleIncludesName)(title, card.cardName);
    const numberToCheck = parsed.onePieceNumber || parsed.collectorNumber || parsed.cardNumber;
    const cardNumber = card.cardNumber || '';
    const hasNumber = Boolean(numberToCheck) &&
        Boolean(cardNumber) &&
        ((0, priceChartingClient_1.titleIncludesNumber)(title, cardNumber) ||
            (0, priceChartingClient_1.normalizeCardNumber)(cardNumber) === (0, priceChartingClient_1.normalizeCardNumber)(numberToCheck || ''));
    const hasSet = Boolean(card.setName) &&
        ((0, priceChartingClient_1.titleIncludesSet)(title, card.setName) || (0, setPrintFamily_1.setsSharePrintFamily)(title, card.setName));
    if (!hasName && !(hasNumber && hasSet))
        return null;
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
    if (!lang.ok)
        return null;
    if (lang.matched) {
        evidence.push('language_match');
        confidence += 0.08;
    }
    const finishOk = finishMatchesListing(parsed.finishFamily, card.variantKey);
    if (!finishOk)
        return null;
    evidence.push('variant_finish_match');
    confidence += 0.08;
    if (parsed.isGraded && parsed.grade) {
        evidence.push('grading_company_match', 'grade_match');
        confidence += 0.06;
    }
    else if (options === null || options === void 0 ? void 0 : options.requireExactGrade) {
        return null;
    }
    if (!hasNumber && !hasSet)
        return null;
    if (!hasNumber && hasSet) {
        confidence -= 0.12;
    }
    if (!hasName) {
        confidence -= 0.08;
    }
    confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
    const reprintRisk = Boolean(parsed.collectorNumber) &&
        Boolean(card.setName) &&
        !(0, priceChartingClient_1.titleIncludesSet)(title, card.setName) &&
        hasNumber;
    return {
        card,
        confidence,
        confidenceTier: (0, dealScoring_1.matchConfidenceTier)(confidence),
        evidence,
        languageMismatch: false,
        finishMismatch: false,
        reprintRisk,
    };
}
function pickBestListingMatch(title, parsed, cards) {
    const scored = [];
    for (const card of cards) {
        const result = scoreListingAgainstCard(title, parsed, card);
        if (result)
            scored.push(result);
    }
    if (scored.length === 0)
        return null;
    scored.sort((a, b) => b.confidence - a.confidence);
    const best = scored[0];
    const second = scored[1];
    if (second && best.confidence - second.confidence < 0.08 && best.card.cardId !== second.card.cardId) {
        return {
            ...best,
            confidence: Math.min(best.confidence, 0.44),
            confidenceTier: 'unresolved',
        };
    }
    return best;
}
