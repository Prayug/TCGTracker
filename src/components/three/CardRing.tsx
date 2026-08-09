import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { PokemonCard } from '../../types/pokemon';
import { cn } from '@/lib/utils';
import {
  buildRingClusters,
  gradientColor,
  type RingCardPlacement,
  type RingSetCluster,
} from './ringLayout';

const CARD_W = 1.15;
const CARD_H = CARD_W * (88 / 63);

function hash01(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

function CardPlane({ placement }: { placement: RingCardPlacement }) {
  const texture = useTexture(placement.url);
  const mesh = useRef<THREE.Mesh>(null);
  const phase = useRef(hash01(placement.id) * Math.PI * 2);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.position.y =
      placement.position[1] + Math.sin(t * 0.8 + phase.current) * 0.07;
    mesh.current.rotation.z =
      placement.rotation[2] + Math.sin(t * 0.5 + phase.current) * 0.05;
  });

  return (
    <mesh
      ref={mesh}
      position={placement.position}
      rotation={placement.rotation}
      scale={placement.scale}
    >
      <planeGeometry args={[CARD_W, CARD_H]} />
      <meshStandardMaterial
        map={texture}
        roughness={0.42}
        metalness={0.08}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function SetClusterMark({ cluster, showLabel }: { cluster: RingSetCluster; showLabel: boolean }) {
  if (!showLabel) return null;
  return (
    <Text
      position={cluster.labelPosition}
      rotation={[0, cluster.labelAngle, 0]}
      fontSize={0.24}
      maxWidth={1.9}
      textAlign="center"
      anchorX="center"
      anchorY="bottom"
      color={cluster.color}
      fillOpacity={0.95}
    >
      {cluster.name}
    </Text>
  );
}

function RingDust({ radius, tubeRadius }: { radius: number; tubeRadius: number }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    // Dense torus core + ambient field — matches the particle-ring reference.
    const ringCount = 1400;
    const fieldCount = 900;
    const count = ringCount + fieldCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < ringCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 2;
      const tube = tubeRadius * Math.pow(Math.random(), 0.5);
      const r = radius + Math.cos(phi) * tube;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.sin(phi) * tube * 0.9;
      positions[i * 3 + 2] = Math.sin(theta) * r;
      color.set(gradientColor(0.35 + Math.random() * 0.45));
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    for (let i = 0; i < fieldCount; i++) {
      const idx = ringCount + i;
      const extent = radius * 1.9;
      positions[idx * 3] = (Math.random() - 0.5) * 2 * extent;
      positions[idx * 3 + 1] = (Math.random() - 0.5) * extent * 1.2;
      positions[idx * 3 + 2] = (Math.random() - 0.5) * 2 * extent;
      color.set(gradientColor(Math.random()));
      colors[idx * 3] = color.r;
      colors[idx * 3 + 1] = color.g;
      colors[idx * 3 + 2] = color.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [radius, tubeRadius]);

  useFrame((state) => {
    if (!points.current) return;
    points.current.rotation.y = state.clock.elapsedTime * 0.012;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.045}
        vertexColors
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function TrackRing({ radius, tubeRadius }: { radius: number; tubeRadius: number }) {
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <torusGeometry args={[radius, tubeRadius * 0.08, 16, 200]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.08} depthWrite={false} />
      </mesh>
    </group>
  );
}

function RingGroup({
  clusters,
  radius,
  tubeRadius,
  showLabels,
}: {
  clusters: RingSetCluster[];
  radius: number;
  tubeRadius: number;
  showLabels: boolean;
}) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = state.clock.elapsedTime * 0.038;
  });

  return (
    <group ref={group} rotation={[0.22, 0, 0.08]}>
      {clusters.map((cluster) => (
        <group key={cluster.id}>
          {cluster.placements
            .filter((p) => p.url)
            .map((placement) => (
              <CardPlane key={placement.id} placement={placement} />
            ))}
          <SetClusterMark cluster={cluster} showLabel={showLabels} />
        </group>
      ))}
      <RingDust radius={radius} tubeRadius={tubeRadius} />
      <TrackRing radius={radius} tubeRadius={tubeRadius} />
    </group>
  );
}

export interface CardRingProps {
  cards: PokemonCard[];
  className?: string;
  radius?: number;
  tubeRadius?: number;
  /** 0–1; how many cards float in the surrounding volume vs the dense ring. */
  fieldFraction?: number;
  maxSets?: number;
  maxCardsPerSet?: number;
  showLabels?: boolean;
}

/**
 * Particle-field of real card art: a thick torus of set clusters plus cards
 * scattered through the surrounding volume — same silhouette as a particle ring.
 */
export function CardRing({
  cards,
  className,
  radius = 7.2,
  tubeRadius = 2.6,
  fieldFraction = 0.45,
  maxSets = 60,
  maxCardsPerSet = 5,
  showLabels = false,
}: CardRingProps) {
  // Grow major radius with set count so eras don't collapse into one band.
  const setHint = Math.min(maxSets, Math.max(1, new Set(cards.map((c) => c.set?.id).filter(Boolean)).size));
  const effectiveRadius = Math.max(radius, setHint * 0.14);

  const clusters = useMemo(
    () =>
      buildRingClusters(cards, {
        radius: effectiveRadius,
        tubeRadius,
        maxSets,
        maxCardsPerSet,
        fieldFraction,
      }),
    [cards, effectiveRadius, tubeRadius, maxSets, maxCardsPerSet, fieldFraction]
  );

  const labelsVisible = showLabels && clusters.length <= 24;

  return (
    <div className={cn('relative h-[70vh] w-full', className)}>
      <Canvas
        className="absolute inset-0"
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ position: [0, 2.2, 18], fov: 48 }}
      >
        <color attach="background" args={['#070b14']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 8, 6]} intensity={1.05} color="#e8ecf2" />
        <pointLight position={[-6, 2, -6]} intensity={32} color="#a855f7" />
        <pointLight position={[6, -2, 4]} intensity={18} color="#818cf8" />
        <fog attach="fog" args={['#070b14', 14, 40]} />
        <OrbitControls
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.55}
          minDistance={8}
          maxDistance={48}
          maxPolarAngle={Math.PI * 0.88}
          minPolarAngle={0.15}
        />
        <Suspense fallback={null}>
          <RingGroup
            clusters={clusters}
            radius={effectiveRadius}
            tubeRadius={tubeRadius}
            showLabels={labelsVisible}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
