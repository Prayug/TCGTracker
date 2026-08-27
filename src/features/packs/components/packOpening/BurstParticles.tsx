import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTierAnim, TIER_THEMES } from './tierConfig';
import { easeOutCubic } from './easing';

const BURST_VERTEX_SHADER = `
  attribute vec3 instancePosition;
  attribute float instanceSize;
  attribute vec3 instanceColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = instanceColor;
    vec3 pos = position * instanceSize + instancePosition;
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;
    vAlpha = 1.0;
  }
`;

const BURST_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
    gl_FragColor = vec4(vColor, alpha * vAlpha);
  }
`;

export const BurstParticles: React.FC<{
  tier: string;
  timeRef: React.MutableRefObject<number>;
  count: number;
}> = ({ tier, timeRef, count }) => {
  const theme = TIER_THEMES[tier] || TIER_THEMES.starter;
  const anim = getTierAnim(tier);
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const { velocities, sizes, initColors } = useMemo(() => {
    const vels: THREE.Vector3[] = [];
    const szs: number[] = [];
    const cols: THREE.Color[] = [];
    const colorPool = theme.particleColors.map(c => new THREE.Color(c));

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = anim.particleSpeed * (0.5 + Math.random() * 1.0);

      if (anim.particleShape === 'spark') {
        // Sparks: fast outward burst, gravity
        vels.push(new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.abs(Math.cos(phi)) * speed * 1.3,
          Math.sin(phi) * Math.sin(theta) * speed * 0.6
        ));
        szs.push(0.03 + Math.random() * 0.04);
      } else if (anim.particleShape === 'confetti') {
        // Confetti: wider spread, moderate upward
        vels.push(new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed * 0.8,
          Math.abs(Math.cos(phi)) * speed * 0.9 + 1.0,
          Math.sin(phi) * Math.sin(theta) * speed * 0.8
        ));
        szs.push(0.06 + Math.random() * 0.08);
      } else {
        // Prismatic: rise upward, slower horizontal
        vels.push(new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed * 0.5,
          Math.abs(Math.cos(phi)) * speed * 1.5 + 2.0,
          Math.sin(phi) * Math.sin(theta) * speed * 0.5
        ));
        szs.push(0.04 + Math.random() * 0.07);
      }

      cols.push(colorPool[Math.floor(Math.random() * colorPool.length)]);
    }
    return { velocities: vels, sizes: szs, initColors: cols };
  }, [count, theme.particleColors, anim.particleSpeed, anim.particleShape]);

  const geometry = useMemo(() => {
    const geo = new THREE.InstancedBufferGeometry();
    const baseGeo = new THREE.PlaneGeometry(1, 1);
    geo.index = baseGeo.index;
    geo.attributes = baseGeo.attributes;
    geo.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    return geo;
  }, [count]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: BURST_VERTEX_SHADER,
      fragmentShader: BURST_FRAGMENT_SHADER,
    });
  }, []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(() => {
    const t = timeRef.current;
    const mesh = instancedRef.current;
    if (!mesh) return;

    const ripStart = anim.orbitDuration + anim.zoomDuration;
    const life = (t - ripStart) / anim.particleLifetime;
    if (life <= 0 || life >= 1) { mesh.visible = false; return; }
    mesh.visible = true;

    const dt = t - ripStart;
    const fadeOut = 1 - easeOutCubic(life);

    const posAttr = geometry.attributes.instancePosition as THREE.InstancedBufferAttribute;
    const sizeAttr = geometry.attributes.instanceSize as THREE.InstancedBufferAttribute;
    const colAttr = geometry.attributes.instanceColor as THREE.InstancedBufferAttribute;

    for (let i = 0; i < count; i++) {
      const v = velocities[i];
      const px = v.x * dt;
      let py = 0.6 + v.y * dt;
      const pz = v.z * dt;

      if (anim.particleShape === 'spark' || anim.particleShape === 'confetti') {
        // Gravity for sparks and confetti
        py -= 2.2 * dt * dt;
      }
      // Prismatic: no gravity, particles rise

      dummy.position.set(px, py, pz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      posAttr.array[i * 3] = px;
      posAttr.array[i * 3 + 1] = py;
      posAttr.array[i * 3 + 2] = pz;

      sizeAttr.array[i] = sizes[i] * (0.3 + fadeOut * 0.7);

      colAttr.array[i * 3] = initColors[i].r;
      colAttr.array[i * 3 + 1] = initColors[i].g;
      colAttr.array[i * 3 + 2] = initColors[i].b;
    }

    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    material.opacity = fadeOut;
  });

  return (
    <instancedMesh ref={instancedRef} args={[undefined, undefined, count]} visible={false}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={material} attach="material" />
    </instancedMesh>
  );
};
