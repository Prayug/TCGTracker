import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HolographicMaterial } from '../../shaders/HolographicMaterial';
import { CARD_FLIGHT, CARD_H, CARD_INTERVAL, CARD_W, cardStart, fanSlot, rarityRank, TIER_COLORS } from './tierConfig';
import { clamp01, easeOutBack, easeOutCubic, lerp } from './easing';

export const RevealCard: React.FC<{
  index: number;
  total: number;
  imageUrl?: string | null;
  rarity?: string;
  tier: string;
  timeRef: React.MutableRefObject<number>;
  glamour: string;
}> = ({ index, total, imageUrl, rarity, tier, timeRef, glamour }) => {
  const colors = TIER_COLORS[tier] ?? { base: '#3b82f6', glow: '#60a5fa' };
  const rank = rarityRank(rarity);
  const groupRef = useRef<THREE.Group>(null);
  const sparklesRef = useRef<THREE.Points>(null);
  const auraRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  const departAt = cardStart(tier) + index * CARD_INTERVAL;

  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(imageUrl, (tex) => {
      if (cancelled) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      setTexture(tex);
    }, undefined, () => {});
    return () => { cancelled = true; };
  }, [imageUrl]);

  // Rarity-specific reveal parameters
  const revealConfig = useMemo(() => {
    switch (rank) {
      case 0: // Common — simple fade-in
        return { spinCount: 0, arcHeight: 0, arcX: 0, hasSpotlight: false, hasSparkles: false, hasAura: false, fadeIn: true, levitate: false };
      case 1: // Uncommon — single flip
        return { spinCount: 1, arcHeight: 0.3, arcX: 0.2, hasSpotlight: false, hasSparkles: false, hasAura: false, fadeIn: false, levitate: false };
      case 2: // Holo — double spin + glow
        return { spinCount: 2, arcHeight: 0.5, arcX: 0.3, hasSpotlight: false, hasSparkles: glamour === 'legendary' || glamour === 'god', hasAura: false, fadeIn: false, levitate: false };
      case 3: // Ultra — triple spin + spotlight + flash
        return { spinCount: 3, arcHeight: 0.7, arcX: 0.4, hasSpotlight: true, hasSparkles: true, hasAura: false, fadeIn: false, levitate: false };
      case 4: // Secret — levitate + bounce + aura + sparkles
        return { spinCount: 4, arcHeight: 1.0, arcX: 0.5, hasSpotlight: true, hasSparkles: true, hasAura: true, fadeIn: false, levitate: true };
      default:
        return { spinCount: 1, arcHeight: 0.3, arcX: 0.2, hasSpotlight: false, hasSparkles: false, hasAura: false, fadeIn: false, levitate: false };
    }
  }, [rank, glamour]);

  const holoIntensity = 0.15 + rank * 0.1;

  const frontMaterial = useMemo(
    () => new HolographicMaterial({ tint: colors.base, intensity: holoIntensity }),
    [colors.base, holoIntensity]
  );
  const backMaterial = useMemo(
    () => new HolographicMaterial({ tint: '#312e81', intensity: 0.6 }),
    []
  );

  useEffect(() => { frontMaterial.setMap(texture); }, [texture, frontMaterial]);
  useEffect(() => () => {
    frontMaterial.dispose(); backMaterial.dispose(); texture?.dispose();
  }, [frontMaterial, backMaterial, texture]);

  const slot = useMemo(() => fanSlot(index, total), [index, total]);

  // Per-card sparkles for ultra/secret
  const sparklePositions = useMemo(() => {
    if (!revealConfig.hasSparkles) return null;
    const n = 24;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const r = 0.8 + Math.random() * 0.4;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * CARD_H * 1.5;
      positions[i * 3 + 2] = Math.sin(angle) * r;
    }
    return positions;
  }, [revealConfig.hasSparkles]);

  // Aura material for secret rare
  const auraMaterial = useMemo(() => {
    if (!revealConfig.hasAura) return null;
    return new THREE.MeshBasicMaterial({
      color: colors.glow,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, [revealConfig.hasAura, colors.glow]);

  useEffect(() => () => { auraMaterial?.dispose(); }, [auraMaterial]);

  useFrame(() => {
    const t = timeRef.current;
    frontMaterial.setTime(t + index * 0.7);
    backMaterial.setTime(t + index * 0.7);

    const group = groupRef.current;
    if (!group) return;

    if (t < departAt) {
      group.visible = false;
      return;
    }
    group.visible = true;

    const progress = clamp01((t - departAt) / CARD_FLIGHT);

    if (revealConfig.fadeIn) {
      // Common: simple fade-in, no spin
      const fadeIn = easeOutCubic(progress);
      group.position.set(slot.x, slot.y, slot.z);
      group.rotation.y = 0;
      group.rotation.z = slot.rotZ;
      group.scale.setScalar(fadeIn);
      frontMaterial.setOpacity(fadeIn);
      backMaterial.setOpacity(fadeIn);
    } else if (revealConfig.levitate) {
      // Secret: levitate up → pause → drop with bounce
      const phase1 = clamp01(progress / 0.4); // levitate up
      const phase2 = clamp01((progress - 0.4) / 0.3); // pause at top
      const phase3 = clamp01((progress - 0.7) / 0.3); // drop with bounce

      const totalRotation = Math.PI * revealConfig.spinCount;
      let yPos: number;
      let currentRotation: number;

      if (progress < 0.4) {
        // Levitate up
        yPos = lerp(-0.5, 1.5, easeOutCubic(phase1));
        currentRotation = totalRotation * phase1;
      } else if (progress < 0.7) {
        // Pause at top with gentle rotation
        yPos = 1.5 + Math.sin(phase2 * Math.PI) * 0.1;
        currentRotation = totalRotation + phase2 * 0.3;
      } else {
        // Drop with bounce
        yPos = lerp(1.5, slot.y, easeOutBack(phase3));
        currentRotation = totalRotation + 0.3 + phase3 * Math.PI;
      }

      const arcX = Math.sin(progress * Math.PI) * revealConfig.arcX;
      group.position.set(
        lerp(0, slot.x, clamp01(progress * 1.5)) + arcX * (1 - progress),
        yPos,
        lerp(0.1, slot.z, easeOutCubic(clamp01(progress * 1.5)))
      );
      group.rotation.y = currentRotation;
      group.rotation.z = lerp(0, slot.rotZ, clamp01(progress * 1.5));

      const scale = progress < 0.4 ? lerp(0.3, 0.8, phase1) : progress < 0.7 ? 0.8 : lerp(0.8, 1, easeOutBack(phase3));
      group.scale.setScalar(scale);
    } else {
      // Standard flip reveal (uncommon, holo, ultra)
      const move = easeOutBack(progress);
      const totalRotation = Math.PI + Math.PI * revealConfig.spinCount;
      const flip = easeOutCubic(progress);
      const currentRotation = totalRotation * (1 - flip);

      const arcY = Math.sin(progress * Math.PI) * revealConfig.arcHeight;
      const arcX = Math.sin(progress * Math.PI * 0.5) * revealConfig.arcX;

      group.position.set(
        lerp(0, slot.x, move) + arcX * (1 - move),
        lerp(-0.2, slot.y, move) + arcY,
        lerp(0.1, slot.z, move)
      );
      group.rotation.y = currentRotation;
      group.rotation.z = lerp(0, slot.rotZ, flip);

      const scale = lerp(0.55, 1, move);
      group.scale.setScalar(scale);
    }

    // Settled: gentle floating
    if (progress >= 1) {
      group.position.y = slot.y + Math.sin(t * 1.6 + index * 1.3) * 0.025;
      group.rotation.x = Math.sin(t * 1.2 + index) * 0.02;
    }

    // Per-card sparkles rotation
    if (sparklesRef.current) {
      sparklesRef.current.rotation.y = t * 0.8 + index;
    }

    // Aura pulse for secret rare
    if (auraRef.current && auraMaterial) {
      if (progress >= 0.7 && progress < 1.0) {
        const auraProgress = (progress - 0.7) / 0.3;
        auraMaterial.opacity = easeOutCubic(auraProgress) * 0.3;
        auraRef.current.scale.setScalar(1 + auraProgress * 0.5);
      } else if (progress >= 1.0) {
        auraMaterial.opacity = 0.15 + Math.sin(t * 3) * 0.1;
        auraRef.current.scale.setScalar(1.0 + Math.sin(t * 2) * 0.1);
      }
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <primitive object={frontMaterial} attach="material" />
      </mesh>
      <mesh rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <primitive object={backMaterial} attach="material" />
      </mesh>

      {revealConfig.hasSpotlight && (
        <pointLight
          position={[0, 0, 1.5]}
          color={colors.glow}
          intensity={rank >= 4 ? 1.2 : 0.8}
          distance={3}
          decay={2}
        />
      )}

      {revealConfig.hasSparkles && sparklePositions && (
        <points ref={sparklesRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={sparklePositions.length / 3}
              array={sparklePositions}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial
            color={colors.glow}
            size={rank >= 4 ? 0.06 : 0.04}
            transparent
            opacity={0.7}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      )}

      {revealConfig.hasAura && auraMaterial && (
        <mesh ref={auraRef}>
          <sphereGeometry args={[1.2, 16, 16]} />
          <primitive object={auraMaterial} attach="material" />
        </mesh>
      )}
    </group>
  );
};
