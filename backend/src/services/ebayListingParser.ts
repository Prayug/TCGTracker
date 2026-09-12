import { queryContainsNonEnglishScript } from '../utils/scriptDetection';
import {
  detectPcFinishFamily,
  normalizeCardNumber,
  type PcFinishFamily,
} from './priceChartingClient';
import type { DealRiskFlag } from '../utils/dealScoring';

export type ParsedListingLanguage = 'en' | 'ja' | 'other' | 'unknown';

export interface ParsedGrade {
  grader: string;
  grade: string;
}

export interface ParsedEbayListing {
  cardNumber: string | null;
  collectorNumber: string | null;
  onePieceNumber: string | null;
  language: ParsedListingLanguage;
  grade: ParsedGrade | null;
  isGraded: boolean;
  finishFamily: PcFinishFamily;
  riskFlags: DealRiskFlag[];
  haystack: string;
}

const GRADE_PATTERNS: Array<{ re: RegExp; grader: string; grade: string }> = [
  { re: /\bcgc\s*[-.]?\s*10\s*(pristine|prist\.?)\b/i, grader: 'cgc', grade: '10 pristine' },
  { re: /\bbgs\s*[-.]?\s*10\s*black\b/i, grader: 'bgs', grade: '10 black' },
  { re: /\bbgs\s*[-.]?\s*black\s*label\b/i, grader: 'bgs', grade: '10 black' },
  { re: /\bbgs\s*[-.]?\s*9\.5\b/i, grader: 'bgs', grade: '9.5' },
  { re: /\bcgc\s*[-.]?\s*9\.5\b/i, grader: 'cgc', grade: '9.5' },
  { re: /\bpsa\s*[-.]?\s*10\b/i, grader: 'psa', grade: '10' },
  { re: /\bpsa\s*[-.]?\s*9\b/i, grader: 'psa', grade: '9' },
  { re: /\bpsa\s*[-.]?\s*8\b/i, grader: 'psa', grade: '8' },
  { re: /\bpsa\s*[-.]?\s*7\b/i, grader: 'psa', grade: '7' },
  { re: /\bbgs\s*[-.]?\s*10\b/i, grader: 'bgs', grade: '10' },
  { re: /\bbgs\s*[-.]?\s*9\b/i, grader: 'bgs', grade: '9' },
  { re: /\bcgc\s*[-.]?\s*10\b/i, grader: 'cgc', grade: '10' },
  { re: /\bcgc\s*[-.]?\s*9\b/i, grader: 'cgc', grade: '9' },
  { re: /\bsgc\s*[-.]?\s*10\b/i, grader: 'sgc', grade: '10' },
  { re: /\btag\s*[-.]?\s*10\b/i, grader: 'tag', grade: '10' },
  { re: /\bace\s*[-.]?\s*10\b/i, grader: 'ace', grade: '10' },
];

const ONE_PIECE_NUMBER_RE = /\b((?:OP|EB|ST|PRB)-?\d{1,2}-\d{3})\b/i;
const FRACTION_NUMBER_RE = /\b([a-z]{0,4}\d{1,4})\s*\/\s*(\d{2,4})\b/i;
const HASH_NUMBER_RE = /#\s*([a-z]{0,4}\d{1,4}[a-z]?)/i;

const RISK_PATTERNS: Array<{ re: RegExp; flag: DealRiskFlag }> = [
  { re: /\b(proxy|proxies|fake|counterfeit|bootleg)\b/i, flag: 'possible_proxy_card' },
  { re: /\b(custom|handmade|altered art|fan[\s-]?art)\b/i, flag: 'possible_custom_card' },
  { re: /\b(reproduction|replica)\b/i, flag: 'possible_authenticity_issue' },
  {
    re: /\b(digital|code\s*card|ptcgo|ptcgl|tcg\s*live|online\s*code)\b/i,
    flag: 'possible_digital_item',
  },
  { re: /\bempty\s*(box|case|tin)\b|\bno\s+cards?\b/i, flag: 'possible_empty_box' },
  { re: /\b(case\s*only|slab\s*only|holder\s*only)\b/i, flag: 'possible_case_only' },
  {
    re: /\b(lot\s+of|lots?\s+of|\d+\s*x\s*\d|\bbundle\b|wholesale\s+lot)\b/i,
    flag: 'possible_lot',
  },
  {
    re: /\b(booster\s*pack|sealed\s+pack|\betb\b|elite\s+trainer|booster\s*box)\b/i,
    flag: 'possible_pack',
  },
  {
    re: /\b(damaged|creased|heavily\s+played|\bhp\b|water\s+damage|bent|torn)\b/i,
    flag: 'possible_damaged',
  },
];

const JP_SIGNAL_RE =
  /\b(japanese|japan|jap|jpn|jp|nihongo|from\s*japan|ships?\s*from\s*japan|japan\s*(?:ver(?:sion)?|print|copy|edition)|jp(?:n)?\s*(?:ver(?:sion)?|print|copy|edition)|eevee\s*heroes|moonbreon|terastal\s*festival|sv8a|s6a|s8b|s12a|sv2a)\b|ワンピース|ワンピ(?:ース)?カード?|【|\djp\b/i;
