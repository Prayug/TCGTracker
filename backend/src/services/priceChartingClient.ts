import { numberLooksSecretRare, setLooksLikeSubsetPrint } from '../utils/setPrintFamily';
import {
  detectOpPrintFamily,
  expectedOpPrintFamily,
  opFamilyAllowsSetMismatch,
  opFamilySearchTerms,
  opFamilySlug,
  opPrintFamiliesMatch,
  opSearchSetName,
  opSetNamesMatch,
  stripOpNameDecorators,
  stripOpPeriodsForSlug,
} from './onePiecePriceCharting';

const REQUEST_TIMEOUT_MS = 20000;
const REQUEST_DELAY_MS = 1500;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('request_timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

/** Decode common HTML entities found in PriceCharting meta/title attributes. */
export const decodeHtmlEntities = (value?: string): string =>
  (value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

export const normalize = (value?: string): string =>
  decodeHtmlEntities(value).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Collector numbers for equality checks: "034"→"34", "212/203"→"212", "gg44" stays.
 * Do NOT use raw substring includes() against normalized titles — "34" matches inside "114".
 */
export const normalizeCardNumber = (cardNumber?: string): string => {
  if (!cardNumber) return '';
  let s = decodeHtmlEntities(cardNumber).toLowerCase().trim();
  if (s.includes('/')) s = s.split('/')[0].trim();
  s = s.replace(/^#/, '').trim();
  const hyphenated = s.replace(/\s+/g, '');
  // One Piece codes: OP01-003, ST01-001, P-001. Keep the prefix so "003" ≠ OP01-003.
  if (/^[a-z]+\d*-\d+[a-z]*$/i.test(hyphenated)) {
    return hyphenated.replace(/[^a-z0-9]/g, '');
  }
  s = hyphenated.replace(/[^a-z0-9]/g, '');
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s;
};

/** Collector numbers explicitly marked in a PC title (#34) or URL slug (...-34). */
export const extractCardNumbers = (text?: string): string[] => {
  if (!text) return [];
  const t = decodeHtmlEntities(text).toLowerCase();
  const found = new Set<string>();
  const add = (raw: string) => {
    const n = normalizeCardNumber(raw);
    if (n) found.add(n);
  };
  // Hyphenated TCG codes first so #OP01-003 is not truncated to OP01.
  for (const m of t.matchAll(/#\s*([a-z]+\d*-\d+[a-z]*)/g)) add(m[1]);
  for (const m of t.matchAll(/-([a-z]+\d+-\d+[a-z]*)(?:\?|#|$|\/)/g)) add(m[1]);
  for (const m of t.matchAll(/\b([a-z]+\d+-\d+[a-z]*)\b/g)) add(m[1]);
  for (const m of t.matchAll(/#\s*([a-z]*\d+[a-z]*)/g)) add(m[1]);
  for (const m of t.matchAll(/-([a-z]*\d+[a-z]*)(?:\?|#|$|\/)/g)) add(m[1]);
  return [...found];
};

const cleanSetName = (value?: string): string =>
  decodeHtmlEntities(value)
    .toLowerCase()
    .replace(/[^a-z0-9&']/g, ' ');

/**
 * Company-graded condition labels present on PriceCharting product pages.
 * Plain "Grade N" rows are a generic price-by-condition guide, NOT company
 * slab prices — we deliberately exclude them so we never present them as real
 * PSA/CGC slab values.
 */
export const COMPANY_LABELS: ReadonlyArray<{ label: string; grader: string; grade: string }> = [
  { label: 'Ungraded', grader: 'ungraded', grade: 'ungraded' },
  { label: 'PSA 10', grader: 'psa', grade: '10' },
  { label: 'CGC 10', grader: 'cgc', grade: '10' },
  { label: 'CGC 10 Pristine', grader: 'cgc', grade: '10 pristine' },
  { label: 'CGC 10 Prist.', grader: 'cgc', grade: '10 pristine' },
  { label: 'BGS 10', grader: 'bgs', grade: '10' },
  { label: 'BGS 10 Black', grader: 'bgs', grade: '10 black' },
  { label: 'SGC 10', grader: 'sgc', grade: '10' },
  { label: 'TAG 10', grader: 'tag', grade: '10' },
  { label: 'ACE 10', grader: 'ace', grade: '10' },
];

export interface SearchCandidate {
  productId: string;
  url: string;
  title: string;
  setName: string;
}

export interface ProductMatchInput {
  cardName: string;
  setName?: string;
  cardNumber?: string;
  /** TCGPlayer finish key (reverseHolofoil, 1stEdition, holofoil, …) or OP print family. */
  variant?: string;
  /** OPTCG image id (OP01-003_p1) — used to detect One Piece print family. */
  cardImageId?: string;
  game?: 'pokemon' | 'onepiece';
  /**
   * When true, accept an untagged/standard PC product for a reverse or 1st-edition
   * request. Only set after confirming PriceCharting has no dedicated finish SKU
   * (e.g. Southern Islands listed solely as reverseHolofoil on TCGPlayer).
   */
  allowStandardFinishAlias?: boolean;
}

/**
 * PriceCharting files reverse / 1st-edition prints as separate products
 * (`…-reverse-holo-47`, title `[Reverse Holo]`). Untagged pages are the
 * unlimited / standard print. Matching name+set+number without finish is
 * how reverse history gets overwritten by the cheap base card.
 */
export type PcFinishFamily = 'standard' | 'reverse' | '1stedition' | '1steditionreverse';

const hasReverseFinish = (hay: string): boolean => /reverse[\s\-]*holo/.test(hay);
const hasFirstEditionFinish = (hay: string): boolean =>
  /1st[\s\-]*edition/.test(hay) || /first[\s\-]*edition/.test(hay);

export const detectPcFinishFamily = (
  title?: string | null,
  url?: string | null
): PcFinishFamily => {
  const hay = `${title || ''} ${url || ''}`.toLowerCase();
  const reverse = hasReverseFinish(hay);
  const firstEd = hasFirstEditionFinish(hay);
  if (reverse && firstEd) return '1steditionreverse';
  if (reverse) return 'reverse';
  if (firstEd) return '1stedition';
  return 'standard';
};

export const expectedPcFinishFamily = (variant?: string | null): PcFinishFamily => {
  const v = (variant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const reverse = v.includes('reverse');
  const firstEd = v.includes('1stedition') || v.includes('firstedition');
  if (reverse && firstEd) return '1steditionreverse';
  if (reverse) return 'reverse';
  if (firstEd) return '1stedition';
  return 'standard';
};

export const pcFinishSlug = (family: PcFinishFamily): string => {
  switch (family) {
    case 'reverse':
      return 'reverse-holo';
    case '1stedition':
      return '1st-edition';
    case '1steditionreverse':
      return '1st-edition-reverse-holo';
    default:
      return '';
  }
};

export const pcFinishSearchTerms = (variant?: string | null): string => {
  const family = expectedPcFinishFamily(variant);
  switch (family) {
    case 'reverse':
      return 'reverse holo';
    case '1stedition':
      return '1st edition';
    case '1steditionreverse':
      return '1st edition reverse holo';
    default:
      return '';
  }
};

/** Map a PriceCharting product back onto our variantKey vocabulary. */
export const inferVariantKeyFromPc = (
  title?: string | null,
  url?: string | null
): string => {
  switch (detectPcFinishFamily(title, url)) {
    case 'reverse':
      return 'reverseholofoil';
    case '1steditionreverse':
      return '1steditionholofoil';
    case '1stedition':
      return '1stedition';
    default:
      return 'normal';
  }
};

export const finishesMatch = (
  expected: PcFinishFamily,
  detected: PcFinishFamily,
  options?: { allowStandardAlias?: boolean }
): boolean => {
  if (expected === detected) return true;
  // Alias only untagged PC pages onto reverse/1st requests — never the reverse.
  if (
    options?.allowStandardAlias &&
    expected !== 'standard' &&
    detected === 'standard'
  ) {
    return true;
  }
  return false;
};

export interface ProductMatch {
  productId: string;
  url: string;
  title: string;
  setName: string;
  matchScore: number;
}

export interface ParsedSlabPrice {
  grader: string;
  grade: string;
  price: number | null;
  soldListings: number;
  lastSoldDate: string | null;
  lastSoldPrice: number | null;
}

export interface PriceChartingPageData {
  productId: string | null;
  title: string | null;
  setName: string | null;
  psaPop: number[] | null;
  cgcPop: number[] | null;
  gradedPrices: ParsedSlabPrice[];
}

let lastScrapeTime = 0;

const throttle = async (delayMs: number): Promise<void> => {
  const now = Date.now();
  const elapsed = now - lastScrapeTime;
  if (elapsed < delayMs) {
    await delay(delayMs - elapsed);
  }
  lastScrapeTime = Date.now();
};

/**
 * A lower delay for the bulk nightly sweep (default on-demand calls keep the
 * conservative 1.5s). Shared module state means the sweep and on-demand
 * requests all respect the tighter gap.
 */
export const fetchPriceChartingHtml = async (
  url: string,
  delayMs: number = REQUEST_DELAY_MS
): Promise<string> => {
  await throttle(delayMs);
  // PriceCharting rate-limits bursty traffic; back off and retry on 429.
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await withTimeout(
      fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
      REQUEST_TIMEOUT_MS + 2000
    );
    if (response.status === 429) {
      await delay(15000 * (attempt + 1));
      continue;
    }
    if (!response.ok) {
      throw new Error(`pricecharting_${response.status}`);
    }
    const html = await response.text();
    // Cloudflare interstitial / soft blocks come back as 200 with a challenge page.
    if (
      html.includes('Just a moment...') ||
      html.includes('cf-browser-verification') ||
      html.includes('Enable JavaScript and cookies to continue')
    ) {
      throw new Error('pricecharting_challenge');
    }
    return html;
  }
  throw new Error('pricecharting_429');
};

export const parseSearchRows = (html: string): SearchCandidate[] => {
  const rows: SearchCandidate[] = [];
  const rowRegex = /<tr id="product-(\d+)"([\s\S]*?)<\/tr>/g;
  let match: RegExpExecArray | null = rowRegex.exec(html);
  while (match) {
    const [, productId, rowBody] = match;

    let url = '';
    let title = '';
    const anchorRegex = /<a href="(https:\/\/www\.pricecharting\.com\/game\/[^"]+)"[^>]*>\s*([\s\S]*?)<\/a>/g;
    let anchor: RegExpExecArray | null;
    while ((anchor = anchorRegex.exec(rowBody)) !== null) {
      const text = decodeHtmlEntities(anchor[2].replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
      if (url === '') url = decodeHtmlEntities(anchor[1]);
      if (title === '' && text !== '') title = text;
    }

    let setName = '';
    const setMatch = rowBody.match(/<a href="\/console\/[^"]+">\s*([\s\S]*?)\s*<\/a>/);
    if (setMatch) {
      setName = decodeHtmlEntities(setMatch[1].replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (url && title) {
      rows.push({ productId, url, title, setName });
    }
    match = rowRegex.exec(html);
  }
  return rows;
};

/** Promo / Promos / Black Star Promos collapse to a shared "promo" token. */
const setTokens = (value: string): string[] =>
  cleanSetName(value)
    .split(' ')
    .filter((t) => t.length > 2)
    .map((t) => (t === 'promos' ? 'promo' : t));

const isPromoSet = (value?: string): boolean => setTokens(value || '').includes('promo');

const setNamesMatch = (candidateSet: string, inputSet: string): boolean => {
  const c = cleanSetName(candidateSet);
  const i = cleanSetName(inputSet);
  if (!i) return true;
  if (c.includes(i) || i.includes(c)) return true;
  const cTokens = new Set(setTokens(candidateSet));
  const iTokens = setTokens(inputSet);
  if (iTokens.length === 0) return true;
  const hits = iTokens.filter((t) => cTokens.has(t)).length;
  return hits >= Math.min(2, iTokens.length);
};

/** True when the listing title names the same set (skipped if no setName given). */
export const titleIncludesSet = (candidateTitle: string, setName?: string): boolean => {
  if (!setName) return true;
  return setNamesMatch(candidateTitle, setName);
};

export const titleIncludesName = (candidateTitle: string, cardName: string): boolean => {
  const t = normalize(candidateTitle);
  const name = normalize(cardName);
  if (!name) return true;
  if (t.includes(name)) return true;
  const tokens = name.split(' ').filter((tok) => tok.length >= 4);
  return tokens.length > 0 && tokens.every((tok) => t.includes(tok));
};

/**
 * True when the candidate title/URL refers to the same collector number.
 * Prefer explicit #N / slug-N markers; never treat "34" as a hit inside "114".
 */
export const titleIncludesNumber = (
  candidateTitle: string,
  cardNumber?: string,
  candidateUrl?: string
): boolean => {
  if (!cardNumber) return true;
  const want = normalizeCardNumber(cardNumber);
  if (!want) return true;

  const marked = [
    ...extractCardNumbers(candidateTitle),
    ...extractCardNumbers(candidateUrl),
  ];
  if (marked.length > 0) return marked.includes(want);

  // Fallback on lightly tokenized text (keep separators) with digit boundaries.
  const hay = `${candidateTitle} ${candidateUrl || ''}`.toLowerCase();
  const escaped = want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^0-9a-z])${escaped}(?:[^0-9a-z]|$)`).test(hay);
};

export const scoreCandidate = (
  candidate: SearchCandidate,
  input: ProductMatchInput
): number => {
  let score = 0;
  const nameForMatch =
    input.game === 'onepiece' ? stripOpNameDecorators(input.cardName) || input.cardName : input.cardName;
  if (titleIncludesName(candidate.title, nameForMatch)) score += 60;
  const setsMatch =
    input.game === 'onepiece'
      ? opSetNamesMatch(candidate.setName, input.setName || '')
      : Boolean(input.setName && setNamesMatch(candidate.setName, input.setName));
  if (input.setName && setsMatch) score += 30;
  else if (input.setName && isPromoSet(input.setName) && isPromoSet(candidate.setName)) score += 20;
  // Only award number points when we actually have a collector number to check.
  // Missing numbers used to +20 every row, so search order picked SV49 over #9.
  if (input.cardNumber && titleIncludesNumber(candidate.title, input.cardNumber, candidate.url)) {
    score += 20;
  }
  if (input.game === 'onepiece') {
    const want = expectedOpPrintFamily(input);
    const got = detectOpPrintFamily(candidate.title, candidate.url);
    if (opPrintFamiliesMatch(want, got)) score += 25;
  } else {
    const wantFinish = expectedPcFinishFamily(input.variant);
    const gotFinish = detectPcFinishFamily(candidate.title, candidate.url);
    if (
      finishesMatch(wantFinish, gotFinish, {
        allowStandardAlias: Boolean(input.allowStandardFinishAlias),
      })
    ) {
      score += 25;
    }
  }
  return score;
};

const SEALED_SKU_RE = /\b(tin|collection|etb|elite trainer|booster|box|blister|bundle|case)\b/i;

export const looksLikeSealedSku = (title?: string, url?: string): boolean =>
  SEALED_SKU_RE.test(`${title || ''} ${url || ''}`);

/** Collector number marked in the title (#SV49) or trailing URL slug (-sv49 / -9). */
export const primaryCollectorNumber = (candidate: SearchCandidate): string => {
  const fromTitle = extractCardNumbers(candidate.title);
  if (fromTitle.length > 0) return fromTitle[0];
  const fromUrl = extractCardNumbers(candidate.url);
  if (fromUrl.length > 0) return fromUrl[fromUrl.length - 1];
  return '';
};

/**
 * When the card number is unknown, drop the wrong print family:
 * main-set Hidden Fates Charizard GX must not match #SV49, and Shiny Vault
 * must not match #9. If several numeric printings remain (regular vs full art
 * in the same set), refuse to guess.
 */
export const selectBestProductMatch = (
  rows: SearchCandidate[],
  input: ProductMatchInput
): { row: SearchCandidate; score: number } | null => {
  let pool = rows
    .map((row) => ({ row, score: scoreCandidate(row, input) }))
    .filter(({ row, score }) => isAcceptableMatch(row, input) && score >= 50);

  if (pool.length === 0) return null;

  const inputLooksSealed = SEALED_SKU_RE.test(input.cardName || '');
  if (!inputLooksSealed) {
    const singles = pool.filter(({ row }) => !looksLikeSealedSku(row.title, row.url));
    if (singles.length > 0) pool = singles;
  }

  if (!input.cardNumber) {
    const wantSecret = setLooksLikeSubsetPrint(input.setName);
    const family = pool.filter(({ row }) => {
      const n = primaryCollectorNumber(row);
      if (!n) return true;
      return numberLooksSecretRare(n) === wantSecret;
    });
    const hadNumbered = pool.some(({ row }) => Boolean(primaryCollectorNumber(row)));
    if (family.length > 0) pool = family;
    else if (hadNumbered) return null;

    const numbered = pool.filter(({ row }) => Boolean(primaryCollectorNumber(row)));
    if (numbered.length > 0) pool = numbered;

    const nums = new Set(
      pool.map(({ row }) => primaryCollectorNumber(row)).filter(Boolean)
    );
    if (nums.size > 1) return null;
  }

  pool.sort((a, b) => b.score - a.score);
  return pool[0] ?? null;
};

export const isAcceptableMatch = (candidate: SearchCandidate, input: ProductMatchInput): boolean => {
  const nameForMatch =
    input.game === 'onepiece' ? stripOpNameDecorators(input.cardName) || input.cardName : input.cardName;
  const hasNumber = titleIncludesNumber(candidate.title, input.cardNumber, candidate.url);
  const hasName = titleIncludesName(candidate.title, nameForMatch);
  const candidateIsOp = /one\s*piece/i.test(candidate.setName);
  if (input.game === 'onepiece') {
    if (!candidateIsOp) return false;
    const family = expectedOpPrintFamily(input);
    const hasFamily = opPrintFamiliesMatch(
      family,
      detectOpPrintFamily(candidate.title, candidate.url)
    );
    if (!hasFamily) return false;
    const hasSet = opSetNamesMatch(candidate.setName, input.setName || '');
    // OPTCG files anniversary reprints under Promotion Cards; PriceCharting
    // often keeps them on the original deck console. Number + family is enough.
    const setOk =
      hasSet || Boolean(input.cardNumber && hasNumber && opFamilyAllowsSetMismatch(family));
    if (input.cardNumber) return hasName && hasNumber && setOk;
    return setOk && hasName;
  }
  const hasSet = setNamesMatch(candidate.setName, input.setName || '');
  if (candidateIsOp) return false;
  const hasFinish = finishesMatch(
    expectedPcFinishFamily(input.variant),
    detectPcFinishFamily(candidate.title, candidate.url),
    { allowStandardAlias: Boolean(input.allowStandardFinishAlias) }
  );
  // PriceCharting collapses era promo lines (XY/SM/SWSH Black Star Promos) into
  // the generic "Pokemon Promo" console. When the card number matches (XY143,
  // SM166, …) that is enough to disambiguate — requiring the set name too
  // blanks slab prices for most promo cards.
  const promoBridge =
    !!input.cardNumber &&
    hasNumber &&
    isPromoSet(input.setName) &&
    isPromoSet(candidate.setName);
  if (!hasFinish) return false;
  if (input.cardNumber) {
    return hasName && hasNumber && (hasSet || promoBridge);
  }
  return hasSet && hasName;
};

/**
 * Strict product search: returns the best candidate ONLY when the card number
 * (when known), set, and name all line up. Returns null when nothing credible
 * matches instead of silently picking a wrong card. Handles PriceCharting's
 * behavior of redirecting an unambiguous search straight to the product page.
 */
export const searchBestProduct = async (
  input: ProductMatchInput,
  delayMs: number = REQUEST_DELAY_MS
): Promise<ProductMatch | null> => {
  const opFamily = input.game === 'onepiece' ? expectedOpPrintFamily(input) : null;
  const query =
    input.game === 'onepiece'
      ? [
          stripOpNameDecorators(input.cardName) || input.cardName,
          input.cardNumber,
          'One Piece',
          opSearchSetName(input.setName, opFamily!),
          opFamilySearchTerms(opFamily!),
        ]
          .filter(Boolean)
          .join(' ')
          .trim()
      : [input.cardName, input.cardNumber, input.setName, pcFinishSearchTerms(input.variant)]
          .filter(Boolean)
          .join(' ')
          .trim();
  const searchUrl = `https://www.pricecharting.com/search-products?exclude-variants=false&q=${encodeURIComponent(
    query
  )}&region-name=all&type=prices&go=Go`;

  const searchHtml = await fetchPriceChartingHtml(searchUrl, delayMs);

  // Direct hit: search landed on the product page itself (no result rows).
  if (searchHtml.includes('id="full-prices"')) {
    const pop = parsePopData(searchHtml);
    const titleMatch = searchHtml.match(/<meta itemprop="name" content="([^"]+)"/);
    const setMatch = searchHtml.match(/<meta itemprop="gamePlatform" content="([^"]+)"/);
    const title = titleMatch
      ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim()
      : '';
    const setName = setMatch
      ? decodeHtmlEntities(setMatch[1]).replace(/\s+/g, ' ').trim()
      : '';
    const candidate: SearchCandidate = { productId: pop.productId || '', url: searchUrl, title, setName };
    const best = pop.productId ? selectBestProductMatch([candidate], input) : null;
    if (best) {
      return {
        productId: best.row.productId,
        url: searchUrl,
        title,
        setName,
        matchScore: best.score,
      };
    }
    return null;
  }

  const rows = parseSearchRows(searchHtml);
  if (rows.length === 0) return null;

  const best = selectBestProductMatch(rows, input);
  if (!best) return null;

  return {
    productId: best.row.productId,
    url: best.row.url,
    title: best.row.title,
    setName: best.row.setName,
    matchScore: best.score,
  };
};

const parsePrice = (raw: string): number | null => {
  const cleaned = raw.replace(/[^0-9.,]/g, '');
  if (!cleaned) return null;
  const value = parseFloat(cleaned.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
};

const parsePopArray = (raw: unknown): number[] | null => {
  if (!Array.isArray(raw)) return null;
  if (raw.length < 10) return null;
  const nums: number[] = [];
  for (const value of raw) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    nums.push(Math.round(n));
  }
  return nums;
};

/** Pure parser for the VGPC.pop_data block + VGPC.product id on a product page. */
export const parsePopData = (html: string): { psaPop: number[] | null; cgcPop: number[] | null; productId: string | null } => {
  let popData: { psa?: unknown; cgc?: unknown } = {};
  const popMatch = html.match(/VGPC\.pop_data\s*=\s*(\{[\s\S]*?\});/);
  if (popMatch) {
    try {
      popData = JSON.parse(popMatch[1]);
    } catch {
      popData = {};
    }
  }

  let productId: string | null = null;
  const productMatch = html.match(/VGPC\.product\s*=\s*\{[\s\S]*?id:\s*(\d+)/);
  if (productMatch) productId = productMatch[1];

  return {
    psaPop: parsePopArray(popData.psa),
    cgcPop: parsePopArray(popData.cgc),
    productId,
  };
};

/** Normalized label key — unifies e.g. "CGC 10 Pristine" with dropdown "CGC 10 Prist.". */
const normLabel = (label: string): string =>
  label
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace('pristine', 'prist')
    .trim();

/** Pure parser for the #full-prices table + completed-auctions sold counts. */
export const parseFullPrices = (html: string): ParsedSlabPrice[] => {
  const gradedPrices: ParsedSlabPrice[] = [];
  const soldCounts = new Map<string, number>();
  const pricesSection = html.slice(html.indexOf('id="full-prices"'));
  const soldSelect = html.match(/<select id="completed-auctions-condition"[\s\S]*?<\/select>/);
  if (soldSelect) {
    const optionRegex = /<option[^>]*>([^<]+)\((\d+)\)<\/option>/g;
    let option: RegExpExecArray | null;
    while ((option = optionRegex.exec(soldSelect[0])) !== null) {
      const label = option[1].replace(/\s+/g, ' ').trim();
      const count = parseInt(option[2], 10);
      if (label && Number.isFinite(count)) soldCounts.set(normLabel(label), count);
    }
  }

  const rowRegex = /<tr>\s*<td>([^<]+)<\/td>\s*<td class="price js-price">([^<]+)<\/td>\s*<\/tr>/g;
  let row: RegExpExecArray | null;
  const priceByLabel = new Map<string, number | null>();
  while ((row = rowRegex.exec(pricesSection)) !== null) {
    const label = row[1].replace(/\s+/g, ' ').trim();
    const value = parsePrice(row[2]);
    if (label && value !== undefined) priceByLabel.set(normLabel(label), value);
  }

  const seen = new Set<string>();
  for (const entry of COMPANY_LABELS) {
    const rawPrice = priceByLabel.get(normLabel(entry.label));
    if (rawPrice === undefined) continue;
    const key = `${entry.grader}::${entry.grade}`;
    if (seen.has(key)) continue;
    seen.add(key);
    gradedPrices.push({
      grader: entry.grader,
      grade: entry.grade,
      price: rawPrice,
      soldListings: soldCounts.get(normLabel(entry.label)) ?? 0,
      lastSoldDate: null,
      lastSoldPrice: null,
    });
  }

  const lastSold = parseLastSoldByGrade(html);
  for (const p of gradedPrices) {
    const sold = lastSold.get(`${p.grader}::${p.grade}`);
    if (!sold) continue;
    p.lastSoldDate = sold.date;
    p.lastSoldPrice = sold.price;
  }

  return gradedPrices;
};

export interface CompletedSale {
  date: string;
  price: number;
  title: string;
}

const parseSaleRows = (tableHtml: string): CompletedSale[] => {
  const sales: CompletedSale[] = [];
  const rowRegex =
    /<tr[^>]*id="ebay-\d+"[\s\S]*?<td class="date">\s*([^<]+?)\s*<\/td>[\s\S]*?<td class="title">[\s\S]*?>([\s\S]*?)<\/a>[\s\S]*?<span class="js-price"[^>]*>\s*([^<]+?)\s*<\/span>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRegex.exec(tableHtml)) !== null) {
    const date = row[1].trim();
    const title = decodeHtmlEntities(row[2].replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
    const price = parsePrice(row[3]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || price == null) continue;
    sales.push({ date, price, title });
  }
  return sales;
};

/**
 * Latest completed sale per company grade from the Sold Listings tables.
 * PriceCharting already fetched this HTML for the sold guide — no extra request.
 */
export const parseLastSoldByGrade = (html: string): Map<string, CompletedSale> => {
  const latest = new Map<string, CompletedSale>();
  const classToGrade = new Map<string, { grader: string; grade: string }>();
  const soldSelect = html.match(/<select id="completed-auctions-condition"[\s\S]*?<\/select>/);
  if (soldSelect) {
    const optionRegex = /<option value="([^"]+)"[^>]*>\s*([^<]*?)\((\d+)\)\s*<\/option>/g;
    let option: RegExpExecArray | null;
    while ((option = optionRegex.exec(soldSelect[0])) !== null) {
      const className = option[1].trim();
      const label = option[2].replace(/\s+/g, ' ').trim();
      const company = COMPANY_LABELS.find((e) => normLabel(e.label) === normLabel(label));
      if (company) classToGrade.set(className, { grader: company.grader, grade: company.grade });
    }
  }
  if (classToGrade.size === 0) {
    classToGrade.set('completed-auctions-manual-only', { grader: 'psa', grade: '10' });
  }

  for (const [className, grade] of classToGrade) {
    const marker = `class="${className}">`;
    let from = 0;
    let tableHtml = '';
    while (from < html.length) {
      const i = html.indexOf(marker, from);
      if (i < 0) break;
      const chunk = html.slice(i, i + 120000);
      if (chunk.includes('<table') && /id="ebay-\d+"/.test(chunk)) {
        tableHtml = chunk;
        break;
      }
      from = i + marker.length;
    }
    if (!tableHtml) continue;
    const sales = parseSaleRows(tableHtml);
    if (sales.length === 0) continue;
    const newest = sales.reduce((a, b) => (a.date >= b.date ? a : b));
    latest.set(`${grade.grader}::${grade.grade}`, newest);
  }
  return latest;
};

/**
 * One product page carries everything: population census (VGPC.pop_data),
 * the full price guide (#full-prices), and sold-count dropdown options.
 */
export const fetchProductPageData = async (
  url: string,
  delayMs: number = REQUEST_DELAY_MS
): Promise<PriceChartingPageData> => {
  const html = await fetchPriceChartingHtml(url, delayMs);
  if (!isProductPageHtml(html)) {
    throw new Error('pricecharting_not_product');
  }
  const pop = parsePopData(html);
  const titleMatch = html.match(/<meta itemprop="name" content="([^"]+)"/);
  const setMatch = html.match(/<meta itemprop="gamePlatform" content="([^"]+)"/);

  return {
    productId: pop.productId,
    title: titleMatch
      ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim()
      : null,
    setName: setMatch
      ? decodeHtmlEntities(setMatch[1]).replace(/\s+/g, ' ').trim()
      : null,
    psaPop: pop.psaPop,
    cgcPop: pop.cgcPop,
    gradedPrices: parseFullPrices(html),
  };
};

/**
 * PriceCharting URL slug: lowercase, spaces -> dashes, keep `&` and `'`.
 * Tag Team cards use the ampersand form (`magikarp-&-wailord-gx-161`); rewriting
 * `&` to `and` lands on a non-product page with no slab prices. Apostrophes are
 * kept so `Rocket's Wobbuffet` hits `rocket's-wobbuffet-reverse-holo-47`.
 */
export const slugify = (value?: string): string =>
  decodeHtmlEntities(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9&']+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Console slug, e.g. "Pokemon Scarlet & Violet 151" -> "pokemon-scarlet-&-violet-151". */
export const consoleSlug = (consoleName: string): string => slugify(consoleName);

/** Card slug, e.g. "Magikarp & Wailord-GX" -> "magikarp-&-wailord-gx". */
export const cardSlug = (cardName: string): string => slugify(cardName);

/**
 * Direct product URL built from a known console name + card name/number, e.g.
 * https://www.pricecharting.com/game/pokemon-scarlet-&-violet-151/pikachu-173
 * Saves the search round-trip during the bulk sweep. Result is ALWAYS verified
 * against the parsed page before being trusted.
 */
export const buildDirectProductUrl = (
  consoleName: string,
  cardName: string,
  cardNumber?: string,
  variant?: string,
  options?: { game?: 'pokemon' | 'onepiece' }
): string => {
  if (options?.game === 'onepiece') {
    const family = expectedOpPrintFamily({ cardName, variant });
    const finish = opFamilySlug(family);
    const finishPart = finish ? `-${finish}` : '';
    const numberPart = cardNumber ? `-${cardNumber.toLowerCase()}` : '';
    const slugName = stripOpPeriodsForSlug(stripOpNameDecorators(cardName) || cardName);
    return `https://www.pricecharting.com/game/${consoleSlug(consoleName)}/${cardSlug(
      slugName
    )}${finishPart}${numberPart}`;
  }
  const finish = pcFinishSlug(expectedPcFinishFamily(variant));
  const finishPart = finish ? `-${finish}` : '';
  const numberPart = cardNumber ? `-${cardNumber}` : '';
  return `https://www.pricecharting.com/game/${consoleSlug(consoleName)}/${cardSlug(
    cardName
  )}${finishPart}${numberPart}`;
};

/** True when the fetched HTML is a real product page (not a 404/redirect/list). */
export const isProductPageHtml = (html: string): boolean =>
  html.includes('VGPC.product') && html.includes('id="full-prices"');

/**
 * Verifies a parsed product page actually IS the card we asked for. Used for
 * direct-URL hits, which are never trusted without this check.
 */
export const verifyProductPage = (
  page: PriceChartingPageData,
  input: ProductMatchInput,
  pageUrl?: string
): boolean => {
  if (!page.productId || !page.title || !page.setName) return false;
  const candidate: SearchCandidate = {
    productId: page.productId,
    url: pageUrl || '',
    title: page.title,
    setName: page.setName,
  };
  return selectBestProductMatch([candidate], input) != null;
};
