import type { PokemonCard } from '../../types/pokemon';
import { proxyImageUrl } from '../../utils/cardDisplay';

export interface RingCardPlacement {
  id: string;
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  setIndex: number;
}

export interface RingSetCluster {
  id: string;
  name: string;
  releaseDate: string;
  index: number;
  count: number;
  color: string;
  center: [number, number, number];
  labelPosition: [number, number, number];
  labelAngle: number;
  placements: RingCardPlacement[];
}

export interface RingLayoutOptions {
  radius?: number;
  /** Thickness of the dense torus tube (particle-ring body). */
  tubeRadius?: number;
  maxSets?: number;
  maxCardsPerSet?: number;
  seed?: number;
  /**
   * Fraction of cards that leave the dense ring and float in the surrounding
   * volume (0–1). Higher = more “cards everywhere”, less pure ring.
   */
  fieldFraction?: number;
}

/** Old sets read cool indigo, newest sets warm pink — release date is visible as a color sweep. */
const SET_COLOR_STOPS = [
  { at: 0, hex: '#4f46e5' },
  { at: 0.5, hex: '#a855f7' },
  { at: 1, hex: '#f472b6' },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function gradientColor(ratio: number): string {
  const t = Math.min(1, Math.max(0, ratio));
  for (let i = 0; i < SET_COLOR_STOPS.length - 1; i++) {
    const a = SET_COLOR_STOPS[i];
    const b = SET_COLOR_STOPS[i + 1];
    if (t >= a.at && t <= b.at) {
      const local = b.at - a.at === 0 ? 0 : (t - a.at) / (b.at - a.at);
      const [r1, g1, b1] = hexToRgb(a.hex);
      const [r2, g2, b2] = hexToRgb(b.hex);
      const r = Math.round(r1 + (r2 - r1) * local);
      const g = Math.round(g1 + (g2 - g1) * local);
      const bl = Math.round(b1 + (b2 - b1) * local);
      return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
    }
  }
  return SET_COLOR_STOPS[SET_COLOR_STOPS.length - 1].hex;
}

/** Deterministic PRNG so clusters keep their shape across re-renders. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

/** Sample a point on a thick torus (fuzzy particle-ring body). */
function sampleTorus(
  rng: Rng,
  majorR: number,
  tubeR: number,
  angleBias: number,
  sectorHalf: number
): [number, number, number] {
  // Prefer the set’s sector, but bleed across neighbors so the ring feels continuous.
  const theta = angleBias + (rng() - 0.5) * 2 * sectorHalf * (0.7 + rng() * 0.9);
  const phi = rng() * Math.PI * 2;
  // Soft falloff: most mass near the tube core, long tail toward the edges.
  const tube = tubeR * Math.pow(rng(), 0.55) * (rng() < 0.5 ? 1 : -1);
  const r = majorR + Math.cos(phi) * tube + (rng() - 0.5) * tubeR * 0.35;
  const y = Math.sin(phi) * tube * 0.85 + (rng() - 0.5) * tubeR * 0.5;
  return [Math.cos(theta) * r, y, Math.sin(theta) * r];
}

/**
 * Fill the surrounding volume — inside the hole, past the ring, toward the
 * camera and deep behind — so the scene reads as a particle field with a ring.
 */
function sampleField(rng: Rng, majorR: number): [number, number, number] {
  const mode = rng();
  if (mode < 0.35) {
    // Inside / through the hole and near-field floaters
    const r = majorR * (0.05 + rng() * 0.55);
    const theta = rng() * Math.PI * 2;
    return [Math.cos(theta) * r, (rng() - 0.5) * majorR * 1.4, Math.sin(theta) * r];
  }
  if (mode < 0.7) {
    // Far outer halo
    const r = majorR * (1.35 + rng() * 1.1);
    const theta = rng() * Math.PI * 2;
    return [Math.cos(theta) * r, (rng() - 0.5) * majorR * 1.6, Math.sin(theta) * r];
  }
  // Free volume box around the whole scene (depth + height scatter)
  const extent = majorR * 1.85;
  return [
    (rng() - 0.5) * 2 * extent,
    (rng() - 0.5) * extent * 1.3,
    (rng() - 0.5) * 2 * extent,
  ];
}

function faceCameraish(
  rng: Rng,
  x: number,
  z: number
): [number, number, number] {
  const angle = Math.atan2(z, x);
  return [
    (rng() - 0.5) * 0.35,
    Math.PI / 2 - angle + (rng() - 0.5) * 0.55,
    (rng() - 0.5) * 0.35,
  ];
}

/**
 * Group cards by set, order sets by release date (oldest first), and place
 * them as a thick particle torus plus a surrounding field of free-floating cards.
 */
export function buildRingClusters(cards: PokemonCard[], options: RingLayoutOptions = {}): RingSetCluster[] {
  const {
    radius = 8,
    tubeRadius = 2.4,
    maxSets = 18,
    maxCardsPerSet = 9,
    seed = 1,
    fieldFraction = 0.42,
  } = options;

  const rng = mulberry32(seed);

  const groups = new Map<string, { id: string; name: string; releaseDate: string; cards: PokemonCard[] }>();
  for (const card of cards) {
    const set = card.set;
    if (!set?.id) continue;
    let group = groups.get(set.id);
    if (!group) {
      group = { id: set.id, name: set.name, releaseDate: set.releaseDate, cards: [] };
      groups.set(set.id, group);
    }
    if (group.cards.length < maxCardsPerSet) group.cards.push(card);
  }

  const sorted = [...groups.values()].sort((a, b) => {
    const av = new Date(a.releaseDate).getTime();
    const bv = new Date(b.releaseDate).getTime();
    return (Number.isNaN(av) ? Number.MAX_SAFE_INTEGER : av) - (Number.isNaN(bv) ? Number.MAX_SAFE_INTEGER : bv);
  });

  // When there are more sets than maxSets, stride-sample across the full
  // timeline (oldest → newest) so every era is represented on the ring.
  const chosen =
    sorted.length <= maxSets
      ? sorted
      : Array.from({ length: maxSets }, (_, i) => {
          const idx = Math.round((i / Math.max(1, maxSets - 1)) * (sorted.length - 1));
          return sorted[idx];
        });

  const count = chosen.length;
  if (count === 0) return [];

  return chosen.map((group, i) => {
    const ratio = count === 1 ? 0.5 : i / (count - 1);
    const theta = -Math.PI / 2 + (i / count) * Math.PI * 2;
    const color = gradientColor(ratio);
    const sectorHalf = (Math.PI / count) * 1.15;

    const placements: RingCardPlacement[] = group.cards.map((card) => {
      const inField = rng() < fieldFraction;
      const [x, y, z] = inField
        ? sampleField(rng, radius)
        : sampleTorus(rng, radius, tubeRadius, theta, sectorHalf);

      // Field cards drift a bit smaller / more varied so the ring stays the dense read.
      const scale = inField ? 0.45 + rng() * 0.55 : 0.7 + rng() * 0.55;

      return {
        id: card.id,
        url: proxyImageUrl(card.images?.small || card.images?.large) ?? '',
        position: [x, y, z],
        rotation: faceCameraish(rng, x, z),
        scale,
        setIndex: i,
      };
    });

    return {
      id: group.id,
      name: group.name,
      releaseDate: group.releaseDate,
      index: i,
      count: group.cards.length,
      color,
      center: [Math.cos(theta) * radius, 0, Math.sin(theta) * radius] as [number, number, number],
      labelPosition: [Math.cos(theta) * radius, tubeRadius + 0.4, Math.sin(theta) * radius] as [
        number,
        number,
        number,
      ],
      labelAngle: Math.PI / 2 - theta,
      placements,
    };
  });
}
