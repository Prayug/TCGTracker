import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sparkles, RoundedBox } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { HolographicMaterial } from '../shaders/HolographicMaterial';

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

export interface PackOpeningSceneProps {
  tier: string;
  cardImages: (string | null | undefined)[];
  cardRarities?: string[];
  skip?: boolean;
  onComplete?: () => void;
  glamourLevel?: 'normal' | 'good' | 'amazing' | 'legendary' | 'god';
}

/* ═══════════════════════════════════════════════
   TIER CONFIGURATION
   ═══════════════════════════════════════════════ */

const TIER_COLORS: Record<string, { base: string; glow: string; ambient: string }> = {
  starter:  { base: '#64748b', glow: '#94a3b8', ambient: '#1e293b' },
  bronze:   { base: '#c2681e', glow: '#f59e0b', ambient: '#1a0f00' },
  silver:   { base: '#94a3b8', glow: '#e2e8f0', ambient: '#0f172a' },
  gold:     { base: '#d9a514', glow: '#fde047', ambient: '#1a1200' },
  platinum: { base: '#8b5cf6', glow: '#e879f9', ambient: '#0f0326' },
};

interface TierTheme {
  bgTop: string;
  bgBottom: string;
  ambientParticles: number;
  particleColors: string[];
  shockwaveCount: number;
  flashColor: string;
}

const TIER_THEMES: Record<string, TierTheme> = {
  starter: {
    bgTop: '#0f172a', bgBottom: '#020617',
    ambientParticles: 0, particleColors: ['#94a3b8', '#cbd5e1'],
    shockwaveCount: 1, flashColor: '#ffffff',
  },
  bronze: {
    bgTop: '#1a0f00', bgBottom: '#0c0500',
    ambientParticles: 20, particleColors: ['#f59e0b', '#fbbf24', '#d97706'],
    shockwaveCount: 2, flashColor: '#f59e0b',
  },
  silver: {
    bgTop: '#0f172a', bgBottom: '#020617',
    ambientParticles: 30, particleColors: ['#e2e8f0', '#f1f5f9', '#cbd5e1'],
    shockwaveCount: 2, flashColor: '#e2e8f0',
  },
  gold: {
    bgTop: '#1a1200', bgBottom: '#0a0800',
    ambientParticles: 50, particleColors: ['#fde047', '#facc15', '#eab308'],
    shockwaveCount: 3, flashColor: '#fde047',
  },
  platinum: {
    bgTop: '#0f0326', bgBottom: '#050014',
    ambientParticles: 70, particleColors: ['#e879f9', '#d946ef', '#a855f7', '#c084fc'],
    shockwaveCount: 3, flashColor: '#e879f9',
  },
};

/* ── Tier-Specific Animation Config ── */

interface TierAnimConfig {
  orbitDuration: number;
  zoomDuration: number;
  ripDuration: number;
  shakeDuration: number;
  packBehavior: 'tear' | 'spin-tear' | 'shatter' | 'explode' | 'levitate';
  shatterPieces: number;
  particleShape: 'spark' | 'confetti' | 'prismatic';
  particleSpeed: number;
  particleLifetime: number;
  orbitRadius: number;
  orbitSpeed: number;
  zoomDepth: number;
  bgPulseSpeed: number;
  bgPulseIntensity: number;
}

