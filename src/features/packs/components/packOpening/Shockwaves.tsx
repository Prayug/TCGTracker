import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTierAnim, TIER_COLORS } from './tierConfig';
import { easeOutCubic } from './easing';

export const ShockwaveRipple: React.FC<{
  tier: string;
  timeRef: React.MutableRefObject<number>;
}> = ({ tier, timeRef }) => {
  const colors = TIER_COLORS[tier] ?? { base: '#3b82f6', glow: '#60a5fa' };
  const anim = getTierAnim(tier);
  const cleanupRefs = useRef<THREE.MeshBasicMaterial[]>([]);

  const rippleCount = tier === 'platinum' ? 4 : tier === 'gold' ? 3 : 2;

  useEffect(() => {
    const mats = cleanupRefs.current;
    return () => {
      mats.forEach((m) => m?.dispose());
    };
  }, []);

  return (
    <>
      {Array.from({ length: rippleCount }).map((_, i) => (
        <ShockwaveRippleRing
          key={i}
          color={colors.glow}
          timeRef={timeRef}
          ripStart={anim.orbitDuration + anim.zoomDuration}
          delay={i * 0.08}
        />
      ))}
    </>
  );
};

const ShockwaveRippleRing: React.FC<{
  color: string;
  timeRef: React.MutableRefObject<number>;
  ripStart: number;
  delay: number;
}> = ({ color, timeRef, ripStart, delay }) => {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useEffect(() => {
    const mat = matRef.current;
    return () => {
      mat?.dispose();
    };
  }, []);

  useFrame(() => {
    const t = timeRef.current;
    const ring = ref.current;
    const mat = matRef.current;
    if (!ring || !mat) return;

    const age = t - ripStart - delay;
    if (age < 0 || age > 0.8) {
      ring.visible = false;
      return;
    }
    ring.visible = true;

    const prog = easeOutCubic(age / 0.8);
    const scale = 0.1 + prog * 6;
    ring.scale.set(scale, scale, 1);
    mat.opacity = (1 - prog) * 0.5;
    ring.rotation.z = prog * 0.3;
  });

  return (
    <mesh ref={ref} position={[0, 0.3, 0]}>
      <ringGeometry args={[0.8, 0.88, 64]} />
      <meshBasicMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={0}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
};

export const ShockwaveRings: React.FC<{
  tier: string;
  timeRef: React.MutableRefObject<number>;
  count: number;
}> = ({ tier, timeRef, count }) => {
  const colors = TIER_COLORS[tier] ?? { base: '#3b82f6', glow: '#60a5fa' };
  const anim = getTierAnim(tier);

  const rings = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      delay: i * 0.12,
      color: colors.glow,
    }));
  }, [count, colors.glow]);

  return (
    <>
      {rings.map((ring, i) => (
        <ShockwaveRing
          key={i}
          delay={ring.delay}
          color={ring.color}
          timeRef={timeRef}
          ripStart={anim.orbitDuration + anim.zoomDuration}
        />
      ))}
    </>
  );
};

const ShockwaveRing: React.FC<{
  delay: number;
  color: string;
  timeRef: React.MutableRefObject<number>;
  ripStart: number;
}> = ({ delay, color, timeRef, ripStart }) => {
  const ref = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useEffect(() => {
    if (matRef.current) matRef.current.dispose();
  }, []);

  useFrame(() => {
    const t = timeRef.current;
    const ring = ref.current;
    const mat = matRef.current;
    if (!ring || !mat) return;

    const age = t - ripStart - delay;
    if (age < 0 || age > 1.2) {
      ring.visible = false;
      return;
    }
    ring.visible = true;
    const prog = easeOutCubic(age / 1.2);
    ring.scale.setScalar(0.2 + prog * 5);
    mat.opacity = (1 - prog) * 0.35;
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.5, 0]}>
      <ringGeometry args={[0.8, 0.85, 64]} />
      <meshBasicMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={0}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
};
