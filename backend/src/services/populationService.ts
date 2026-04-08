import { getDb } from '../db/database';
import { logger } from '../utils/logger';

const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const REQUEST_TIMEOUT_MS = 12000;
const BECKETT_SPORT_POKEMON = '477173';

type GraderKey = 'psa' | 'cgc' | 'beckett';

interface PopulationLookupInput {
  cardId?: string;
  cardName: string;
  setId?: string;
  setName?: string;
  cardNumber?: string;
  variant?: string;
}

interface GraderPopulationResult {
  grader: GraderKey;
  total: number | null;
  status: 'ok' | 'unavailable' | 'error';
  source: 'cache' | 'scrape' | 'none';
  message?: string;
}

export interface PopulationLookupResult {
  key: string;
  cardId?: string;
  cardName: string;
  setId?: string;
  setName?: string;
  cardNumber?: string;
  variant?: string;
  fetchedAt: number;
  cached: boolean;
  companies: Record<GraderKey, GraderPopulationResult>;
}

const normalize = (value?: string) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const buildCacheKey = (input: PopulationLookupInput): string =>
  [
    normalize(input.cardId),
    normalize(input.cardName),
    normalize(input.setId),
    normalize(input.setName),
    normalize(input.cardNumber),
    normalize(input.variant),
  ].join('|');

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

const queryOne = <T = any>(sql: string, params: any[]): Promise<T | null> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row: T) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
};

const runQuery = (sql: string, params: any[]): Promise<void> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const getCachedPopulation = async (cacheKey: string): Promise<PopulationLookupResult | null> => {
  const row = await queryOne<{ payload: string; fetchedAt: number }>(
    `SELECT payload, fetchedAt FROM population_cache WHERE cacheKey = ?`,
    [cacheKey]
  );
  if (!row) {
    return null;
  }
  if (Date.now() - row.fetchedAt > CACHE_TTL_MS) {
    return null;
  }
  try {
    const parsed = JSON.parse(row.payload) as PopulationLookupResult;
    const hasLegacyApifyPayload = Object.values(parsed.companies || {}).some((company: any) => {
      const source = String(company?.source || '');
      const message = String(company?.message || '');
      return source === 'apify' || message.includes('APIFY_API_TOKEN');
    });
    if (hasLegacyApifyPayload) {
      return null;
    }
    (Object.keys(parsed.companies || {}) as GraderKey[]).forEach((grader) => {
      const company = parsed.companies[grader];
      if (!company) return;
      if (typeof company.total === 'number' && company.total <= 0) {
        company.total = null;
        if (company.status === 'ok') {
          company.status = 'unavailable';
        }
      }
      if (company.status === 'error' && company.message) {
        if (company.message.startsWith('beckett_')) {
          company.message = 'Beckett temporarily unavailable';
        } else if (company.message.startsWith('pricecharting_')) {
          company.message = 'Population source temporarily unavailable';
        } else if (company.message === 'request_timeout') {
          company.message = 'Lookup timed out';
        }
      }
    });
    return { ...parsed, cached: true };
  } catch {
    return null;
  }
};

const saveCachedPopulation = async (cacheKey: string, payload: PopulationLookupResult): Promise<void> => {
  await runQuery(
    `INSERT OR REPLACE INTO population_cache (cacheKey, payload, fetchedAt) VALUES (?, ?, ?)`,
    [cacheKey, JSON.stringify(payload), Date.now()]
  );
};

const scoreCandidate = (
  candidate: { title: string; setName: string },
  input: PopulationLookupInput
): number => {
  const title = normalize(candidate.title);
  const setName = normalize(candidate.setName);
  const cardName = normalize(input.cardName);
  const inputSet = normalize(input.setName);
  const inputCardNumber = normalize(input.cardNumber);

  let score = 0;
  if (title.includes(cardName)) {
    score += 60;
  }
  if (inputSet && (setName.includes(inputSet) || inputSet.includes(setName))) {
    score += 30;
  }
  if (inputCardNumber && title.includes(inputCardNumber)) {
    score += 20;
  }
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

const sumPopArray = (values: unknown): number | null => {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const nums = values.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0);
  if (nums.length === 0) {
    return null;
  }
  const total = nums.reduce((acc, v) => acc + v, 0);
  return total > 0 ? total : null;
};

