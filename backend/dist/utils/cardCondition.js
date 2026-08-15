"use strict";
/**
 * Raw TCG condition vs TCGTracker NM canonical marks.
 * Graded listings still use exact company/grade prices — this is ungraded only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAW_CONDITION_FACTOR = exports.RAW_CONDITION_LABELS = void 0;
exports.parseRawCardCondition = parseRawCardCondition;
exports.applyConditionToNmMarket = applyConditionToNmMarket;
exports.formatRawGradeLabel = formatRawGradeLabel;
exports.RAW_CONDITION_LABELS = {
    nm: 'NM',
    lp: 'LP',
    mp: 'MP',
    hp: 'HP',
    damaged: 'Damaged',
    unknown: 'Raw',
};
/** Share of a Near Mint mark. Used only when we do not have condition-specific comps. */
exports.RAW_CONDITION_FACTOR = {
    nm: 1,
    unknown: 1,
    lp: 0.7,
    mp: 0.5,
    hp: 0.35,
    damaged: 0.2,
};
const TITLE_RULES = [
    { re: /\b(water\s*damage|creased|torn|damaged)\b/i, condition: 'damaged' },
    { re: /\bheavily\s*played\b/i, condition: 'hp' },
    { re: /\bmoderately\s*played\b/i, condition: 'mp' },
    { re: /\blightly\s*played\b/i, condition: 'lp' },
    { re: /\bnear\s*mint(?:\s*or\s*better)?\b/i, condition: 'nm' },
    { re: /\bnm[\s/-]*mint\b|\bnm[\s/-]*m\b/i, condition: 'nm' },
];
const ABBREV_RULES = [
    { re: /(^|[\s,;|/(-])dmg(\b|[\s,;|/-])/i, condition: 'damaged' },
    { re: /(^|[\s,;|/(-])mp(\b|[\s,;|/-])/i, condition: 'mp' },
    { re: /(^|[\s,;|/(-])lp(\b|[\s,;|/-])/i, condition: 'lp' },
    { re: /(^|[\s,;|/(-])nm(\b|[\s,;|/-])/i, condition: 'nm' },
];
const DESCRIPTOR_RULES = [
    { re: /damaged/i, condition: 'damaged' },
    { re: /heavily\s*played/i, condition: 'hp' },
    { re: /moderately\s*played/i, condition: 'mp' },
    { re: /lightly\s*played/i, condition: 'lp' },
    { re: /near\s*mint/i, condition: 'nm' },
];
const EBAY_CONDITION_RULES = [
    { re: /\b(acceptable|for\s*parts)\b/i, condition: 'hp' },
    { re: /\bgood\b/i, condition: 'mp' },
    { re: /\bvery\s*good\b/i, condition: 'lp' },
    { re: /\b(like\s*new|brand\s*new|new)\b/i, condition: 'nm' },
];
const EBAY_CONDITION_IDS = {
    '1000': 'nm',
    '1500': 'nm',
    '1750': 'lp',
    '3000': 'unknown',
    '4000': 'lp',
    '5000': 'mp',
    '6000': 'hp',
    '7000': 'damaged',
};
function firstMatch(text, rules) {
    for (const rule of rules) {
        if (rule.re.test(text))
            return rule.condition;
    }
    return null;
}
function parseRawCardCondition(input) {
    const hay = `${input.title} ${input.description || ''}`.trim();
    const fromTitle = firstMatch(hay, TITLE_RULES) || firstMatch(hay, ABBREV_RULES);
    if (fromTitle) {
        return pack(fromTitle, 'title');
    }
    for (const descriptor of input.conditionDescriptors || []) {
        const fromDescriptor = firstMatch(descriptor, DESCRIPTOR_RULES);
        if (fromDescriptor)
            return pack(fromDescriptor, 'descriptor');
    }
    const id = (input.ebayConditionId || '').trim();
    if (id && EBAY_CONDITION_IDS[id] && EBAY_CONDITION_IDS[id] !== 'unknown') {
        return pack(EBAY_CONDITION_IDS[id], 'ebay');
    }
    const ebayText = input.ebayCondition || '';
    const fromEbay = firstMatch(ebayText, EBAY_CONDITION_RULES);
    if (fromEbay)
        return pack(fromEbay, 'ebay');
    return pack('unknown', 'default');
}
function pack(condition, source) {
    return {
        condition,
        label: exports.RAW_CONDITION_LABELS[condition],
        factor: exports.RAW_CONDITION_FACTOR[condition],
        source,
    };
}
function applyConditionToNmMarket(nmValue, parsed) {
    const nm = Number(nmValue);
    const factor = parsed.factor;
    if (!Number.isFinite(nm) || nm <= 0) {
        return { marketValue: nm, nmMarketValue: nm, factor };
    }
    return {
        nmMarketValue: Math.round(nm * 100) / 100,
        factor,
        marketValue: Math.round(nm * factor * 100) / 100,
    };
}
function formatRawGradeLabel(parsed) {
    if (parsed.condition === 'unknown')
        return 'Raw';
    return `Raw · ${parsed.label}`;
}
