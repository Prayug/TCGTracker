export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

/** Whole-percent share, no sign (e.g. breadth "57%"). */
export function formatShare(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value)}%`;
}

export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}m`;
  if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}k`;
  return `$${Math.round(abs)}`;
}

/** Dollar move with explicit direction, e.g. "+$58.0k" / "-$4.8k". */
export function formatSignedMoney(absValue: number, direction: number): string {
  if (!Number.isFinite(absValue)) return '—';
  const sign = direction < 0 ? '-' : '+';
  return `${sign}${formatMoney(Math.abs(absValue))}`;
}

/** Percentage-point spread, e.g. "+46.2 pt". */
export function formatPts(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)} pt`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function moveTone(value: number | null | undefined): 'up' | 'down' | 'flat' {
  if (value == null || !Number.isFinite(value) || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

export function printsLabel(n: number): string {
  return `${n} ${n === 1 ? 'print' : 'prints'}`;
}

export function gradeLabel(finish: string | null | undefined): string {
  if (finish === 'psa10') return 'PSA 10';
  if (finish === 'raw') return 'Raw';
  return finish || '—';
}

export function gameMarketLabel(game: string): string {
  return game === 'onepiece' ? 'One Piece' : 'Pokémon';
}

/** Pick a symmetric axis bound: the smallest "nice" step ≥ the largest |value|. */
export function niceAxisBound(values: Array<number | null | undefined>, floor = 5): number {
  const maxAbs = Math.max(floor, ...values.map((v) => Math.abs(v ?? 0)));
  const steps = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 300, 500];
  return steps.find((s) => s >= maxAbs) ?? Math.ceil(maxAbs / 100) * 100;
}