const TIER_ANIM: Record<string, TierAnimConfig> = {
  starter: {
    orbitDuration: 0.3, zoomDuration: 0.2, ripDuration: 0.3, shakeDuration: 0.2,
    packBehavior: 'tear', shatterPieces: 0,
    particleShape: 'spark', particleSpeed: 2.0, particleLifetime: 0.6,
    orbitRadius: 1.0, orbitSpeed: 0.5, zoomDepth: 1.0,
    bgPulseSpeed: 0.3, bgPulseIntensity: 0.1,
  },
  bronze: {
    orbitDuration: 0.5, zoomDuration: 0.3, ripDuration: 0.4, shakeDuration: 0.3,
    packBehavior: 'spin-tear', shatterPieces: 0,
    particleShape: 'spark', particleSpeed: 3.0, particleLifetime: 0.8,
    orbitRadius: 1.5, orbitSpeed: 1.0, zoomDepth: 1.5,
    bgPulseSpeed: 0.5, bgPulseIntensity: 0.2,
  },
  silver: {
    orbitDuration: 0.6, zoomDuration: 0.4, ripDuration: 0.5, shakeDuration: 0.3,
    packBehavior: 'shatter', shatterPieces: 8,
    particleShape: 'confetti', particleSpeed: 2.5, particleLifetime: 1.2,
    orbitRadius: 1.8, orbitSpeed: 1.5, zoomDepth: 2.0,
    bgPulseSpeed: 0.7, bgPulseIntensity: 0.3,
  },
  gold: {
    orbitDuration: 0.8, zoomDuration: 0.4, ripDuration: 0.6, shakeDuration: 0.3,
    packBehavior: 'explode', shatterPieces: 0,
    particleShape: 'confetti', particleSpeed: 3.5, particleLifetime: 1.0,
    orbitRadius: 2.0, orbitSpeed: 2.0, zoomDepth: 2.5,
    bgPulseSpeed: 0.9, bgPulseIntensity: 0.4,
  },
  platinum: {
    orbitDuration: 1.0, zoomDuration: 0.5, ripDuration: 0.7, shakeDuration: 0.3,
    packBehavior: 'levitate', shatterPieces: 0,
    particleShape: 'prismatic', particleSpeed: 4.0, particleLifetime: 2.0,
    orbitRadius: 2.2, orbitSpeed: 3.0, zoomDepth: 3.0,
    bgPulseSpeed: 1.2, bgPulseIntensity: 0.5,
  },
};

function getTierAnim(tier: string): TierAnimConfig {
  return TIER_ANIM[tier] || TIER_ANIM.starter;
}

function cardStart(tier: string): number {
  const a = getTierAnim(tier);
  return a.orbitDuration + a.zoomDuration + a.ripDuration + a.shakeDuration;
}

const GLAMOUR_CONFIG = {
  normal:  { particles: 160, cameraZ: 5.4, lightIntensity: 2.1, bloom: false, bloomStrength: 0 },
  good:    { particles: 260, cameraZ: 5.2, lightIntensity: 2.5, bloom: true, bloomStrength: 0.6 },
  amazing: { particles: 360, cameraZ: 5.0, lightIntensity: 3.0, bloom: true, bloomStrength: 0.9 },
  legendary: { particles: 500, cameraZ: 4.8, lightIntensity: 3.5, bloom: true, bloomStrength: 1.2 },
  god:     { particles: 700, cameraZ: 4.5, lightIntensity: 4.0, bloom: true, bloomStrength: 1.8 },
};

/* ─────────── Constants ─────────── */

const CARD_INTERVAL = 0.6;
const CARD_FLIGHT = 1.0;
const COMPLETE_PAUSE = 1.2;
const CARD_W = 1.26;
const CARD_H = 1.76;

/* ─────────── Easing Functions ─────────── */

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t: number) {
  const c1 = 1.35; const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function clamp01(t: number) { return Math.min(1, Math.max(0, t)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function fanSlot(i: number, n: number) {
  const center = (n - 1) / 2;
  const offset = i - center;
  const spreadX = Math.min(1.05, 3.9 / Math.max(n, 1));
  return { x: offset * spreadX, y: 0.05 - Math.abs(offset) * 0.07, z: 0.4 + i * 0.02, rotZ: -offset * 0.09 };
}

/* ─────────── Rarity Helpers ─────────── */

function rarityRank(rarity?: string): number {
  const r = (rarity || '').toLowerCase();
  if (r.includes('secret')) return 4;
  if (r.includes('ultra')) return 3;
  if (r.includes('holo') || r.includes('rare')) return 2;
  if (r.includes('uncommon')) return 1;
  return 0;
}

/* ═══════════════════════════════════════════════
   CAMERA RIG — Tier-specific cinematic camera
   ═══════════════════════════════════════════════ */

const CameraRig: React.FC<{
  timeRef: React.MutableRefObject<number>;
  baseZ: number;
  glamour: string;
  tier: string;
}> = ({ timeRef, baseZ, glamour, tier }) => {
  const { camera } = useThree();
  const shakeRef = useRef({ x: 0, y: 0 });
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
    }

    camera.position.x = lerp(camera.position.x, targetX + shakeRef.current.x, 0.08);
    camera.position.y = lerp(camera.position.y, targetY + shakeRef.current.y, 0.08);
    camera.position.z = lerp(camera.position.z, targetZ, 0.06);
    camera.lookAt(0, lookAtY, 0);
  });

  return null;
};

