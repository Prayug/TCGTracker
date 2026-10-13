/**
 * Pure parsers for PriceCharting product-page chart_data (no DB / network).
 */

export interface SoldGuidePoint {
  date: string; // YYYY-MM-DD
  price: number; // dollars
  condition: 'ungraded' | 'psa9' | 'psa10';
}

export interface ParsedChartSeries {
  ungraded: SoldGuidePoint[];
  psa9: SoldGuidePoint[];
  psa10: SoldGuidePoint[];
  productId: string | null;
}

function msToDate(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

/** Extract chart_data JSON blob from a PriceCharting product HTML page. */
export function extractChartDataBlob(html: string): Record<string, [number, number][]> | null {
  const marker = html.indexOf('chart_data');
  if (marker < 0) return null;
  const eq = html.indexOf('=', marker);
  if (eq < 0) return null;
  const start = html.indexOf('{', eq);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as Record<string, [number, number][]>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function parseSoldGuideSeries(html: string): ParsedChartSeries {
  const data = extractChartDataBlob(html);
  const productIdMatch =
    html.match(/product-id="(\d+)"/i) || html.match(/\/offers\?product=(\d+)/i);
  const productId = productIdMatch?.[1] ?? null;

  const toPoints = (
    pairs: [number, number][] | undefined,
    condition: SoldGuidePoint['condition']
  ): SoldGuidePoint[] => {
    if (!pairs?.length) return [];
    return pairs
      .filter(([, cents]) => Number.isFinite(cents) && cents > 0)
      .map(([ms, cents]) => ({
        date: msToDate(ms),
        price: Math.round((cents / 100) * 100) / 100,
        condition,
      }));
  };

  // PriceCharting reuses its video-game condition keys for cards: `used` is
  // ungraded, `graded` is Grade 9 and `manualonly` is PSA 10 (the same mapping
  // as the page's `manual-only-price` / `completed-auctions-manual-only`).
  return {
    ungraded: toPoints(data?.used, 'ungraded'),
    psa9: toPoints(data?.graded, 'psa9'),
    psa10: toPoints(data?.manualonly, 'psa10'),
    productId,
  };
}
