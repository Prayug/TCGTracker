import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTierAnim, TIER_COLORS } from './tierConfig';
import { clamp01, easeOutCubic } from './easing';

export const ShatterFragments: React.FC<{
  tier: string;
  timeRef: React.MutableRefObject<number>;
}> = ({ tier, timeRef }) => {
  const colors = TIER_COLORS[tier] ?? { base: '#3b82f6' };
  const anim = getTierAnim(tier);
  const count = anim.shatterPieces;
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const fragments = useMemo(() => {
    return Array.from({ length: count }, () => ({
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 3.5 + 1,
        (Math.random() - 0.5) * 5
      ),
      rot: new THREE.Vector3(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2),
      rotSpeed: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
      scale: 0.08 + Math.random() * 0.15,
    }));
  }, [count]);

  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: colors.base, metalness: 0.8, roughness: 0.3, transparent: true }),
    [colors.base]
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const t = timeRef.current;
    const mesh = instancedRef.current;
    if (!mesh) return;

    const ripStart = anim.orbitDuration + anim.zoomDuration;
    const age = t - ripStart;

    if (age < 0 || age > 1.8) { mesh.visible = false; return; }
    mesh.visible = true;

    const fadeOut = 1 - easeOutCubic(clamp01(age / 1.5));

    fragments.forEach((frag, i) => {
      const px = frag.velocity.x * age;
      const py = 0.5 + frag.velocity.y * age - 2.5 * age * age;
      const pz = frag.velocity.z * age;

      dummy.position.set(px, py, pz);
      dummy.rotation.set(
        frag.rot.x + frag.rotSpeed.x * age,
        frag.rot.y + frag.rotSpeed.y * age,
        frag.rot.z + frag.rotSpeed.z * age
      );
      dummy.scale.setScalar(frag.scale * Math.max(0, fadeOut));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh ref={instancedRef} args={[undefined, undefined, count]} visible={false}>
      <boxGeometry args={[0.5, 0.5, 0.15]} />
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
};
