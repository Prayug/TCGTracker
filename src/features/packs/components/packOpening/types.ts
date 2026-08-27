export interface PackOpeningSceneProps {
  tier: string;
  cardImages: (string | null | undefined)[];
  cardRarities?: string[];
  skip?: boolean;
  onComplete?: () => void;
  glamourLevel?: 'normal' | 'good' | 'amazing' | 'legendary' | 'god';
}

export interface TierTheme {
  bgTop: string;
  bgBottom: string;
  ambientParticles: number;
  particleColors: string[];
  shockwaveCount: number;
  flashColor: string;
}

export interface TierAnimConfig {
  orbitDuration: number;
  zoomDuration: number;
  ripDuration: number;
  shakeDuration: number;
  packBehavior: 'tear' | 'spin-tear' | 'shatter' | 'explode' | 'levitate';
  shatterPieces: number;
  particleShape: 'spark' | 'confetti' | 'prismatic';
  particleSpeed: number;
  particleLifetime: number;
  orbitRadius: number;
  orbitSpeed: number;
  zoomDepth: number;
  bgPulseSpeed: number;
  bgPulseIntensity: number;
}
