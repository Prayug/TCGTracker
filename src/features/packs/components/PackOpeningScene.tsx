import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HolographicMaterial } from '../shaders/HolographicMaterial';

/**
 * 3D pack-opening sequence rendered with React Three Fiber.
 *
 * Timeline (seconds, driven by the frame clock so it can be fast-forwarded):
 *   0.0 – 1.1   pack idles (gentle Y rotation + bob)
 *   1.1 – 1.7   pack rips: crimp tears off, body drops away, particles burst
 *   1.6 + i*Δ   card i flies out of the pack, flipping back-to-front,
 *               then settles into a fanned arrangement
 *
 * The component is lazy-loaded by PackOpeningModal and only used when WebGL
 * is available and the user does not prefer reduced motion.
 */

export interface PackOpeningSceneProps {
  tier: string;
  /** Small card image URLs (may contain gaps for cards without images). */
  cardImages: (string | null | undefined)[];
  /** Fast-forward the whole sequence (user pressed Skip). */
  skip?: boolean;
  onComplete?: () => void;
}

const TIER_COLORS: Record<string, { base: string; glow: string }> = {
  starter: { base: '#64748b', glow: '#94a3b8' },
  bronze: { base: '#c2681e', glow: '#f59e0b' },
  silver: { base: '#94a3b8', glow: '#e2e8f0' },
  gold: { base: '#d9a514', glow: '#fde047' },
  platinum: { base: '#8b5cf6', glow: '#e879f9' },
};

const IDLE_END = 1.1;
const RIP_DURATION = 0.6;
const CARD_START = 1.55;
const CARD_INTERVAL = 0.55;
const CARD_FLIGHT = 0.8;
const COMPLETE_PAUSE = 0.9;

const CARD_W = 1.26;
const CARD_H = 1.76;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t: number) {
  const c1 = 1.35;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t));
}

/** Fan slot (position + rotation) for card `i` of `n` once it settles. */
function fanSlot(i: number, n: number) {
  const center = (n - 1) / 2;
  const offset = i - center;
  const spreadX = Math.min(1.05, 3.9 / Math.max(n, 1));
  return {
    x: offset * spreadX,
    y: 0.05 - Math.abs(offset) * 0.07,
    z: 0.4 + i * 0.02,
    rotZ: -offset * 0.09,
  };
}

const PackMesh: React.FC<{ tier: string; timeRef: React.MutableRefObject<number> }> = ({
  tier,
  timeRef,
}) => {
  const colors = TIER_COLORS[tier] ?? { base: '#3b82f6', glow: '#60a5fa' };
  const groupRef = useRef<THREE.Group>(null);
  const crimpRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<THREE.Group>(null);

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
    () => new HolographicMaterial({ tint: colors.base, intensity: 0.5 }),
    [colors.base]
  );

  useEffect(
    () => () => {
      bodyMaterial.dispose();
      crimpMaterial.dispose();
      foilMaterial.dispose();
    },
    [bodyMaterial, crimpMaterial, foilMaterial]
  );

  useFrame(() => {
    const t = timeRef.current;
    foilMaterial.setTime(t);
    const group = groupRef.current;
    const crimp = crimpRef.current;
    const body = bodyRef.current;
    if (!group || !crimp || !body) return;

    if (t < IDLE_END) {
      // Idle: slow rotation and bob, with a nervous shake right before the rip.
      const shake = t > IDLE_END - 0.25 ? Math.sin(t * 90) * 0.03 : 0;
      group.rotation.y = Math.sin(t * 1.4) * 0.35 + shake;
      group.position.y = Math.sin(t * 2.2) * 0.06 + 0.1;
      group.visible = true;
      return;
    }

    const rip = clamp01((t - IDLE_END) / RIP_DURATION);
    const k = easeOutCubic(rip);
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, 0, 0.25);

    // Crimp tears off toward the upper right, spinning as it goes.
    crimp.position.set(k * 1.6, 1.05 + k * 2.4, k * 0.5);
    crimp.rotation.z = -k * 2.4;
    crimpMaterial.opacity = 1 - k;

    // Body falls away and fades so the cards take the stage.
    body.position.y = -k * 2.6;
    body.rotation.x = k * 0.9;
    bodyMaterial.opacity = 1 - k;
    foilMaterial.setOpacity(1 - k);

    group.visible = rip < 1;
  });

  return (
    <group ref={groupRef}>
      <mesh ref={crimpRef} position={[0, 1.05, 0]}>
        <boxGeometry args={[1.6, 0.4, 0.28]} />
        <primitive object={crimpMaterial} attach="material" />
      </mesh>
      <group ref={bodyRef}>
        <mesh position={[0, -0.15, 0]}>
          <boxGeometry args={[1.6, 2, 0.26]} />
          <primitive object={bodyMaterial} attach="material" />
        </mesh>
        <mesh position={[0, -0.15, 0.135]}>
          <planeGeometry args={[1.44, 1.84]} />
          <primitive object={foilMaterial} attach="material" />
        </mesh>
      </group>
    </group>
  );
};

const PARTICLE_COUNT = 140;

