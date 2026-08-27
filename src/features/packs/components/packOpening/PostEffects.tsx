import React from 'react';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { GLAMOUR_CONFIG } from './tierConfig';

export const PostEffects: React.FC<{ glamour: string }> = ({ glamour }) => {
  const config = GLAMOUR_CONFIG[glamour as keyof typeof GLAMOUR_CONFIG] || GLAMOUR_CONFIG.normal;
  if (!config.bloom) return null;

  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.6}
        luminanceSmoothing={0.4}
        intensity={config.bloomStrength}
        mipmapBlur
      />
      <Vignette offset={0.3} darkness={0.7} blendFunction={BlendFunction.NORMAL} />
      <Noise blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.08} />
    </EffectComposer>
  );
};
