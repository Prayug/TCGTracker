import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CameraRig } from './CameraRig';
import { EnvironmentScene } from './EnvironmentScene';
import { EnergyBuildup, OrbitEnergy } from './EnergyEffects';
import { ShockwaveRipple, ShockwaveRings } from './Shockwaves';
import { ShatterFragments } from './ShatterFragments';
import { PackMesh } from './PackMesh';
import { BurstParticles } from './BurstParticles';
import { RevealCard } from './RevealCard';
import { PostEffects } from './PostEffects';
import {
  CARD_FLIGHT,
  CARD_INTERVAL,
  COMPLETE_PAUSE,
  cardStart,
  getTierAnim,
  GLAMOUR_CONFIG,
  TIER_THEMES,
} from './tierConfig';
import type { PackOpeningSceneProps } from './types';

/**
 * Cinematic 3D pack-opening sequence with TIER-SPECIFIC animations.
 *
 * Each pack tier has a completely unique experience:
 *   Starter  — "Quick Draw":     Static camera, fast tear, minimal white sparks
 *   Bronze   — "Spark Burst":    Gentle orbit, spin-then-tear, bronze sparks
 *   Silver   — "Shatter Storm":  Dynamic zoom, pack shatters into fragments, metallic confetti
 *   Gold     — "Golden Eruption": Dramatic zoom+circle, pack pulses and explodes, golden confetti
 *   Platinum — "Prismatic Ascension": Rapid orbit, pack levitates and bursts, prismatic particles
 *
 * Card rarities also have distinct reveal choreographies:
 *   Common   — Simple fade-in
 *   Uncommon — Single flip slide-in
 *   Holo     — Double spin with glow arc
 *   Ultra    — Triple spin + spotlight + prismatic flash
 *   Secret   — Levitate up, pause, drop with bounce + prismatic aura + sparkles
 */
export const SceneContents: React.FC<PackOpeningSceneProps> = ({
  tier,
  cardImages,
  cardRarities = [],
  skip = false,
  onComplete,
  glamourLevel = 'normal',
}) => {
  const timeRef = useRef(0);
  const completedRef = useRef(false);
  const total = Math.max(cardImages.length, 1);
  const anim = getTierAnim(tier);
  const completeAt = cardStart(tier) + (total - 1) * CARD_INTERVAL + CARD_FLIGHT + COMPLETE_PAUSE;
  const config = GLAMOUR_CONFIG[glamourLevel] || GLAMOUR_CONFIG.normal;
  const theme = TIER_THEMES[tier] || TIER_THEMES.starter;

  useFrame(({ clock }) => {
    timeRef.current = skip ? completeAt + 10 : clock.getElapsedTime();
    if (!completedRef.current && timeRef.current >= completeAt) {
      completedRef.current = true;
      onComplete?.();
    }
  });

  return (
    <>
      <CameraRig
        timeRef={timeRef}
        baseZ={config.cameraZ}
        glamour={glamourLevel}
        tier={tier}
        cardRarities={cardRarities}
      />
      <EnvironmentScene tier={tier} glamourLevel={glamourLevel} timeRef={timeRef} />

      <ambientLight intensity={0.3 + (config.lightIntensity - 2.1) * 0.1} />
      <directionalLight position={[3, 4, 5]} intensity={config.lightIntensity} castShadow />
      <directionalLight position={[-4, 1, 3]} intensity={0.7} color="#c7d2fe" />
      <directionalLight position={[0, 3, -5]} intensity={1.4} color="#e0e7ff" />

      <PackMesh tier={tier} timeRef={timeRef} />
      <EnergyBuildup tier={tier} timeRef={timeRef} />
      <OrbitEnergy
        tier={tier}
        timeRef={timeRef}
        count={anim.packBehavior === 'levitate' ? 24 : 12}
      />

      {anim.packBehavior === 'shatter' && <ShatterFragments tier={tier} timeRef={timeRef} />}

      <ShockwaveRings tier={tier} timeRef={timeRef} count={theme.shockwaveCount} />
      <ShockwaveRipple tier={tier} timeRef={timeRef} />
      <BurstParticles tier={tier} timeRef={timeRef} count={config.particles} />

      {cardImages.map((url, i) => (
        <RevealCard
          key={i}
          index={i}
          total={total}
          imageUrl={url}
          rarity={cardRarities[i]}
          tier={tier}
          timeRef={timeRef}
          glamour={glamourLevel}
        />
      ))}

      <PostEffects glamour={glamourLevel} />
    </>
  );
};
