/**
 * Pure parsers for PriceCharting product-page chart_data (no DB / network).
 */

export interface SoldGuidePoint {
  date: string; // YYYY-MM-DD
  price: number; // dollars
  condition: 'ungraded' | 'psa10';
}

export interface ParsedChartSeries {
  ungraded: SoldGuidePoint[];
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
    condition: 'ungraded' | 'psa10'
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

  return {
    ungraded: toPoints(data?.used, 'ungraded'),
    psa10: toPoints(data?.graded, 'psa10'),
    productId,
  };
}
