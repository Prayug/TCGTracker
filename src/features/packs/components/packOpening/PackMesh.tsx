import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { HolographicMaterial } from '../../shaders/HolographicMaterial';
import { getTierAnim, TIER_COLORS, TIER_THEMES } from './tierConfig';
import { clamp01, easeInOutCubic, easeOutCubic } from './easing';

export const PackMesh: React.FC<{
  tier: string;
  timeRef: React.MutableRefObject<number>;
}> = ({ tier, timeRef }) => {
  const colors = TIER_COLORS[tier] ?? { base: '#3b82f6', glow: '#60a5fa' };
  const theme = TIER_THEMES[tier] || TIER_THEMES.starter;
  const anim = getTierAnim(tier);
  const groupRef = useRef<THREE.Group>(null);
  const crimpRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.Mesh>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const flashFired = useRef(false);

  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: colors.base,
        metalness: 0.75,
        roughness: 0.25,
        transparent: true,
      }),
    [colors.base]
  );
  const crimpMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: colors.base,
        metalness: 0.85,
        roughness: 0.35,
        transparent: true,
      }),
    [colors.base]
  );
  const foilMaterial = useMemo(
    () => new HolographicMaterial({ tint: colors.base, intensity: 0.6 }),
    [colors.base]
  );
  const auraMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: colors.glow,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [colors.glow]
  );
  const flashMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: theme.flashColor,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [theme.flashColor]
  );

  useEffect(
    () => () => {
      bodyMaterial.dispose();
      crimpMaterial.dispose();
      foilMaterial.dispose();
      auraMaterial.dispose();
      flashMaterial.dispose();
    },
    [bodyMaterial, crimpMaterial, foilMaterial, auraMaterial, flashMaterial]
  );

  useFrame(() => {
    const t = timeRef.current;
    foilMaterial.setTime(t);
    const group = groupRef.current;
    const crimp = crimpRef.current;
    const body = bodyRef.current;
    const aura = auraRef.current;
    const flash = flashRef.current;
    if (!group || !crimp || !body) return;

    const orbitEnd = anim.orbitDuration;
    const zoomEnd = orbitEnd + anim.zoomDuration;
    const ripEnd = zoomEnd + anim.ripDuration;

    // Aura — pulsing glow before rip
    if (aura) {
      if (t < zoomEnd) {
        auraMaterial.opacity = 0.15 + Math.sin(t * 3) * 0.08;
        aura.scale.setScalar(1.0 + Math.sin(t * 2) * 0.05);
      } else {
        auraMaterial.opacity *= 0.9;
      }
    }

    // Flash ring at rip moment
    if (flash) {
      if (t >= zoomEnd && !flashFired.current) {
        flashFired.current = true;
      }
      if (flashFired.current) {
        const flashAge = t - zoomEnd;
        if (flashAge < 0.5) {
          const fp = easeOutCubic(flashAge / 0.5);
          flash.scale.setScalar(0.5 + fp * 4);
          flashMaterial.opacity = (1 - fp) * 0.6;
        } else {
          flashMaterial.opacity = 0;
        }
      }
    }

    // ── TIER-SPECIFIC PACK BEHAVIOR ──

    if (t < orbitEnd) {
      // ORBIT PHASE — each tier has different idle behavior
      group.visible = true;
      bodyMaterial.opacity = 1;
      crimpMaterial.opacity = 1;
      foilMaterial.setOpacity(1);

      if (anim.packBehavior === 'levitate') {
        // Platinum: pack rises during orbit
        const rise = easeInOutCubic(t / orbitEnd);
        group.position.y = rise * 1.5;
        group.rotation.y = t * 2.0;
      } else if (anim.packBehavior === 'spin-tear') {
        // Bronze: pack spins in place before tear
        group.rotation.y = t * 4.0;
        group.position.y = Math.sin(t * 2.2) * 0.06 + 0.1;
      } else {
        // Others: gentle bob + rotation
        const shake = t > orbitEnd - 0.15 ? Math.sin(t * 90) * 0.04 : 0;
        group.rotation.y = Math.sin(t * 1.4) * 0.35 + shake;
        group.position.y = Math.sin(t * 2.2) * 0.06 + 0.1;
      }
      return;
    }

    if (t < zoomEnd) {
      // ZOOM PHASE — pack anticipates
      group.visible = true;
      group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, 0, 0.1);
      group.position.y = THREE.MathUtils.lerp(group.position.y, 0.2, 0.1);
      return;
    }

    if (t < ripEnd) {
      // RIP PHASE — tier-specific destruction
      const rip = clamp01((t - zoomEnd) / anim.ripDuration);
      const k = easeOutCubic(rip);

      group.visible = true;

      switch (anim.packBehavior) {
        case 'tear': {
          // Starter: fast tear, pack drops quickly
          crimp.position.set(k * 1.8, 1.05 + k * 3.5, k * 0.5);
          crimp.rotation.z = -k * 2.6;
          crimpMaterial.opacity = 1 - k;
          body.position.y = -k * 3.5;
          body.rotation.x = k * 0.9;
          bodyMaterial.opacity = 1 - k;
          foilMaterial.setOpacity(1 - k);
          break;
        }
        case 'spin-tear': {
          // Bronze: spins fast then tears
          const spinPhase = clamp01(rip * 2);
          const tearPhase = clamp01((rip - 0.5) * 2);
          group.rotation.y += spinPhase * 0.5;
          crimp.position.set(tearPhase * 1.8, 1.05 + tearPhase * 2.8, tearPhase * 0.5);
          crimp.rotation.z = -tearPhase * 2.6;
          crimpMaterial.opacity = 1 - tearPhase;
          body.position.y = -tearPhase * 2.8;
          body.rotation.x = tearPhase * 0.9;
          bodyMaterial.opacity = 1 - tearPhase;
          foilMaterial.setOpacity(1 - tearPhase);
          break;
        }
        case 'shatter': {
          // Silver: pack breaks into fragments (fragments handled by ShatterFragments)
          const shrink = 1 - k;
          group.scale.setScalar(Math.max(0.01, shrink));
          crimpMaterial.opacity = shrink;
          bodyMaterial.opacity = shrink;
          foilMaterial.setOpacity(shrink);
          break;
        }
        case 'explode': {
          // Gold: pack pulses/grows then vanishes
          const pulse = rip < 0.6 ? 1 + Math.sin(rip * Math.PI * 8) * 0.15 * (1 - rip) : 1;
          const explodePhase = clamp01((rip - 0.6) / 0.4);
          const shrink = 1 - easeOutCubic(explodePhase);
          group.scale.setScalar(pulse * Math.max(0.01, shrink));
          bodyMaterial.opacity = shrink;
          crimpMaterial.opacity = shrink;
          foilMaterial.setOpacity(shrink);
          // Glow intensifies during pulse
          auraMaterial.opacity = rip < 0.6 ? 0.4 + Math.sin(rip * 20) * 0.3 : 0;
          if (aura) aura.scale.setScalar(1 + rip * 2);
          break;
        }
        case 'levitate': {
          // Platinum: rises higher, charges, then bursts
          const risePhase = easeInOutCubic(clamp01(rip / 0.6));
          const burstPhase = clamp01((rip - 0.6) / 0.4);
          group.position.y = 1.5 + risePhase * 1.5;
          group.rotation.y = t * 4.0;

          // Charge glow
          auraMaterial.opacity = 0.3 + rip * 0.5;
          if (aura) aura.scale.setScalar(1.0 + rip * 3);

          // Burst: shrink to nothing
          if (burstPhase > 0) {
            const shrink = 1 - easeOutCubic(burstPhase);
            group.scale.setScalar(Math.max(0.01, shrink));
            bodyMaterial.opacity = shrink;
            crimpMaterial.opacity = shrink;
            foilMaterial.setOpacity(shrink);
          }
          break;
        }
      }
      return;
    }

    // POST-RIP — pack is gone
    group.visible = false;
  });

  return (
    <group ref={groupRef}>
      <mesh ref={crimpRef} position={[0, 1.05, 0]}>
        <boxGeometry args={[1.6, 0.4, 0.28]} />
        <primitive object={crimpMaterial} attach="material" />
      </mesh>

      <group ref={bodyRef}>
        <mesh position={[0, -0.15, 0]} castShadow>
          <RoundedBox args={[1.6, 2, 0.26]} radius={0.06} smoothness={4}>
            <primitive object={bodyMaterial} attach="material" />
          </RoundedBox>
        </mesh>
        <mesh position={[0, -0.15, 0.135]}>
          <planeGeometry args={[1.44, 1.84]} />
          <primitive object={foilMaterial} attach="material" />
        </mesh>
      </group>

      <mesh ref={auraRef} scale={1.0}>
        <sphereGeometry args={[1.4, 24, 24]} />
        <primitive object={auraMaterial} attach="material" />
      </mesh>

      <mesh ref={flashRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
        <ringGeometry args={[0.3, 0.5, 48]} />
        <primitive object={flashMaterial} attach="material" />
      </mesh>
    </group>
  );
};
