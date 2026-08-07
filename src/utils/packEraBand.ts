export const PACK_ERA_BANDS = ['modern', 'sm_xy', 'bw_dp', 'vintage'] as const;
export type PackEraBand = (typeof PACK_ERA_BANDS)[number];

/**
 * Pack-shop era buckets. Equal weight across bands so EX-era PSA 10s cannot
 * drown SV/SWSH chase in the same dollar bracket.
 */
export function packEraBandFromSet(set?: { id?: string; name?: string }): PackEraBand {
  const id = (set?.id || '').toLowerCase();
  const name = (set?.name || '').toLowerCase();
  const blob = `${id} ${name}`;

  if (
    /mega evolution|\bme\d|\bme:|scarlet|violet|\bsv[\s:_-]|\bsv\d|zsv|rsv|swsh|sword|shield|\bpgo\b|celebrations|black bolt|white flare/.test(
      blob
    )
  ) {
    return 'modern';
  }
  if (
    /\bsm[\s:_-]|\bsm\d|\bxy\b|\bxy[\s:_-]|\bxy\d|sun\s*&?\s*moon|sun and moon|generations/.test(blob)
  ) {
    return 'sm_xy';
  }
  if (
    /\bbw[\s:_-]|\bbw\d|black\s*&?\s*white|black and white|heartgold|soulsilver|\bhgss|\bcol\d|call of legends|\bdp[\s:_-]|\bdp\d|\bpl\d|diamond|pearl|platinum/.test(
      blob
    )
  ) {
    return 'bw_dp';
  }
  return 'vintage';
}

function randomIndex(length: number): number {
  if (length <= 1) return 0;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] % length;
  }
  return Math.floor(Math.random() * length);
}

export function pickCandidateByEraBand<T>(
  candidates: T[],
  bandOf: (candidate: T) => PackEraBand
): T {
  if (candidates.length === 0) {
    throw new Error('pickCandidateByEraBand requires at least one candidate');
  }
  if (candidates.length === 1) return candidates[0];

  const groups = new Map<PackEraBand, T[]>();
  for (const candidate of candidates) {
    const band = bandOf(candidate);
    const list = groups.get(band);
    if (list) list.push(candidate);
    else groups.set(band, [candidate]);
  }

  const bands = [...groups.keys()];
  const chosenBand = bands[randomIndex(bands.length)];
  const group = groups.get(chosenBand) || candidates;
  return group[randomIndex(group.length)];
}