const OTHER_LANG_RE =
  /\b(korean|\bkor\b|hangul|chinese|mandarin|cantonese|simplified\s*chinese|traditional\s*chinese)\b/i;
const ASIAN_ENGLISH_RE =
  /\basian\s*(english|eng)\b|\bae\s*(ver(?:sion)?|print|eng(?:lish)?)\b|\benglish\s*asian\b/i;
const EN_SIGNAL_RE = /\b(english|\beng\b|\busa\b|north\s*american)\b/i;
const NON_ENGLISH_SELLER_COUNTRIES = new Set(['JP', 'KR', 'CN', 'TW', 'HK', 'MO']);

export interface ParseEbayListingOptions {
  itemCountry?: string | null;
}

function normalizeOnePieceNumber(raw: string): string {
  return raw.toUpperCase().replace(/^(OP|EB|ST|PRB)-(?=\d)/, '$1');
}

function parseGrade(title: string): ParsedGrade | null {
  for (const pattern of GRADE_PATTERNS) {
    if (pattern.re.test(title)) {
      return { grader: pattern.grader, grade: pattern.grade };
    }
  }
  return null;
}

function parsePokemonNumber(
  title: string,
  grade: ParsedGrade | null
): { raw: string; collector: string } | null {
  const fraction = title.match(FRACTION_NUMBER_RE);
  if (fraction) {
    const raw = `${fraction[1]}/${fraction[2]}`;
    return { raw, collector: normalizeCardNumber(fraction[1]) };
  }
  const hashed = title.match(HASH_NUMBER_RE);
  if (hashed) {
    return { raw: hashed[1], collector: normalizeCardNumber(hashed[1]) };
  }
  const skip = new Set<string>();
  if (grade) skip.add(normalizeCardNumber(grade.grade.split(' ')[0]));
  const standalone = title.matchAll(/\b(\d{3,4})\b/g);
  for (const match of standalone) {
    const collector = normalizeCardNumber(match[1]);
    if (!collector || skip.has(collector)) continue;
    return { raw: match[1], collector };
  }
  return null;
}

function parseLanguage(
  title: string,
  description?: string | null,
  itemCountry?: string | null
): ParsedListingLanguage {
  const hay = `${title} ${description || ''}`;
  const nonLatin = queryContainsNonEnglishScript(hay);
  const asianEnglish = ASIAN_ENGLISH_RE.test(hay);
  const jp = JP_SIGNAL_RE.test(hay) || nonLatin;
  const other = OTHER_LANG_RE.test(hay) || asianEnglish;
  const en = EN_SIGNAL_RE.test(hay);
  if ((jp || other) && !en) return asianEnglish || (other && !jp) ? 'other' : 'ja';
  if (en && !jp && !other) return 'en';
  if ((jp || other) && en) return asianEnglish || (other && !jp) ? 'other' : 'ja';
  const country = (itemCountry || '').trim().toUpperCase();
  if (NON_ENGLISH_SELLER_COUNTRIES.has(country)) {
    return country === 'JP' ? 'ja' : 'other';
  }
  return 'unknown';
}

export function listingIsNonEnglish(
  title: string,
  description?: string | null,
  options?: ParseEbayListingOptions
): boolean {
  const lang = parseLanguage(title, description, options?.itemCountry);
  return lang === 'ja' || lang === 'other';
}

export function detectListingRiskFlags(title: string, description?: string | null): DealRiskFlag[] {
  const hay = `${title} ${description || ''}`;
  const flags: DealRiskFlag[] = [];
  const seen = new Set<DealRiskFlag>();
  for (const { re, flag } of RISK_PATTERNS) {
    if (re.test(hay) && !seen.has(flag)) {
      seen.add(flag);
      flags.push(flag);
    }
  }
  return flags;
}

export function parseEbayListingTitle(
  title: string,
  description?: string | null,
  options?: ParseEbayListingOptions
): ParsedEbayListing {
  const haystack = `${title} ${description || ''}`.trim();
  const grade = parseGrade(title);
  const onePieceMatch = title.match(ONE_PIECE_NUMBER_RE);
  const onePieceNumber = onePieceMatch ? normalizeOnePieceNumber(onePieceMatch[1]) : null;
  const pokemonNumber = onePieceNumber ? null : parsePokemonNumber(title, grade);

  return {
    cardNumber: pokemonNumber?.raw ?? onePieceNumber,
    collectorNumber: pokemonNumber?.collector ?? null,
    onePieceNumber,
    language: parseLanguage(title, description, options?.itemCountry),
    grade,
    isGraded: grade != null,
    finishFamily: detectPcFinishFamily(title, ''),
    riskFlags: detectListingRiskFlags(title, description),
    haystack,
  };
}

export function formatGradeLabel(grade: ParsedGrade | null, isGraded: boolean): string {
  if (!isGraded || !grade) return 'Raw';
  const company = grade.grader.toUpperCase();
  const g = grade.grade
    .split(' ')
    .map((part) => (part === 'pristine' ? 'Pristine' : part === 'black' ? 'Black' : part))
    .join(' ');
  return `${company} ${g}`;
}