const fetchPriceChartingPopulations = async (
  input: PopulationLookupInput
): Promise<{ psa: number | null; cgc: number | null }> => {
  const query = [input.cardName, input.cardNumber, input.variant, input.setName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const searchUrl = `https://www.pricecharting.com/search-products?exclude-variants=false&q=${encodeURIComponent(
    query
  )}&region-name=all&type=prices&go=Go`;

  const searchResponse = await withTimeout(
    fetch(searchUrl, { headers: { Accept: 'text/html' } }),
    REQUEST_TIMEOUT_MS
  );
  if (!searchResponse.ok) {
    throw new Error(`pricecharting_search_${searchResponse.status}`);
  }
  const searchHtml = await searchResponse.text();
  const rows = parsePriceChartingSearchRows(searchHtml);
  if (rows.length === 0) {
    return { psa: null, cgc: null };
  }

  const ranked = rows
    .map((row) => ({ row, score: scoreCandidate({ title: row.title, setName: row.setName }, input) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0]?.row;
  if (!best) {
    return { psa: null, cgc: null };
  }

  const cardResponse = await withTimeout(
    fetch(best.url, { headers: { Accept: 'text/html' } }),
    REQUEST_TIMEOUT_MS
  );
  if (!cardResponse.ok) {
    throw new Error(`pricecharting_card_${cardResponse.status}`);
  }
  const cardHtml = await cardResponse.text();
  const popMatch = cardHtml.match(/VGPC\.pop_data\s*=\s*(\{[\s\S]*?\});/);
  if (!popMatch) {
    return { psa: null, cgc: null };
  }

  const popData = JSON.parse(popMatch[1]) as { psa?: unknown; cgc?: unknown };
  return {
    psa: sumPopArray(popData.psa),
    cgc: sumPopArray(popData.cgc),
  };
};

const parseBeckettRows = (html: string): Array<{ setTitle: string; total: number }> => {
  const rows: Array<{ setTitle: string; total: number }> = [];
  const rowRegex =
    /<input type="hidden" name="set_title" class="set_title" value ="([^"]*)">[\s\S]*?<input type="hidden" name="card_total_value" class="card_total_value" value ="([^"]*)">/g;
  let match: RegExpExecArray | null = rowRegex.exec(html);
  while (match) {
    const setTitle = match[1]?.trim() || '';
    const total = Number.parseInt(match[2] || '', 10);
    if (setTitle && Number.isFinite(total)) {
      rows.push({ setTitle, total });
    }
    match = rowRegex.exec(html);
  }
  return rows;
};

const fetchBeckettPopulation = async (input: PopulationLookupInput): Promise<number | null> => {
  const form = new URLSearchParams();
  form.set('sport_id', BECKETT_SPORT_POKEMON);
  form.set('set_name', input.setName || '');
  form.set('player_name', input.cardName);
  form.set('search', 'Search');

  const response = await withTimeout(
    fetch('https://www.beckett.com/grading/pop-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html',
      },
      body: form.toString(),
    }),
    REQUEST_TIMEOUT_MS
  );
  if (!response.ok) {
    throw new Error(`beckett_${response.status}`);
  }
  const html = await response.text();
  const rows = parseBeckettRows(html);
  if (rows.length === 0) {
    return null;
  }

  const inputName = normalize(input.cardName);
  const inputSet = normalize(input.setName);
  const inputNum = normalize(input.cardNumber);
  const ranked = rows
    .map((row) => {
      const candidate = normalize(row.setTitle);
      let score = 0;
      if (candidate.includes(inputName)) score += 60;
      if (inputSet && candidate.includes(inputSet)) score += 30;
      if (inputNum && candidate.includes(inputNum)) score += 20;
      return { row, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.row.total ?? null;
};

const resolveGrader = async (grader: GraderKey, input: PopulationLookupInput): Promise<GraderPopulationResult> => {
  try {
    if (grader === 'psa' || grader === 'cgc') {
      const totals = await fetchPriceChartingPopulations(input);
      const total = grader === 'psa' ? totals.psa : totals.cgc;
      return {
        grader,
        total,
        status: total !== null ? 'ok' : 'unavailable',
        source: total !== null ? 'scrape' : 'none',
        message: total !== null ? undefined : 'No population result found',
      };
    }

    const beckettTotal = await fetchBeckettPopulation(input);
    return {
      grader,
      total: beckettTotal,
      status: beckettTotal !== null ? 'ok' : 'unavailable',
      source: beckettTotal !== null ? 'scrape' : 'none',
      message: beckettTotal !== null ? undefined : 'No population result found',
    };
  } catch (error) {
    const rawMessage = (error as Error).message || 'population_lookup_failed';
    const message =
      rawMessage === 'request_timeout'
        ? 'Lookup timed out'
        : rawMessage.startsWith('beckett_')
          ? 'Beckett temporarily unavailable'
          : rawMessage.startsWith('pricecharting_')
            ? 'Population source temporarily unavailable'
            : 'Population lookup failed';
    logger.warn('Population lookup failed', {
      grader,
      cardName: input.cardName,
      error: rawMessage,
    });
    return {
      grader,
      total: null,
      status: 'error',
      source: 'none',
      message,
    };
  }
};

export const getPopulationCounts = async (
  input: PopulationLookupInput
): Promise<PopulationLookupResult> => {
  const key = buildCacheKey(input);
  const cached = await getCachedPopulation(key);
  if (cached) {
    return cached;
  }

  const [psa, cgc, beckett] = await Promise.all([
    resolveGrader('psa', input),
    resolveGrader('cgc', input),
    resolveGrader('beckett', input),
  ]);

  const payload: PopulationLookupResult = {
    key,
    cardId: input.cardId,
    cardName: input.cardName,
    setId: input.setId,
    setName: input.setName,
    cardNumber: input.cardNumber,
    variant: input.variant,
    fetchedAt: Date.now(),
    cached: false,
    companies: { psa, cgc, beckett },
  };

  await saveCachedPopulation(key, payload).catch((error) => {
    logger.warn('Failed to cache population lookup', { error: (error as Error).message });
  });

  return payload;
};
