import { Suspense, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { proxyImageUrl } from '../../utils/cardDisplay';
import { SafeCanvas } from './SafeCanvas';

/**
 * Visually verified chase / grail art only.
 * Do not add IDs without opening the image — set numbering is easy to get wrong.
 */
const CARD_IMAGE_URLS = [
  'https://images.pokemontcg.io/base1/4_hires.png', // Base Set Charizard
  'https://images.pokemontcg.io/ecard3/146_hires.png', // Crystal Charizard
  'https://images.pokemontcg.io/ecard2/149_hires.png', // Crystal Lugia
  'https://images.pokemontcg.io/neo4/107_hires.png', // Shining Charizard
  'https://images.pokemontcg.io/swsh7/215_hires.png', // Umbreon VMAX Evolving Skies
  'https://images.pokemontcg.io/swsh7/218_hires.png', // Rayquaza VMAX Evolving Skies
  'https://images.pokemontcg.io/swsh7/189_hires.png', // Umbreon V Evolving Skies
  'https://images.pokemontcg.io/swsh8/271_hires.png', // Gengar VMAX Fusion Strike alt
  'https://images.pokemontcg.io/swsh11/186_hires.png', // Giratina V Lost Origin alt
  'https://images.pokemontcg.io/swsh12/186_hires.png', // Lugia V Silver Tempest alt
  'https://images.pokemontcg.io/sv4pt5/232_hires.png', // Mew ex SIR Paldean Fates
  'https://images.pokemontcg.io/sv2/203_hires.png', // Magikarp IR Paldea Evolved
  'https://images.pokemontcg.io/sv8pt5/161_hires.png', // Umbreon ex SIR Prismatic
  'https://images.pokemontcg.io/sv8pt5/155_hires.png', // Espeon ex SIR Prismatic
  'https://images.pokemontcg.io/sv8pt5/156_hires.png', // Sylveon ex SIR Prismatic
  'https://images.pokemontcg.io/xy8/63_hires.png', // M Mewtwo-EX XY full art
  'https://images.pokemontcg.io/xy2/12_hires.png', // Charizard-EX Flashfire
  'https://images.pokemontcg.io/xy10/117_hires.png', // Alakazam-EX XY full art
  'https://images.pokemontcg.io/hgss3/89_hires.png', // Rayquaza & Deoxys LEGEND
  'https://images.pokemontcg.io/sv8pt5/150_hires.png', // Prismatic Evolutions chase
];

const CARD_IMAGES = CARD_IMAGE_URLS.map((url) => proxyImageUrl(url)!);

const CARD_W = 0.78;
const CARD_H = CARD_W * (88 / 63);
const RING_RADIUS = 3.25;
const CARD_COUNT = CARD_IMAGES.length;

/** Size scatter so the ring feels curated, not mechanical. */
const SIZE_STEPS = [1.48, 0.82, 1.28, 0.95, 1.4, 0.74, 1.18, 0.9, 1.34, 0.78];

const RING_POSITIONS = Array.from({ length: CARD_COUNT }, (_, i) => {
  const theta = (i / CARD_COUNT) * Math.PI * 2;
  const radius = RING_RADIUS + (i % 4) * 0.22 + (i % 2) * 0.06;
  return {
    x: Math.cos(theta) * radius,
    z: Math.sin(theta) * radius,
    y: Math.sin(i * 1.7) * 0.42,
    rotY: Math.PI / 2 - theta + (i % 2 === 0 ? 0.1 : -0.1),
    phase: i * 1.15,
    scale: SIZE_STEPS[i % SIZE_STEPS.length],
  };
});

function wrap01(n: number) {
  const f = n % 1;
  return f < 0 ? f + 1 : f;
}

function CardPlane({
  texture,
  position,
  rotY,
  phase,
  scale,
}: {
  texture: THREE.Texture;
  position: [number, number, number];
  rotY: number;
  phase: number;
  scale: number;
}) {
  const mesh = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.position.y = position[1] + Math.sin(t * 0.55 + phase) * 0.09;
    mesh.current.rotation.z = Math.sin(t * 0.4 + phase) * 0.04;
    mesh.current.rotation.x = Math.sin(t * 0.28 + phase) * 0.03;
  });

  return (
    <mesh ref={mesh} position={position} rotation={[0, rotY, 0]} scale={scale}>
      <planeGeometry args={[CARD_W, CARD_H]} />
      <meshStandardMaterial
        map={texture}
        roughness={0.28}
        metalness={0.22}
        envMapIntensity={1.15}
        emissive="#1a1612"
        emissiveIntensity={0.18}
      />
    </mesh>
  );
}

