import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CARD_FLIGHT, CARD_INTERVAL, cardStart, getTierAnim, GLAMOUR_CONFIG, rarityRank } from './tierConfig';
import { clamp01, easeInOutCubic, easeOutCubic, lerp } from './easing';

export const CameraRig: React.FC<{
  timeRef: React.MutableRefObject<number>;
  baseZ: number;
  glamour: string;
  tier: string;
  cardRarities?: string[];
}> = ({ timeRef, baseZ, glamour, tier, cardRarities = [] }) => {
  const { camera } = useThree();
  const shakeRef = useRef({ x: 0, y: 0 });
  const punchRef = useRef(0);
  const anim = getTierAnim(tier);

  useFrame(() => {
    const t = timeRef.current;
    const g = glamour as keyof typeof GLAMOUR_CONFIG;
    const shakeIntensity = g === 'god' ? 0.14 : g === 'legendary' ? 0.10 : 0.06;

    const orbitEnd = anim.orbitDuration;
    const zoomEnd = orbitEnd + anim.zoomDuration;
    const ripEnd = zoomEnd + anim.ripDuration;
    const shakeEnd = ripEnd + anim.shakeDuration;

    let targetX = 0;
    let targetY = 0.25;
    let targetZ = baseZ;
    let lookAtY = 0;

    if (t < orbitEnd) {
      const angle = (t / orbitEnd) * Math.PI * 0.4 * anim.orbitSpeed;
      targetX = Math.sin(angle) * anim.orbitRadius;
      targetZ = baseZ + Math.cos(angle) * 0.8;
      targetY = 0.3 + Math.sin(t * 0.8) * 0.15;
    } else if (t < zoomEnd) {
      const zoomProg = easeInOutCubic((t - orbitEnd) / anim.zoomDuration);
      targetZ = lerp(baseZ, baseZ - anim.zoomDepth, zoomProg);
      targetY = lerp(0.3, 0.5, zoomProg);
      lookAtY = lerp(0, 0.3, zoomProg);
    } else if (t < shakeEnd) {
      const ripProg = clamp01((t - zoomEnd) / anim.ripDuration);
      const shakeDecay = 1 - easeOutCubic(clamp01((t - ripEnd) / 0.4));
      targetZ = lerp(baseZ - anim.zoomDepth, baseZ + 0.3, easeOutCubic(ripProg));
      targetY = lerp(0.5, 0.2, ripProg);

      const shakeFreq = 30 + Math.random() * 20;
      shakeRef.current.x = Math.sin(t * shakeFreq) * shakeIntensity * shakeDecay;
      shakeRef.current.y = Math.cos(t * shakeFreq * 1.3) * shakeIntensity * shakeDecay * 0.7;
    } else {
      targetZ = baseZ + 0.3 + Math.sin(t * 0.3) * 0.2;
      targetY = 0.2 + Math.sin(t * 0.5) * 0.05;
      targetX = Math.sin(t * 0.2) * 0.4;
      shakeRef.current.x *= 0.9;
      shakeRef.current.y *= 0.9;

      const cardStartBase = cardStart(tier);
      for (let i = 0; i < cardRarities.length; i++) {
        const rank = rarityRank(cardRarities[i]);
        if (rank >= 3) {
          const cardRevealStart = cardStartBase + i * CARD_INTERVAL;
          const cardProgress = clamp01((t - cardRevealStart) / CARD_FLIGHT);
          if (cardProgress > 0.2 && cardProgress < 0.6) {
            const punchStrength = rank >= 4 ? 0.6 : 0.35;
            const punchProg = clamp01((cardProgress - 0.2) / 0.4);
            punchRef.current = Math.sin(punchProg * Math.PI) * punchStrength;
          }
        }
      }
      if (punchRef.current > 0.01) {
        targetZ -= punchRef.current;
        punchRef.current *= 0.92;
      }
    }

    camera.position.x = lerp(camera.position.x, targetX + shakeRef.current.x, 0.08);
    camera.position.y = lerp(camera.position.y, targetY + shakeRef.current.y, 0.08);
    camera.position.z = lerp(camera.position.z, targetZ, 0.06);
    camera.lookAt(0, lookAtY, 0);
  });

  return null;
};