/* ═══════════════════════════════════════════════
   ENVIRONMENT — Tier-specific background
   ═══════════════════════════════════════════════ */

const EnvironmentScene: React.FC<{
  tier: string;
  glamourLevel: string;
  timeRef: React.MutableRefObject<number>;
}> = ({ tier, glamourLevel, timeRef }) => {
  const theme = TIER_THEMES[tier] || TIER_THEMES.starter;
  const anim = getTierAnim(tier);
  const isHighGlamour = glamourLevel === 'legendary' || glamourLevel === 'god';

  const bgMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(theme.bgTop) },
        uBottom: { value: new THREE.Color(theme.bgBottom) },
        uTime: { value: 0 },
        uTierGlow: { value: new THREE.Color(theme.particleColors[0] || '#ffffff') },
        uPulseSpeed: { value: anim.bgPulseSpeed },
        uPulseIntensity: { value: anim.bgPulseIntensity },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform float uTime;
        uniform vec3 uTierGlow;
        uniform float uPulseSpeed;
        uniform float uPulseIntensity;
        varying vec2 vUv;
        void main() {
          vec3 bg = mix(uBottom, uTop, vUv.y);
          float dist = length(vUv - vec2(0.5, 0.6));
          float glow = exp(-dist * 3.0) * uPulseIntensity * (0.7 + 0.3 * sin(uTime * uPulseSpeed));
          bg += uTierGlow * glow;
          gl_FragColor = vec4(bg, 1.0);
        }
      `,
    });
  }, [theme.bgTop, theme.bgBottom, theme.particleColors, anim.bgPulseSpeed, anim.bgPulseIntensity]);

  useEffect(() => () => bgMaterial.dispose(), [bgMaterial]);

  useFrame(() => {
    bgMaterial.uniforms.uTime.value = timeRef.current;
  });

  return (
    <>
      <mesh material={bgMaterial}>
        <sphereGeometry args={[30, 32, 32]} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial
          color={theme.bgBottom}
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.4}
        />
      </mesh>

      {isHighGlamour && (
        <Sparkles
          count={theme.ambientParticles}
          size={1.5}
          scale={[12, 8, 12]}
          speed={0.3}
          color={theme.particleColors[0]}
          opacity={0.3}
        />
      )}
    </>
  );
};

/* ═══════════════════════════════════════════════
   SHATTER FRAGMENTS — Pack pieces for silver tier
   ═══════════════════════════════════════════════ */

const ShatterFragments: React.FC<{
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

/* ═══════════════════════════════════════════════
   PACK MESH — Tier-specific pack behaviors
   ═══════════════════════════════════════════════ */

const PackMesh: React.FC<{
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
    () => new THREE.MeshStandardMaterial({
      color: colors.base, metalness: 0.75, roughness: 0.25, transparent: true,
    }), [colors.base]
  );
  const crimpMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: colors.base, metalness: 0.85, roughness: 0.35, transparent: true,
    }), [colors.base]
  );
  const foilMaterial = useMemo(
    () => new HolographicMaterial({ tint: colors.base, intensity: 0.6 }),
    [colors.base]
  );
  const auraMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: colors.glow, transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }), [colors.glow]
  );
  const flashMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({
      color: theme.flashColor, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }), [theme.flashColor]
  );

  useEffect(() => () => {
    bodyMaterial.dispose(); crimpMaterial.dispose(); foilMaterial.dispose();
    auraMaterial.dispose(); flashMaterial.dispose();
  }, [bodyMaterial, crimpMaterial, foilMaterial, auraMaterial, flashMaterial]);

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
          const pulse = rip < 0.6
            ? 1 + Math.sin(rip * Math.PI * 8) * 0.15 * (1 - rip)
            : 1;
          const explodePhase = clamp01((rip - 0.6) / 0.4);
          const shrink = 1 - easeOutCubic(explodePhase);
          group.scale.setScalar(pulse * Math.max(0.01, shrink));
          bodyMaterial.opacity = shrink;
          crimpMaterial.opacity = shrink;
          foilMaterial.setOpacity(shrink);
          // Glow intensifies during pulse
          auraMaterial.opacity = rip < 0.6 ? 0.4 + Math.sin(rip * 20) * 0.3 : 0;
          aura.scale.setScalar(1 + rip * 2);
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
          aura.scale.setScalar(1.0 + rip * 3);

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

/* ═══════════════════════════════════════════════
   SHOCKWAVE RINGS — Expanding rings on rip
   ═══════════════════════════════════════════════ */

const ShockwaveRings: React.FC<{
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
    if (age < 0 || age > 1.2) { ring.visible = false; return; }
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

/* ═══════════════════════════════════════════════
   BURST PARTICLES — Tier-specific particle systems
   ═══════════════════════════════════════════════ */

const BurstParticles: React.FC<{
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
      vertexShader: `
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
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
          gl_FragColor = vec4(vColor, alpha * vAlpha);
        }
      `,
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

/* ═══════════════════════════════════════════════
   REVEAL CARD — Rarity-specific dramatic reveals
   ═══════════════════════════════════════════════ */

const RevealCard: React.FC<{
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

/* ═══════════════════════════════════════════════
   POST-PROCESSING — Bloom + Vignette + Noise
   ═══════════════════════════════════════════════ */

const PostEffects: React.FC<{ glamour: string }> = ({ glamour }) => {
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

/* ═══════════════════════════════════════════════
   SCENE CONTENTS — Orchestrator
   ═══════════════════════════════════════════════ */

const SceneContents: React.FC<PackOpeningSceneProps> = ({
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
      <CameraRig timeRef={timeRef} baseZ={config.cameraZ} glamour={glamourLevel} tier={tier} />
      <EnvironmentScene tier={tier} glamourLevel={glamourLevel} timeRef={timeRef} />

      <ambientLight intensity={0.3 + (config.lightIntensity - 2.1) * 0.1} />
      <directionalLight position={[3, 4, 5]} intensity={config.lightIntensity} castShadow />
      <directionalLight position={[-4, 1, 3]} intensity={0.7} color="#c7d2fe" />
      <directionalLight position={[0, 3, -5]} intensity={1.4} color="#e0e7ff" />

      <PackMesh tier={tier} timeRef={timeRef} />

      {anim.packBehavior === 'shatter' && (
        <ShatterFragments tier={tier} timeRef={timeRef} />
      )}

      <ShockwaveRings tier={tier} timeRef={timeRef} count={theme.shockwaveCount} />
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

/* ═══════════════════════════════════════════════
   PACK OPENING SCENE — Canvas wrapper
   ═══════════════════════════════════════════════ */

const PackOpeningScene: React.FC<PackOpeningSceneProps> = (props) => {
  const config = GLAMOUR_CONFIG[props.glamourLevel || 'normal'];
  return (
    <div className="h-[500px] w-full sm:h-[600px]" aria-label="Pack opening animation">
      <Canvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
        }}
        dpr={[1, 2]}
        camera={{ position: [0, 0.25, config.cameraZ], fov: 40 }}
        shadows
      >
        <SceneContents {...props} />
      </Canvas>
    </div>
  );
};

export default PackOpeningScene;