function FoilParticles() {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const count = 140;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2.0 + Math.random() * 3.8;
      arr[i * 3] = Math.cos(angle) * radius;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 5.2;
      arr[i * 3 + 2] = Math.sin(angle) * radius;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return geo;
  }, []);

  useFrame((state) => {
    if (!points.current) return;
    const t = state.clock.elapsedTime;
    points.current.rotation.y = t * 0.025;
    const pos = points.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 2) {
      pos.setY(i, ((pos.getY(i) + 0.003) % 5.2) - 2.6);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.03}
        color="#e8d4b0"
        transparent
        opacity={0.42}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function FloorRings() {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (outer.current) outer.current.rotation.z = -t * 0.035;
    if (inner.current) inner.current.rotation.z = t * 0.05;
  });

  return (
    <group position={[0, -1.85, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={outer}>
        <ringGeometry args={[3.5, 4.35, 96]} />
        <meshBasicMaterial
          color="#c4b49a"
          transparent
          opacity={0.09}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={inner}>
        <ringGeometry args={[2.15, 2.95, 96]} />
        <meshBasicMaterial
          color="#a8b4c0"
          transparent
          opacity={0.07}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function CameraRig({ progressRef }: { progressRef: MutableRefObject<number> }) {
  useFrame((state) => {
    const loop = wrap01(progressRef.current);
    const t = state.clock.elapsedTime;
    const cam = state.camera;
    cam.position.set(
      Math.sin(loop * Math.PI * 2 + t * 0.02) * 0.48,
      0.55 + Math.cos(loop * Math.PI * 2) * 0.14,
      7.15 - Math.sin(t * 0.08) * 0.1
    );
    cam.lookAt(0, 0.12, 0);
  });

  return null;
}

function WorldRig({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const textures = useTexture(CARD_IMAGES);

  useFrame((state) => {
    if (!group.current) return;
    // Slow majestic spin + optional progress drive
    group.current.rotation.y = progressRef.current * Math.PI * 2 + state.clock.elapsedTime * 0.048;
    group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.12) * 0.04;
  });

  return (
    <group ref={group} position={[0, 0.15, 0]}>
      {RING_POSITIONS.map((card, i) => (
        <CardPlane
          key={CARD_IMAGES[i]}
          texture={textures[i]}
          position={[card.x, card.y, card.z]}
          rotY={card.rotY}
          phase={card.phase}
          scale={card.scale}
        />
      ))}
      <FoilParticles />
      <FloorRings />
    </group>
  );
}

/** Ambient orbiting chase-card ring for the home hero. */
export function ScrollWorld({
  className,
  progressRef,
}: {
  className?: string;
  progressRef: MutableRefObject<number>;
}) {
  return (
    <SafeCanvas
      className={className}
      dpr={[1, 1.35]}
      camera={{ position: [0, 0.55, 7.15], fov: 34 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    >
      {/* Museum void + champagne / silver gallery lighting */}
      <ambientLight intensity={0.48} color="#f3ebe0" />
      <directionalLight position={[4.2, 5.5, 3]} intensity={1.55} color="#f5ead6" />
      <directionalLight position={[-3.5, 2.5, -2]} intensity={0.65} color="#c5d0dc" />
      <pointLight position={[-3.8, 1.8, 1.2]} intensity={70} color="#e4c9a0" distance={14} />
      <pointLight position={[3.6, -0.6, 2]} intensity={48} color="#9eafc0" distance={12} />
      <spotLight
        position={[0, 6.5, 2]}
        angle={0.58}
        penumbra={0.85}
        intensity={2.2}
        color="#fff6e8"
        castShadow={false}
      />
      <fog attach="fog" args={['#070708', 6.4, 13.2]} />
      <Suspense fallback={null}>
        <WorldRig progressRef={progressRef} />
      </Suspense>
      <CameraRig progressRef={progressRef} />
    </SafeCanvas>
  );
}
