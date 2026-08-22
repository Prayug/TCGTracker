export type ScanMode = 'quick' | 'precision';

export type ShotId = 'front' | 'front-left' | 'front-right' | 'back' | 'back-left' | 'back-right';

export type ShotSpec = {
  id: ShotId;
  side: 'front' | 'back';
  title: string;
  instruction: string;
  requiredForPsa: boolean;
};

export const QUICK_SHOTS: ShotSpec[] = [
  {
    id: 'front',
    side: 'front',
    title: 'Front, straight-on',
    instruction: 'Unsleved on a dark mat. Fill the frame, camera parallel, no glare.',
    requiredForPsa: false,
  },
  {
    id: 'back',
    side: 'back',
    title: 'Back, straight-on',
    instruction: 'Flip the card. Same distance and lighting as the front.',
    requiredForPsa: true,
  },
];

export const PRECISION_SHOTS: ShotSpec[] = [
  {
    id: 'front',
    side: 'front',
    title: 'Front, straight-on',
    instruction: 'Hold the camera directly above the card. This shot is for centering.',
    requiredForPsa: false,
  },
  {
    id: 'front-left',
    side: 'front',
    title: 'Front, tilt left',
    instruction:
      'Keep the card still. Tilt the camera or light ~20° from the left so surface texture catches.',
    requiredForPsa: false,
  },
  {
    id: 'front-right',
    side: 'front',
    title: 'Front, tilt right',
    instruction:
      'Same card position. Light or camera from the right. Scratches change; print does not.',
    requiredForPsa: false,
  },
  {
    id: 'back',
    side: 'back',
    title: 'Back, straight-on',
    instruction: 'Flip the card. Camera parallel again for back centering and edges.',
    requiredForPsa: true,
  },
  {
    id: 'back-left',
    side: 'back',
    title: 'Back, tilt left',
    instruction:
      'Pokémon backs glare easily. Tilt left so whitening is not confused with reflection.',
    requiredForPsa: false,
  },
  {
    id: 'back-right',
    side: 'back',
    title: 'Back, tilt right',
    instruction:
      'Last surface pass from the right. Then we can tell persistent wear from moving glare.',
    requiredForPsa: false,
  },
];

export type CapturedShot = {
  spec: ShotSpec;
  image: File | string;
  preview: string;
};

export type GradeCapturePayload = {
  mode: ScanMode;
  front: File | string;
  back?: File | string;
  extraFrames?: Array<{ role: ShotId; image: File | string }>;
};

export function shotsForMode(mode: ScanMode): ShotSpec[] {
  return mode === 'precision' ? PRECISION_SHOTS : QUICK_SHOTS;
}

export function buildPayload(
  mode: ScanMode,
  captured: Partial<Record<ShotId, CapturedShot>>
): GradeCapturePayload | null {
  const front = captured.front;
  if (!front) return null;
  const extra: NonNullable<GradeCapturePayload['extraFrames']> = [];
  for (const spec of PRECISION_SHOTS) {
    if (spec.id === 'front' || spec.id === 'back') continue;
    const shot = captured[spec.id];
    if (shot) extra.push({ role: spec.id, image: shot.image });
  }
  return {
    mode,
    front: front.image,
    back: captured.back?.image,
    extraFrames: extra.length ? extra : undefined,
  };
}
