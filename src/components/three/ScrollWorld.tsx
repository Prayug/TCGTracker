import { Suspense, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { proxyImageUrl } from '../../utils/cardDisplay';

/**
 * Visually verified chase / grail art only.
 * Do not add IDs without opening the image — set numbering is easy to get wrong
 * (e.g. dp5/96 is Recover Energy, xy2/29 is Floatzel).
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

const CARD_W = 0.7;
const CARD_H = CARD_W * (88 / 63);
const RING_RADIUS = 3.4;
const CARD_COUNT = CARD_IMAGES.length;

/** Strong size scatter so the ring feels composed, not uniform. */
const SIZE_STEPS = [1.38, 0.78, 1.18, 0.92, 1.32, 0.7, 1.08, 0.86, 1.25, 0.74];

const RING_POSITIONS = Array.from({ length: CARD_COUNT }, (_, i) => {
  const theta = (i / CARD_COUNT) * Math.PI * 2;
  const radius = RING_RADIUS + (i % 4) * 0.28 + (i % 2) * 0.08;
  return {
    x: Math.cos(theta) * radius,
    z: Math.sin(theta) * radius,
    y: Math.sin(i * 1.9) * 0.55,
    rotY: Math.PI / 2 - theta + (i % 2 === 0 ? 0.16 : -0.16),
    phase: i * 1.3,
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
    mesh.current.position.y = position[1] + Math.sin(t * 0.7 + phase) * 0.1;
    mesh.current.rotation.z = Math.sin(t * 0.5 + phase) * 0.05;
  });

  return (
    <mesh ref={mesh} position={position} rotation={[0, rotY, 0]} scale={scale}>
      <planeGeometry args={[CARD_W, CARD_H]} />
      <meshStandardMaterial map={texture} roughness={0.38} metalness={0.12} />
    </mesh>
  );
}

function FoilParticles() {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const count = 110;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2.2 + Math.random() * 3.6;
      arr[i * 3] = Math.cos(angle) * radius;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 5;
      arr[i * 3 + 2] = Math.sin(angle) * radius;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return geo;
  }, []);

  useFrame((state) => {
    if (!points.current) return;
    const t = state.clock.elapsedTime;
    points.current.rotation.y = t * 0.03;
    const pos = points.current.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 1; i < pos.count; i += 3) {
      pos.setY(i, ((pos.getY(i) + 0.0025) % 5) - 2.5);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.026}
        color="#6ee7b7"
        transparent
        opacity={0.48}
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
    if (outer.current) outer.current.rotation.z = -t * 0.04;
    if (inner.current) inner.current.rotation.z = t * 0.06;
  });

  return (
    <group position={[0, -1.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={outer}>
        <ringGeometry args={[3.4, 4.2, 80]} />
        <meshBasicMaterial color="#5bc4d4" transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={inner}>
        <ringGeometry args={[2.1, 2.9, 80]} />
        <meshBasicMaterial color="#6ee7b7" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function CameraRig({ progressRef }: { progressRef: MutableRefObject<number> }) {
  useFrame((state) => {
    const loop = wrap01(progressRef.current);
    const cam = state.camera;
    cam.position.set(
      Math.sin(loop * Math.PI * 2) * 0.45,
      0.35 + Math.cos(loop * Math.PI * 2) * 0.18,
      8.6 - loop * 0.35
    );
    cam.lookAt(0, 0.05, 0);
  });

  return null;
}

function WorldRig({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const textures = useTexture(CARD_IMAGES);

  useFrame((state) => {
    if (!group.current) return;
    const s = progressRef.current;
    group.current.rotation.y = s * Math.PI * 2 + state.clock.elapsedTime * 0.04;
  });

  return (
    <group ref={group}>
      {RING_POSITIONS.map((card, i) => (
        <group key={i} position={[card.x, card.y, card.z]} rotation={[0, card.rotY, 0]}>
          <CardPlane
            texture={textures[i]}
            position={[0, 0, 0]}
            rotY={0}
            phase={card.phase}
            scale={card.scale}
          />
        </group>
      ))}
      <FoilParticles />
      <FloorRings />
    </group>
  );
}

export function ScrollWorld({
  className,
  progressRef,
}: {
  className?: string;
  progressRef: MutableRefObject<number>;
}) {
  return (
    <Canvas
      className={className}
      dpr={[1, 1.25]}
      camera={{ position: [0, 0.35, 8.6], fov: 38 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    >
      <ambientLight intensity={0.65} />
      <directionalLight position={[3, 4, 2]} intensity={1.1} color="#e8ecf2" />
      <pointLight position={[-4, 2, -2]} intensity={40} color="#6ee7b7" />
      <pointLight position={[4, -1, 1]} intensity={28} color="#5bc4d4" />
      <fog attach="fog" args={['#0c1118', 6.5, 15]} />
      <Suspense fallback={null}>
        <WorldRig progressRef={progressRef} />
      </Suspense>
      <CameraRig progressRef={progressRef} />
    </Canvas>
  );
}