const BurstParticles: React.FC<{ tier: string; timeRef: React.MutableRefObject<number> }> = ({
  tier,
  timeRef,
}) => {
  const colors = TIER_COLORS[tier] ?? { base: '#3b82f6', glow: '#60a5fa' };
  const pointsRef = useRef<THREE.Points>(null);

  const { geometry, velocities } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const vels: THREE.Vector3[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 1.2 + Math.random() * 2.6;
      vels.push(
        new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.abs(Math.cos(phi)) * speed * 1.2,
          Math.sin(phi) * Math.sin(theta) * speed * 0.6
        )
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry: geo, velocities: vels };
  }, []);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: colors.glow,
        size: 0.055,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [colors.glow]
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  useFrame(() => {
    const t = timeRef.current;
    const points = pointsRef.current;
    if (!points) return;

    const life = (t - IDLE_END) / 1.3;
    if (life <= 0 || life >= 1) {
      points.visible = false;
      return;
    }
    points.visible = true;
    material.opacity = 1 - easeOutCubic(life);

    const dt = (t - IDLE_END) * 0.85;
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const v = velocities[i];
      positions[i * 3] = v.x * dt;
      positions[i * 3 + 1] = 0.6 + v.y * dt - 2.2 * dt * dt;
      positions[i * 3 + 2] = v.z * dt;
    }
    geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} visible={false}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={material} attach="material" />
    </points>
  );
};

const RevealCard: React.FC<{
  index: number;
  total: number;
  imageUrl?: string | null;
  tier: string;
  timeRef: React.MutableRefObject<number>;
}> = ({ index, total, imageUrl, tier, timeRef }) => {
  const colors = TIER_COLORS[tier] ?? { base: '#3b82f6', glow: '#60a5fa' };
  const groupRef = useRef<THREE.Group>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      imageUrl,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        setTexture(tex);
      },
      undefined,
      // Load failure: keep the tinted holographic front as the fallback face.
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const frontMaterial = useMemo(
    () => new HolographicMaterial({ tint: colors.base, intensity: 0.22 }),
    [colors.base]
  );
  const backMaterial = useMemo(
    () => new HolographicMaterial({ tint: '#312e81', intensity: 0.6 }),
    []
  );

  useEffect(() => {
    frontMaterial.setMap(texture);
  }, [texture, frontMaterial]);

  useEffect(
    () => () => {
      frontMaterial.dispose();
      backMaterial.dispose();
      texture?.dispose();
    },
    [frontMaterial, backMaterial, texture]
  );

  const slot = useMemo(() => fanSlot(index, total), [index, total]);
  const departAt = CARD_START + index * CARD_INTERVAL;

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
    const move = easeOutBack(progress);
    const flip = easeOutCubic(progress);

    group.position.set(
      THREE.MathUtils.lerp(0, slot.x, move),
      THREE.MathUtils.lerp(-0.2, slot.y, move) + Math.sin(progress * Math.PI) * 0.55,
      THREE.MathUtils.lerp(0.1, slot.z, move)
    );
    // Flip from back (PI) to front (0) mid-flight.
    group.rotation.y = THREE.MathUtils.lerp(Math.PI, 0, flip);
    group.rotation.z = THREE.MathUtils.lerp(0, slot.rotZ, flip);

    const scale = THREE.MathUtils.lerp(0.55, 1, move);
    group.scale.setScalar(scale);

    // Settled: subtle floating so the fan feels alive.
    if (progress >= 1) {
      group.position.y = slot.y + Math.sin(t * 1.6 + index * 1.3) * 0.02;
      group.rotation.x = Math.sin(t * 1.2 + index) * 0.02;
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
    </group>
  );
};

const SceneContents: React.FC<PackOpeningSceneProps> = ({
  tier,
  cardImages,
  skip = false,
  onComplete,
}) => {
  const timeRef = useRef(0);
  const completedRef = useRef(false);
  const total = Math.max(cardImages.length, 1);
  const completeAt = CARD_START + (total - 1) * CARD_INTERVAL + CARD_FLIGHT + COMPLETE_PAUSE;

  useFrame(({ clock }) => {
    timeRef.current = skip ? completeAt + 10 : clock.getElapsedTime();
    if (!completedRef.current && timeRef.current >= completeAt) {
      completedRef.current = true;
      onComplete?.();
    }
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      {/* Three-point studio lighting: key, fill, rim. */}
      <directionalLight position={[3, 4, 5]} intensity={2.1} />
      <directionalLight position={[-4, 1, 3]} intensity={0.7} color="#c7d2fe" />
      <directionalLight position={[0, 3, -5]} intensity={1.4} color="#e0e7ff" />

      <PackMesh tier={tier} timeRef={timeRef} />
      <BurstParticles tier={tier} timeRef={timeRef} />
      {cardImages.map((url, i) => (
        <RevealCard
          key={i}
          index={i}
          total={total}
          imageUrl={url}
          tier={tier}
          timeRef={timeRef}
        />
      ))}
    </>
  );
};

const PackOpeningScene: React.FC<PackOpeningSceneProps> = (props) => {
  return (
    <div className="h-[380px] w-full sm:h-[440px]" aria-label="Pack opening animation">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        camera={{ position: [0, 0.25, 5.4], fov: 40 }}
      >
        <SceneContents {...props} />
      </Canvas>
    </div>
  );
};

export default PackOpeningScene;
