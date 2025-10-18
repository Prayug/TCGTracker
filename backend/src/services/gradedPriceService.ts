import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { dbGet } from '../db/promisified';

const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const REQUEST_TIMEOUT_MS = 12000;
const REQUEST_DELAY_MS = 1500;

export interface GradedPrice {
  grader: string;
  grade: string;
  price: number | null;
  soldListings: number;
}

export interface GradedPriceResult {
  cardId: string;
  cardName: string;
  setName: string;
  prices: GradedPrice[];
  fetchedAt: string;
  cached: boolean;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const normalize = (value?: string) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('request_timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
};

const scoreCandidate = (
  candidate: { title: string; setName: string },
  cardName: string,
  setName: string,
  cardNumber?: string
): number => {
  const title = normalize(candidate.title);
  const cSet = normalize(candidate.setName);
  const cName = normalize(cardName);
  const iSet = normalize(setName);
  const iNum = normalize(cardNumber);

  let score = 0;
  if (title.includes(cName)) score += 60;
  if (iSet && (cSet.includes(iSet) || iSet.includes(cSet))) score += 30;
  if (iNum && title.includes(iNum)) score += 20;
  return score;
};

const parsePriceChartingSearchRows = (html: string) => {
  const rows: Array<{ url: string; title: string; setName: string }> = [];
  const rowRegex =
    /<tr id="product-[^"]+"[\s\S]*?<a href="(https:\/\/www\.pricecharting\.com\/game\/[^"]+)"[^>]*>\s*([\s\S]*?)<\/a>[\s\S]*?<a href="\/console\/[^"]+">\s*([\s\S]*?)\s*<\/a>[\s\S]*?<\/tr>/g;
  let match: RegExpExecArray | null = rowRegex.exec(html);
  while (match) {
    const [, url, rawTitle, rawSet] = match;
    rows.push({
      url,
      title: rawTitle.replace(/<[^>]+>/g, '').trim(),
      setName: rawSet.replace(/<[^>]+>/g, '').trim(),
    });
    match = rowRegex.exec(html);
  }
  return rows;
};

const searchBestProductUrl = async (
  cardName: string,
  setName?: string,
  cardNumber?: string
): Promise<string | null> => {
  const query = [cardName, cardNumber, setName].filter(Boolean).join(' ').trim();
  const searchUrl = `https://www.pricecharting.com/search-products?exclude-variants=false&q=${encodeURIComponent(query)}&region-name=all&type=prices&go=Go`;

  const searchResponse = await withTimeout(
    fetch(searchUrl, { headers: { Accept: 'text/html' } }),
    REQUEST_TIMEOUT_MS
  );
  if (!searchResponse.ok) return null;
  const searchHtml = await searchResponse.text();
  const rows = parsePriceChartingSearchRows(searchHtml);
  if (rows.length === 0) return null;

  const ranked = rows
    .map((row) => ({ row, score: scoreCandidate(row, cardName, setName || '', cardNumber) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.row?.url || null;
};

const parseGradedPriceRow = (html: string): GradedPrice[] => {
  const prices: GradedPrice[] = [];

  const knownLabels = [
    'Ungraded', 'PSA 10', 'PSA 9', 'PSA 8', 'PSA 7', 'PSA 6', 'PSA 5',
    'CGC 10', 'CGC 9.5', 'CGC 9', 'CGC 8',
    'BGS 10', 'BGS 9.5', 'BGS 9', 'BGS 8',
    'SGC 10', 'SGC 9.5', 'SGC 9',
    'Grade 10', 'Grade 9.5', 'Grade 9', 'Grade 8', 'Grade 7', 'Grade 6', 'Grade 5',
    'BGS 10 Black', 'CGC 10 Pristine', 'CGC 10 Prist.',
  ];

  const labelIndexes: Array<{ label: string; idx: number }> = [];
  for (const label of knownLabels) {
    const idx = html.indexOf(`>${label}<`);
    if (idx !== -1) {
      labelIndexes.push({ label, idx });
    }
  }
  labelIndexes.sort((a, b) => a.idx - b.idx);

  if (labelIndexes.length === 0) return prices;

  const priceRegex = /\$([0-9,]+\.\d{2})/g;
  const priceMatches: number[] = [];
  let pm: RegExpExecArray | null;
  while ((pm = priceRegex.exec(html)) !== null) {
    if (pm[1] === '0.00') continue;
    const val = parseFloat(pm[1].replace(/,/g, ''));
    priceMatches.push(val);
  }

  const grouped: string[] = [];
  for (let i = 0; i < labelIndexes.length; i++) {
    const current = labelIndexes[i];
    const next = labelIndexes[i + 1];
    const sectionEnd = next ? next.idx : html.length;
    const section = html.slice(current.idx, sectionEnd);
    grouped.push(current.label);

    const sectionPrices: number[] = [];
    const spRegex = /\$([0-9,]+\.\d{2})/g;
    let sp: RegExpExecArray | null;
    while ((sp = spRegex.exec(section)) !== null) {
      const val = parseFloat(sp[1].replace(/,/g, ''));
      if (val > 0) sectionPrices.push(val);
    }

    if (sectionPrices.length > 0) {
      const grader = current.label.startsWith('Grade ')
        ? 'generic'
        : current.label.includes(' ')
          ? current.label.split(' ')[0].toLowerCase()
          : 'ungraded';
      const grade = current.label.startsWith('Grade ')
        ? current.label.replace('Grade ', '')
        : current.label === 'Ungraded'
          ? 'ungraded'
          : current.label.split(' ').slice(1).join(' ');

      prices.push({
        grader,
        grade,
        price: sectionPrices[0],
        soldListings: 0,
      });
    }
  }

  const filterRegex = /(PSA 10|CGC 10|BGS 10|SGC 10|BGS 10 Black|CGC 10 Prist\.?|Grade [\d.]+)\s*\((\d+)\)/g;
  let fm: RegExpExecArray | null;
  while ((fm = filterRegex.exec(html)) !== null) {
    const label = fm[1];
    const count = parseInt(fm[2], 10);
    const grader = label.startsWith('Grade ')
      ? 'generic'
      : label.includes(' ')
        ? label.split(' ')[0].toLowerCase()
        : 'generic';
    const grade = label.startsWith('Grade ')
      ? label.replace('Grade ', '')
      : label.split(' ').slice(1).join(' ');

    const existing = prices.find(
      (p) => p.grader === grader && p.grade === grade
    );
    if (existing) {
      existing.soldListings = count;
    }
  }

  return prices;
};

let lastScrapeTime = 0;

export const getGradedPrices = async (
  cardId: string,
  cardName: string,
  setId?: string,
  setName?: string,
  cardNumber?: string
): Promise<GradedPriceResult> => {
  const db = getDb();
  const cached = await dbGet<{
    cardId: string; cardName: string; setId: string; setName: string;
    prices: string; fetchedAt: string;
  }>(
    `SELECT cardId, cardName, setId, setName,
            GROUP_CONCAT(grader || '::' || grade || '::' || COALESCE(price, '') || '::' || soldListings, '||') as prices,
            MAX(fetchedAt) as fetchedAt
     FROM graded_prices WHERE cardId = ? GROUP BY cardId`,
    [cardId]
  );

  if (cached && cached.prices) {
    const age = Date.now() - new Date(cached.fetchedAt + 'Z').getTime();
    if (age < CACHE_TTL_MS) {
      const p = cached.prices.split('||').map((part) => {
        const [grader, grade, price, soldListings] = part.split('::');
        return {
          grader,
          grade,
          price: price ? parseFloat(price) : null,
          soldListings: parseInt(soldListings, 10) || 0,
        } as GradedPrice;
      });
      return {
        cardId: cached.cardId,
        cardName: cached.cardName,
        setName: cached.setName,
        prices: p,
        fetchedAt: cached.fetchedAt,
        cached: true,
      };
    }
  }

  const now = Date.now();
  const elapsed = now - lastScrapeTime;
  if (elapsed < REQUEST_DELAY_MS) {
    await delay(REQUEST_DELAY_MS - elapsed);
  }
  lastScrapeTime = Date.now();

  const url = await searchBestProductUrl(cardName, setName, cardNumber);
  if (!url) {
    return { cardId, cardName, setName: setName || '', prices: [], fetchedAt: new Date().toISOString(), cached: false };
  }

  const pageResponse = await withTimeout(
    fetch(url, { headers: { Accept: 'text/html' } }),
    REQUEST_TIMEOUT_MS
  );
  if (!pageResponse.ok) {
    return { cardId, cardName, setName: setName || '', prices: [], fetchedAt: new Date().toISOString(), cached: false };
  }

  const html = await pageResponse.text();
  const prices = parseGradedPriceRow(html);

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO graded_prices (cardId, cardName, setId, setName, grader, grade, price, soldListings, fetchedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  );

  for (const p of prices) {
    stmt.run([cardId, cardName, setId || '', setName || '', p.grader, p.grade, p.price, p.soldListings]);
  }
  stmt.finalize();

  return {
    cardId,
    cardName,
    setName: setName || '',
    prices,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };
};
