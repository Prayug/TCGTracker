import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '@/lib/utils';
import { useGame, type GameType } from '../../contexts/GameContext';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { setTrackerService } from '../../services/setTrackerService';
import { onePieceApi } from '../../services/onepieceApi';
import { proxyImageUrl } from '../../utils/cardDisplay';

const CARD_W = 0.85;
const CARD_H = CARD_W * (88 / 63);
const RING_RADIUS = 4.6;
const CLUSTER_ARC = 0.5;
const RADIUS_SPREAD = 1.0;
const HEIGHT_SPREAD = 1.0;
const LABEL_Y = 1.7;
const ROT_SPEED = 0.05;

type RingCard = {
  id: string;
  name: string;
  src: string;
};

type RingSet = {
  id: string;
  name: string;
  releaseDate?: string;
  color: string;
  cards: RingCard[];
};

type PlacedCard = RingCard & {
  setKey: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  rotZ: number;
  scale: number;
  phase: number;
};

/** Deterministic pseudo-random in [0, 1) so the layout never reshuffles on re-render. */
function hash01(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function setColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${hue} 85% 62%)`;
}

function parseReleaseDate(date?: string): number {
  if (!date) return 0;
  const t = new Date(date).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function layout(sets: RingSet[]): PlacedCard[] {
  const setCount = sets.length;
  if (setCount === 0) return [];

  const placed: PlacedCard[] = [];

  sets.forEach((set, i) => {
    const centerAngle = ((i + 0.5) / setCount) * Math.PI * 2;
    const count = set.cards.length;
    const span = count > 1 ? CLUSTER_ARC * (count / (count + 3)) : 0;

    set.cards.forEach((card, j) => {
      const rel =
        count > 1
          ? (j / (count - 1) - 0.5) * span
          : (hash01(i, j) - 0.5) * 0.06;
      const angle = centerAngle + rel;
      const radius = RING_RADIUS + (hash01(i, j) - 0.5) * RADIUS_SPREAD;

      placed.push({
        ...card,
        setKey: set.id,
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        y: (hash01(i, j + 17) - 0.5) * HEIGHT_SPREAD,
        rotY: Math.PI / 2 - angle + (hash01(i, j + 7) - 0.5) * 0.22,
        rotZ: (hash01(i, j + 29) - 0.5) * 0.07,
        scale: 0.72 + hash01(i, j + 41) * 0.56,
        phase: hash01(i, j + 53) * Math.PI * 2,
      });
    });
  });

  return placed;
}

function useCardRingData(game: GameType | undefined, setCount: number, cardsPerSet: number) {
  const context = useGame();
  const isPokemon = game ? game === 'pokemon' : context.isPokemon;
  const isOnePiece = game ? game === 'onepiece' : context.isOnePiece;

  const [sets, setSets] = useState<RingSet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);

      try {
        let ringSets: RingSet[] = [];

        if (isPokemon) {
          const all = await setTrackerService.getSets();
          const newest = [...all].sort(
            (a, b) =>
              parseReleaseDate(b.releaseDate) - parseReleaseDate(a.releaseDate)
          );
          const chosen = newest.slice(0, setCount).reverse();

          const results = await Promise.all(
            chosen.map(async (set, i): Promise<RingSet | null> => {
              try {
                const { set: fullSet, cards } = await setTrackerService.getSetCards(set.id);
                const ringCards = cards
                  .filter((c) => c.images?.large || c.images?.small)
                  .sort((a, b) => (b.marketPrice ?? 0) - (a.marketPrice ?? 0))
                  .slice(0, cardsPerSet)
                  .map((c) => ({
                    id: c.id,
                    name: c.name,
                    src: proxyImageUrl(c.images.large || c.images.small)!,
                  }));

                if (ringCards.length === 0) return null;
                return {
                  id: fullSet.id,
                  name: fullSet.name,
                  releaseDate: fullSet.releaseDate,
                  color: setColor(i),
                  cards: ringCards,
                } satisfies RingSet;
              } catch (err) {
                console.error(`Failed to load cards for set ${set.id}:`, err);
                return null;
              }
            })
          );

          ringSets = results.filter((r): r is RingSet => r !== null);
        } else if (isOnePiece) {
          const all = await onePieceApi.getSets();
          const chosen = all.slice(0, setCount);

          const results = await Promise.all(
            chosen.map(async (set, i): Promise<RingSet | null> => {
              try {
                const cards = await onePieceApi.getSetCards(set.id);
                const seen = new Map<string, RingCard>();
                cards
                  .filter((c) => c.images?.large || c.images?.small)
                  .sort((a, b) => (b.marketPrice ?? 0) - (a.marketPrice ?? 0))
                  .slice(0, cardsPerSet)
                  .forEach((c) => {
                    const src = proxyImageUrl(c.images.large || c.images.small);
                    if (src) {
                      seen.set(c.id, { id: c.id, name: c.name, src });
                    }
                  });

                if (seen.size === 0) return null;
                return {
                  id: set.id,
                  name: set.name,
                  color: setColor(i),
                  cards: [...seen.values()],
                } satisfies RingSet;
              } catch (err) {
                console.error(`Failed to load cards for set ${set.id}:`, err);
                return null;
              }
            })
          );

          ringSets = results.filter((r): r is RingSet => r !== null);
        }

        if (!cancelled) setSets(ringSets);
      } catch (err) {
        console.error('Failed to load ring data:', err);
        if (!cancelled) setSets([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isPokemon, isOnePiece, setCount, cardsPerSet]);

  return { sets, isLoading };
}

function CardPlane({ card }: { card: PlacedCard }) {
  const mesh = useRef<THREE.Mesh>(null);
  const texture = useTexture(card.src);

  useFrame((state) => {
    if (!mesh.current) return;
    mesh.current.position.y = Math.sin(state.clock.elapsedTime * 0.6 + card.phase) * 0.06;
  });

  return (
    <mesh ref={mesh}>
      <planeGeometry args={[CARD_W, CARD_H]} />
      <meshStandardMaterial map={texture} roughness={0.35} metalness={0.15} />
    </mesh>
  );
}

function SetMarker({
  set,
  angle,
  groupRef,
}: {
  set: RingSet;
  angle: number;
  groupRef: RefObject<THREE.Group>;
}) {
  const label = useRef<HTMLDivElement>(null);

  useFrame(() => {
    const el = label.current;
    if (!el) return;
    const worldAngle = angle + (groupRef.current?.rotation.y ?? 0);
    const facing = Math.sin(worldAngle);
    const t = THREE.MathUtils.smoothstep(facing, 0.35, 0.9);
    el.style.visibility = t > 0.01 ? 'visible' : 'hidden';
    el.style.opacity = String(0.15 + 0.85 * t);
    el.style.transform = `translate(-50%, -50%) scale(${(0.8 + 0.25 * t).toFixed(3)})`;
  });

  const x = Math.cos(angle) * RING_RADIUS;
  const z = Math.sin(angle) * RING_RADIUS;

  return (
    <>
      <group position={[x, 0, z]}>
        <mesh>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshBasicMaterial color={set.color} toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.34, 16, 16]} />
          <meshBasicMaterial
            color={set.color}
            transparent
            opacity={0.12}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
      <Html position={[x, LABEL_Y, z]} style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div
          ref={label}
          style={{
            visibility: 'hidden',
            opacity: 0,
            whiteSpace: 'nowrap',
            borderRadius: 999,
            padding: '3px 10px',
            fontSize: 12,
            lineHeight: 1.4,
            letterSpacing: '0.02em',
            color: '#e2e8f0',
            background: 'rgba(10, 14, 20, 0.72)',
            border: `1px solid ${set.color}`,
            boxShadow: `0 4px 16px rgba(0, 0, 0, 0.45)`,
            backdropFilter: 'blur(4px)',
            fontFamily: 'inherit',
            transform: 'translate(-50%, -50%)',
          }}
        >
          {set.name}
        </div>
      </Html>
    </>
  );
}

function RingDust() {
  const points = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const count = 160;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 3.6 + Math.random() * 2.4;
      arr[i * 3] = Math.cos(angle) * radius;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 2.4;
      arr[i * 3 + 2] = Math.sin(angle) * radius;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return geo;
  }, []);

  useFrame((state) => {
    if (!points.current) return;
    points.current.rotation.y = -state.clock.elapsedTime * 0.03;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.05}
        color="#8b5cf6"
        transparent
        opacity={0.35}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function RingRig({
  sets,
  autoRotate,
  reduced,
}: {
  sets: RingSet[];
  autoRotate: boolean;
  reduced: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const placed = useMemo(() => layout(sets), [sets]);

  useFrame((state) => {
    if (!group.current || !autoRotate || reduced) return;
    group.current.rotation.y = state.clock.elapsedTime * ROT_SPEED;
  });

  return (
    <group ref={group}>
      {placed.map((card) => (
        <group
          key={`${card.setKey}-${card.id}`}
          position={[card.x, card.y, card.z]}
          rotation={[0, card.rotY, card.rotZ]}
          scale={card.scale}
        >
          <Suspense fallback={null}>
            <CardPlane card={card} />
          </Suspense>
        </group>
      ))}
      {sets.map((set, i) => (
        <SetMarker
          key={set.id}
          set={set}
          angle={((i + 0.5) / sets.length) * Math.PI * 2}
          groupRef={group}
        />
      ))}
      <RingDust />
    </group>
  );
}

export interface CardSetRingProps {
  className?: string;
  /** Override the active game from GameContext. */
  game?: GameType;
  /** Number of most recently released sets to show around the ring. */
  setCount?: number;
  /** Max cards shown per set cluster (top-value cards first). */
  cardsPerSet?: number;
  autoRotate?: boolean;
}

/**
 * Rotating ring of trading cards. Cards from the same set cluster together,
 * and clusters are ordered by set release date around the ring (oldest first).
 */
export function CardSetRing({
  className,
  game,
  setCount = 10,
  cardsPerSet = 8,
  autoRotate = true,
}: CardSetRingProps) {
  const safeSetCount = Math.max(1, Math.round(setCount));
  const safeCardsPerSet = Math.max(1, Math.round(cardsPerSet));
  const { sets, isLoading } = useCardRingData(game, safeSetCount, safeCardsPerSet);
  const reduced = usePrefersReducedMotion();

  return (
    <div className={cn('relative h-full w-full', className)}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 4.2, 9], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      >
        <OrbitControls maxDistance={20} minDistance={6} enablePan={false} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 2]} intensity={1.1} color="#e8ecf2" />
        <pointLight position={[-30, 0, -30]} power={10.0} />
        <pointLight position={[30, 0, 30]} power={10.0} />
        <Suspense fallback={null}>
          {!isLoading && <RingRig sets={sets} autoRotate={autoRotate} reduced={reduced} />}
        </Suspense>
      </Canvas>

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <div className="h-1.5 w-1.5 animate-ping rounded-full bg-indigo-400" />
            Loading sets…
          </div>
        </div>
      )}
    </div>
  );
}
