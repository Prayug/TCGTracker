import type { TierAnimConfig, TierTheme } from './types';

export const TIER_COLORS: Record<string, { base: string; glow: string; ambient: string }> = {
  starter: { base: '#64748b', glow: '#94a3b8', ambient: '#1e293b' },
  bronze: { base: '#c2681e', glow: '#f59e0b', ambient: '#1a0f00' },
  silver: { base: '#94a3b8', glow: '#e2e8f0', ambient: '#0f172a' },
  gold: { base: '#d9a514', glow: '#fde047', ambient: '#1a1200' },
  platinum: { base: '#8b5cf6', glow: '#e879f9', ambient: '#0f0326' },
};

export const TIER_THEMES: Record<string, TierTheme> = {
  starter: {
    bgTop: '#0f172a',
    bgBottom: '#020617',
    ambientParticles: 0,
    particleColors: ['#94a3b8', '#cbd5e1'],
    shockwaveCount: 2,
    flashColor: '#ffffff',
  },
  bronze: {
    bgTop: '#1a0f00',
    bgBottom: '#0c0500',
    ambientParticles: 30,
    particleColors: ['#f59e0b', '#fbbf24', '#d97706'],
    shockwaveCount: 3,
    flashColor: '#f59e0b',
  },
  silver: {
    bgTop: '#0f172a',
    bgBottom: '#020617',
    ambientParticles: 40,
    particleColors: ['#e2e8f0', '#f1f5f9', '#cbd5e1'],
    shockwaveCount: 3,
    flashColor: '#e2e8f0',
  },
  gold: {
    bgTop: '#1a1200',
    bgBottom: '#0a0800',
    ambientParticles: 60,
    particleColors: ['#fde047', '#facc15', '#eab308'],
    shockwaveCount: 4,
    flashColor: '#fde047',
  },
  platinum: {
    bgTop: '#0f0326',
    bgBottom: '#050014',
    ambientParticles: 80,
    particleColors: ['#e879f9', '#d946ef', '#a855f7', '#c084fc'],
    shockwaveCount: 5,
    flashColor: '#e879f9',
  },
};

export const TIER_ANIM: Record<string, TierAnimConfig> = {
  starter: {
    orbitDuration: 0.3,
    zoomDuration: 0.2,
    ripDuration: 0.3,
    shakeDuration: 0.2,
    packBehavior: 'tear',
    shatterPieces: 0,
    particleShape: 'spark',
    particleSpeed: 2.5,
    particleLifetime: 0.8,
    orbitRadius: 1.0,
    orbitSpeed: 0.5,
    zoomDepth: 1.0,
    bgPulseSpeed: 0.3,
    bgPulseIntensity: 0.1,
  },
  bronze: {
    orbitDuration: 0.5,
    zoomDuration: 0.3,
    ripDuration: 0.4,
    shakeDuration: 0.3,
    packBehavior: 'spin-tear',
    shatterPieces: 0,
    particleShape: 'spark',
    particleSpeed: 3.5,
    particleLifetime: 1.0,
    orbitRadius: 1.5,
    orbitSpeed: 1.0,
    zoomDepth: 1.5,
    bgPulseSpeed: 0.5,
    bgPulseIntensity: 0.2,
  },
  silver: {
    orbitDuration: 0.6,
    zoomDuration: 0.4,
    ripDuration: 0.5,
    shakeDuration: 0.3,
    packBehavior: 'shatter',
    shatterPieces: 12,
    particleShape: 'confetti',
    particleSpeed: 3.0,
    particleLifetime: 1.4,
    orbitRadius: 1.8,
    orbitSpeed: 1.5,
    zoomDepth: 2.0,
    bgPulseSpeed: 0.7,
    bgPulseIntensity: 0.3,
  },
  gold: {
    orbitDuration: 0.8,
    zoomDuration: 0.4,
    ripDuration: 0.6,
    shakeDuration: 0.3,
    packBehavior: 'explode',
    shatterPieces: 0,
    particleShape: 'confetti',
    particleSpeed: 4.0,
    particleLifetime: 1.2,
    orbitRadius: 2.0,
    orbitSpeed: 2.0,
    zoomDepth: 2.5,
    bgPulseSpeed: 0.9,
    bgPulseIntensity: 0.4,
  },
  platinum: {
    orbitDuration: 1.0,
    zoomDuration: 0.5,
    ripDuration: 0.7,
    shakeDuration: 0.3,
    packBehavior: 'levitate',
    shatterPieces: 0,
    particleShape: 'prismatic',
    particleSpeed: 5.0,
    particleLifetime: 2.5,
    orbitRadius: 2.2,
    orbitSpeed: 3.0,
    zoomDepth: 3.0,
    bgPulseSpeed: 1.2,
    bgPulseIntensity: 0.5,
  },
};

export function getTierAnim(tier: string): TierAnimConfig {
  return TIER_ANIM[tier] || TIER_ANIM.starter;
}

export function cardStart(tier: string): number {
  const a = getTierAnim(tier);
  return a.orbitDuration + a.zoomDuration + a.ripDuration + a.shakeDuration;
}

export const GLAMOUR_CONFIG = {
  normal: { particles: 200, cameraZ: 5.4, lightIntensity: 2.1, bloom: false, bloomStrength: 0 },
  good: { particles: 320, cameraZ: 5.2, lightIntensity: 2.5, bloom: true, bloomStrength: 0.7 },
  amazing: { particles: 440, cameraZ: 5.0, lightIntensity: 3.0, bloom: true, bloomStrength: 1.0 },
  legendary: { particles: 600, cameraZ: 4.8, lightIntensity: 3.5, bloom: true, bloomStrength: 1.4 },
  god: { particles: 850, cameraZ: 4.5, lightIntensity: 4.0, bloom: true, bloomStrength: 2.0 },
};

export const CARD_INTERVAL = 0.6;
export const CARD_FLIGHT = 1.0;
export const COMPLETE_PAUSE = 1.2;
export const CARD_W = 1.26;
export const CARD_H = 1.76;

export function fanSlot(i: number, n: number) {
  const center = (n - 1) / 2;
  const offset = i - center;
  const spreadX = Math.min(1.05, 3.9 / Math.max(n, 1));
  return {
    x: offset * spreadX,
    y: 0.05 - Math.abs(offset) * 0.07,
    z: 0.4 + i * 0.02,
    rotZ: -offset * 0.09,
  };
}

export function rarityRank(rarity?: string): number {
  const r = (rarity || '').toLowerCase();
  if (r.includes('secret')) return 4;
  if (r.includes('ultra')) return 3;
  if (r.includes('holo') || r.includes('rare')) return 2;
  if (r.includes('uncommon')) return 1;
  return 0;
}
