/** Each era gets its own colour field, so the timeline reads at a glance. */
export const ERA_TONE: Record<string, { from: string; to: string; accent: string }> = {
  mega: { from: '#4b1d78', to: '#12081f', accent: '#c79bff' },
  sv: { from: '#8a1f3d', to: '#1e0710', accent: '#ff8fb1' },
  swsh: { from: '#1d3f9a', to: '#08122e', accent: '#8fb1ff' },
  sm: { from: '#b4541a', to: '#2a1105', accent: '#ffb27a' },
  xy: { from: '#1f6c8a', to: '#06202b', accent: '#7fd6ff' },
  bw: { from: '#3a3f4a', to: '#0d0f13', accent: '#d6dbe4' },
  col: { from: '#5b4a1d', to: '#171206', accent: '#f0d27a' },
  hgss: { from: '#7a6a1c', to: '#1c1805', accent: '#ffe27a' },
  dp: { from: '#284f86', to: '#0a1527', accent: '#a9c8ff' },
  ex: { from: '#7d2020', to: '#1f0707', accent: '#ff9a8a' },
  ecard: { from: '#2f6d45', to: '#0a1d12', accent: '#9ff0bd' },
  neo: { from: '#2a5a7d', to: '#0a1722', accent: '#9fd8ff' },
  gym: { from: '#6d3a1a', to: '#1d0e05', accent: '#ffbf8a' },
  base: { from: '#8a6a12', to: '#231903', accent: '#ffd76a' },
  promo: { from: '#4a4a5a', to: '#111116', accent: '#e1e1f0' },
  other: { from: '#3d4350', to: '#0e1116', accent: '#c8ceda' },
  all: { from: '#2f56e6', to: '#0b1233', accent: '#a3b7ff' },
};

/** Discover links use broad buckets; they map onto real eras. */
export const ERA_ALIASES: Record<string, string[]> = {
  vintage: ['base', 'gym', 'neo', 'ecard'],
  modern: ['mega', 'sv', 'swsh'],
};

export function tone(era: string) {
  return ERA_TONE[era] ?? ERA_TONE.other;
}
