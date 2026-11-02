/**
 * Binder covers are a per-viewer display choice. The binder API has no
 * cover field, so the choice is kept in this browser only.
 */
export interface BinderCover {
  id: string;
  label: string;
  /** CSS background for the cover and spine. */
  bg: string;
  ink: string;
}

export const BINDER_COVERS: BinderCover[] = [
  {
    id: 'graphite',
    label: 'Graphite',
    bg: 'linear-gradient(145deg,#2a3140,#11151d)',
    ink: '#f1eee7',
  },
  { id: 'cobalt', label: 'Cobalt', bg: 'linear-gradient(145deg,#3557e8,#14217a)', ink: '#ffffff' },
  { id: 'ember', label: 'Ember', bg: 'linear-gradient(145deg,#ff7a3d,#9b2a0c)', ink: '#fff6ee' },
  { id: 'forest', label: 'Forest', bg: 'linear-gradient(145deg,#1f9b78,#0b3b2f)', ink: '#effff9' },
  { id: 'violet', label: 'Violet', bg: 'linear-gradient(145deg,#9b6cf0,#3a1a7a)', ink: '#fbf7ff' },
  { id: 'gold', label: 'Gold', bg: 'linear-gradient(145deg,#f0c25a,#8a5a0f)', ink: '#2a1a03' },
  {
    id: 'holo',
    label: 'Holo',
    bg: 'linear-gradient(135deg,#ff6fae,#ffd36e 30%,#7cf2c2 55%,#6fb7ff 80%,#b18cff)',
    ink: '#111522',
  },
];

const KEY = 'tcg.binderCovers.v1';

function read(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function coverFor(binderId: number): BinderCover {
  const id = read()[String(binderId)];
  return (
    BINDER_COVERS.find((c) => c.id === id) ??
    BINDER_COVERS[binderId % 3 === 0 ? 1 : binderId % 3 === 1 ? 0 : 2]
  );
}

export function setCover(binderId: number, coverId: string): void {
  try {
    const all = read();
    all[String(binderId)] = coverId;
    window.localStorage.setItem(KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('tcg:binder-cover'));
  } catch {
    /* per-viewer convenience only */
  }
}
