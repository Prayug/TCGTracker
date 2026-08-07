import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { normalize } from './priceChartingClient';
import { resolveProduct } from './priceChartingResolver';

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
  grade10: number | null;
  grade9: number | null;
  pop: number[] | null;
  status: 'ok' | 'unavailable' | 'error';
  source: 'cache' | 'scrape' | 'none';
  productId?: string | null;
  verified?: boolean;
  matchScore?: number | null;
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
  stale: boolean;
  ageHours: number | null;
  productId: string | null;
  verified: boolean;
  companies: Record<GraderKey, GraderPopulationResult>;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

const sanitizeCompanies = (
  companies: Record<GraderKey, GraderPopulationResult>
): Record<GraderKey, GraderPopulationResult> => {
  (Object.keys(companies) as GraderKey[]).forEach((grader) => {
    const company = companies[grader];
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
  return companies;
};

const getCachedPopulation = async (cacheKey: string): Promise<PopulationLookupResult | null> => {
  const row = await queryOne<{ payload: string; fetchedAt: number }>(
    `SELECT payload, fetchedAt FROM population_cache WHERE cacheKey = ?`,
    [cacheKey]
  );
  if (!row) {
    return null;
  }
  const age = Date.now() - row.fetchedAt;
  if (age > CACHE_TTL_MS) {
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
    sanitizeCompanies(parsed.companies);
    return {
      ...parsed,
      cached: true,
      stale: age > CACHE_TTL_MS,
      ageHours: Math.round(age / 3600000),
    };
  } catch {
    return null;
  }
};

const saveCachedPopulation = async (
  cacheKey: string,
  payload: PopulationLookupResult
): Promise<void> => {
  await runQuery(
    `INSERT OR REPLACE INTO population_cache (cacheKey, cardId, payload, fetchedAt) VALUES (?, ?, ?, ?)`,
    [cacheKey, payload.cardId || null, JSON.stringify(payload), Date.now()]
  );

  // Daily pop snapshot for regime / supply-shock radar (best-effort).
  if (payload.cardId) {
    try {
      const { snapshotPopulationHistory } = await import('./slabInsightsService');
      await snapshotPopulationHistory({
        cardId: payload.cardId,
        psaTotal: payload.companies?.psa?.total ?? null,
        psa10: payload.companies?.psa?.grade10 ?? null,
        psa9: payload.companies?.psa?.grade9 ?? null,
        cgcTotal: payload.companies?.cgc?.total ?? null,
        cgc10: payload.companies?.cgc?.grade10 ?? null,
        verified: payload.verified === true,
        productId: payload.productId ?? null,
      });
    } catch {
      // Table may not exist yet mid-migration; ignore.
    }
  }
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

const buildGraderResult = (
  grader: GraderKey,
  pop: number[] | null,
  extra?: Partial<GraderPopulationResult>
): GraderPopulationResult => {
  const total = pop && pop.length > 0 ? pop.reduce((acc, v) => acc + v, 0) : null;
  return {
    grader,
    total: total && total > 0 ? total : null,
    grade10: pop && pop.length >= 10 ? pop[9] : null,
    grade9: pop && pop.length >= 9 ? pop[8] : null,
    pop,
    status: total && total > 0 ? 'ok' : 'unavailable',
    source: total && total > 0 ? 'scrape' : 'none',
    message: total && total > 0 ? undefined : 'No population result found',
    ...extra,
  };
};

interface PriceChartingScrape {
  psa: GraderPopulationResult;
  cgc: GraderPopulationResult;
  productId: string | null;
  verified: boolean;
  matchScore: number | null;
}

/**
 * ONE hardened product resolution yields both PSA and CGC census. A single
 * valid 10-element positional array (index 0 = Grade 1 .. 9 = Grade 10)
 * is required before a population is accepted — no more total=1 garbage.
 */
const fetchPriceChartingPopulations = async (
  input: PopulationLookupInput
): Promise<PriceChartingScrape> => {
  const resolved = await resolveProduct(
    {
      cardName: input.cardName,
      setId: input.setId,
      setName: input.setName,
      cardNumber: input.cardNumber,
    },
    1500
  );
  if (!resolved) {
    throw new Error('pricecharting_no_match');
  }

  const { match, pageData } = resolved;
  const verified = pageData.productId === match.productId;

  return {
    psa: buildGraderResult('psa', pageData.psaPop, {
      productId: pageData.productId,
      verified,
      matchScore: match.matchScore,
    }),
    cgc: buildGraderResult('cgc', pageData.cgcPop, {
      productId: pageData.productId,
      verified,
      matchScore: match.matchScore,
    }),
    productId: pageData.productId,
    verified,
    matchScore: match.matchScore,
  };
};

const resolveGrader = async (
  grader: GraderKey,
  input: PopulationLookupInput,
  pcScrape: PriceChartingScrape | null
): Promise<GraderPopulationResult> => {
  try {
    if ((grader === 'psa' || grader === 'cgc') && pcScrape) {
      return pcScrape[grader];
    }
    if (grader === 'psa' || grader === 'cgc') {
      return buildGraderResult(grader, null, {
        message: 'No population result found',
      });
    }

    const beckettTotal = await fetchBeckettPopulation(input);
    return {
      grader,
      total: beckettTotal,
      grade10: null,
      grade9: null,
      pop: null,
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
      grade10: null,
      grade9: null,
      pop: null,
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

  let pcScrape: PriceChartingScrape | null = null;
  try {
    pcScrape = await fetchPriceChartingPopulations(input);
  } catch (error) {
    logger.warn('PriceCharting population scrape failed', {
      cardName: input.cardName,
      error: (error as Error).message,
    });
  }

  const [psa, cgc, beckett] = await Promise.all([
    resolveGrader('psa', input, pcScrape),
    resolveGrader('cgc', input, pcScrape),
    resolveGrader('beckett', input, pcScrape),
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
    stale: false,
    ageHours: 0,
    productId: pcScrape?.productId ?? null,
    verified: pcScrape?.verified ?? false,
    companies: { psa, cgc, beckett },
  };

  await saveCachedPopulation(key, payload).catch((error) => {
    logger.warn('Failed to cache population lookup', { error: (error as Error).message });
  });

  return payload;
};

/**
 * Look up the freshest cached population payload for a cardId (used by the
 * prediction engine's scarcity scoring and the nightly refresh).
 */
export const getCachedPopulationByCardId = async (
  cardId: string
): Promise<PopulationLookupResult | null> => {
  const row = await queryOne<{ payload: string }>(
    `SELECT payload FROM population_cache WHERE cardId = ? ORDER BY fetchedAt DESC LIMIT 1`,
    [cardId]
  );
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.payload) as PopulationLookupResult;
    sanitizeCompanies(parsed.companies);
    return { ...parsed, cached: true };
  } catch {
    return null;
  }
};

export const getAllCachedPopulations = async (): Promise<
  Array<{ cardId: string; payload: PopulationLookupResult }>
> => {
  const db = getDb();
  const rows: Array<{ cardId: string; payload: string }> = await new Promise((resolve, reject) => {
    db.all(
      `SELECT cardId, payload FROM population_cache WHERE cardId IS NOT NULL`,
      (err, r: any[]) => (err ? reject(err) : resolve(r || []))
    );
  });
  const results: Array<{ cardId: string; payload: PopulationLookupResult }> = [];
  for (const row of rows) {
    try {
      results.push({ cardId: row.cardId, payload: JSON.parse(row.payload) });
    } catch {
      // skip malformed payloads
    }
  }
  return results;
};

/**
 * Save a population payload from a shared product-page scrape (nightly refresh).
 */
export const savePopulationScrape = async (
  cardId: string,
  input: PopulationLookupInput,
  match: { productId: string; matchScore: number },
  pageData: { psaPop: number[] | null; cgcPop: number[] | null; productId: string | null }
): Promise<void> => {
  const verified = pageData.productId === match.productId;
  const psa = buildGraderResult('psa', pageData.psaPop, {
    productId: pageData.productId,
    verified,
    matchScore: match.matchScore,
  });
  const cgc = buildGraderResult('cgc', pageData.cgcPop, {
    productId: pageData.productId,
    verified,
    matchScore: match.matchScore,
  });
  const beckett: GraderPopulationResult = {
    grader: 'beckett',
    total: null,
    grade10: null,
    grade9: null,
    pop: null,
    status: 'unavailable',
    source: 'none',
    message: 'No population result found',
  };

  const payload: PopulationLookupResult = {
    key: buildCacheKey({ ...input, cardId }),
    cardId,
    cardName: input.cardName,
    setId: input.setId,
    setName: input.setName,
    cardNumber: input.cardNumber,
    variant: input.variant,
    fetchedAt: Date.now(),
    cached: false,
    stale: false,
    ageHours: 0,
    productId: pageData.productId,
    verified,
    companies: { psa, cgc, beckett },
  };

  await saveCachedPopulation(payload.key, payload);
};
