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

const cleanSetName = (value?: string): string =>
  decodeHtmlEntities(value)
    .toLowerCase()
    .replace(/[^a-z0-9&]/g, ' ');

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
}

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

const titleIncludesName = (candidateTitle: string, cardName: string): boolean => {
  const t = normalize(candidateTitle);
  const name = normalize(cardName);
  if (!name) return true;
  if (t.includes(name)) return true;
  const tokens = name.split(' ').filter((tok) => tok.length >= 4);
  return tokens.length > 0 && tokens.every((tok) => t.includes(tok));
};

const titleIncludesNumber = (candidateTitle: string, cardNumber?: string): boolean => {
  if (!cardNumber) return true;
  const num = normalize(cardNumber);
  return num.length > 0 && normalize(candidateTitle).includes(num);
};

export const scoreCandidate = (
  candidate: SearchCandidate,
  input: ProductMatchInput
): number => {
  let score = 0;
  if (titleIncludesName(candidate.title, input.cardName)) score += 60;
  if (input.setName && setNamesMatch(candidate.setName, input.setName)) score += 30;
  else if (input.setName && isPromoSet(input.setName) && isPromoSet(candidate.setName)) score += 20;
  if (titleIncludesNumber(candidate.title, input.cardNumber)) score += 20;
  return score;
};

export const isAcceptableMatch = (candidate: SearchCandidate, input: ProductMatchInput): boolean => {
  const hasSet = setNamesMatch(candidate.setName, input.setName || '');
  const hasNumber = titleIncludesNumber(candidate.title, input.cardNumber);
  const hasName = titleIncludesName(candidate.title, input.cardName);
  // PriceCharting collapses era promo lines (XY/SM/SWSH Black Star Promos) into
  // the generic "Pokemon Promo" console. When the card number matches (XY143,
  // SM166, …) that is enough to disambiguate — requiring the set name too
  // blanks slab prices for most promo cards.
  const promoBridge =
    !!input.cardNumber &&
    hasNumber &&
    isPromoSet(input.setName) &&
    isPromoSet(candidate.setName);
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
  const query = [input.cardName, input.cardNumber, input.setName]
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
    const score = scoreCandidate(candidate, input);
    if (pop.productId && isAcceptableMatch(candidate, input) && score >= 50) {
      return {
        productId: pop.productId,
        url: searchUrl,
        title,
        setName,
        matchScore: score,
      };
    }
    return null;
  }

  const rows = parseSearchRows(searchHtml);
  if (rows.length === 0) return null;

  const ranked = rows
    .map((row) => ({ row, score: scoreCandidate(row, input) }))
    .filter(({ row, score }) => isAcceptableMatch(row, input) && score >= 50)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
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
    });
  }

  return gradedPrices;
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
 * PriceCharting URL slug: lowercase, spaces -> dashes, keep `&`, strip the rest.
 * Tag Team cards use the ampersand form (`magikarp-&-wailord-gx-161`); rewriting
 * `&` to `and` lands on a non-product page with no slab prices.
 */
export const slugify = (value?: string): string =>
  decodeHtmlEntities(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, '-')
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
  cardNumber?: string
): string =>
  `https://www.pricecharting.com/game/${consoleSlug(consoleName)}/${cardSlug(cardName)}${
    cardNumber ? `-${cardNumber}` : ''
  }`;

/** True when the fetched HTML is a real product page (not a 404/redirect/list). */
export const isProductPageHtml = (html: string): boolean =>
  html.includes('VGPC.product') && html.includes('id="full-prices"');

/**
 * Verifies a parsed product page actually IS the card we asked for. Used for
 * direct-URL hits, which are never trusted without this check.
 */
export const verifyProductPage = (page: PriceChartingPageData, input: ProductMatchInput): boolean => {
  if (!page.productId || !page.title || !page.setName) return false;
  const candidate: SearchCandidate = {
    productId: page.productId,
    url: '',
    title: page.title,
    setName: page.setName,
  };
  return isAcceptableMatch(candidate, input) && scoreCandidate(candidate, input) >= 50;
};
