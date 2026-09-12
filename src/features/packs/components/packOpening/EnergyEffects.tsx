import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTierAnim, TIER_COLORS } from './tierConfig';
import { clamp01 } from './easing';

export const EnergyBuildup: React.FC<{
  tier: string;
  timeRef: React.MutableRefObject<number>;
}> = ({ tier, timeRef }) => {
  const colors = TIER_COLORS[tier] ?? { base: '#3b82f6', glow: '#60a5fa' };
  const anim = getTierAnim(tier);
  const orbRef = useRef<THREE.Mesh>(null);

  const material = useMemo(
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

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const t = timeRef.current;
    const orb = orbRef.current;
    if (!orb) return;

    const zoomEnd = anim.orbitDuration + anim.zoomDuration;
    const ripEnd = zoomEnd + anim.ripDuration;

    if (t < zoomEnd * 0.5) {
      material.opacity = 0;
      orb.visible = false;
      return;
    }

    orb.visible = true;
    const chargePhase = clamp01((t - zoomEnd * 0.5) / (zoomEnd * 0.5));
    const pulse = Math.sin(t * 12) * 0.3 + 0.7;
    material.opacity = chargePhase * 0.6 * pulse;
    orb.scale.setScalar(0.3 + chargePhase * 1.5);

    if (t >= zoomEnd) {
      const flashPhase = clamp01((t - zoomEnd) / 0.15);
      material.opacity = (1 - flashPhase) * 0.8;
      orb.scale.setScalar((1 + flashPhase * 3) * (1 - flashPhase));
    }

    if (t >= ripEnd) {
      material.opacity *= 0.85;
    }
  });

  return (
    <mesh ref={orbRef} position={[0, 0.3, 0]}>
      <sphereGeometry args={[0.6, 24, 24]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};

export const OrbitEnergy: React.FC<{
  tier: string;
  timeRef: React.MutableRefObject<number>;
  count: number;
}> = ({ tier, timeRef, count }) => {
  const colors = TIER_COLORS[tier] ?? { base: '#3b82f6', glow: '#60a5fa' };
  const anim = getTierAnim(tier);
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      angle: (i / count) * Math.PI * 2,
      radius: 1.2 + Math.random() * 0.6,
      speed: 0.8 + Math.random() * 0.6,
      yOffset: (Math.random() - 0.5) * 0.8,
      size: 0.02 + Math.random() * 0.03,
      phase: Math.random() * Math.PI * 2,
    }));
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: colors.glow,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [colors.glow]
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const t = timeRef.current;
    const mesh = instancedRef.current;
    if (!mesh) return;

    const orbitEnd = anim.orbitDuration + anim.zoomDuration;
    if (t >= orbitEnd) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    const fadeOut = t > orbitEnd - 0.3 ? 1 - (t - (orbitEnd - 0.3)) / 0.3 : 1;

    particles.forEach((p, i) => {
      const currentAngle = p.angle + t * p.speed;
      const wobble = Math.sin(t * 2 + p.phase) * 0.15;
      const px = Math.cos(currentAngle) * (p.radius + wobble);
      const py = p.yOffset + Math.sin(t * 1.5 + p.phase) * 0.2;
      const pz = Math.sin(currentAngle) * (p.radius + wobble);

      dummy.position.set(px, py, pz);
      dummy.scale.setScalar(p.size * fadeOut);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={instancedRef} args={[undefined, undefined, count]} visible={false}>
      <sphereGeometry args={[1, 6, 6]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
};
