import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import { proxyImageUrl } from '../../utils/cardDisplay';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';

type ScatterCard = {
  id: string;
  src: string;
  /** Base placement + static rotation */
  left?: string;
  right?: string;
  top: string;
  width: string;
  rotateY: number;
  rotateZ: number;
  translateZ: number;
};

const SCATTER: ScatterCard[] = [
  {
    id: 'charizard',
    src: proxyImageUrl('https://images.pokemontcg.io/base1/4_hires.png')!,
    left: '2%',
    top: '8%',
    width: 'min(28vw, 13.5rem)',
    rotateY: 28,
    rotateZ: -12,
    translateZ: 40,
  },
  {
    id: 'mewtwo',
    src: proxyImageUrl('https://images.pokemontcg.io/base1/10_hires.png')!,
    left: '38%',
    top: '0%',
    width: 'min(24vw, 12rem)',
    rotateY: -8,
    rotateZ: 4,
    translateZ: 10,
  },
  {
    id: 'pikachu',
    src: proxyImageUrl('https://images.pokemontcg.io/base1/58_hires.png')!,
    right: '2%',
    top: '6%',
    width: 'min(26vw, 12.5rem)',
    rotateY: -30,
    rotateZ: 10,
    translateZ: 36,
  },
  {
    id: 'umbreon',
    src: proxyImageUrl('https://images.pokemontcg.io/swsh7/215_hires.png')!,
    left: '6%',
    top: '52%',
    width: 'min(27vw, 13rem)',
    rotateY: 22,
    rotateZ: 8,
    translateZ: 28,
  },
  {
    id: 'gengar',
    src: proxyImageUrl('https://images.pokemontcg.io/xy12/34_hires.png')!,
    left: '42%',
    top: '58%',
    width: 'min(25vw, 12rem)',
    rotateY: -6,
    rotateZ: -6,
    translateZ: 18,
  },
  {
    id: 'rayquaza',
    src: proxyImageUrl('https://images.pokemontcg.io/swsh7/218_hires.png')!,
    right: '5%',
    top: '50%',
    width: 'min(27vw, 13rem)',
    rotateY: -24,
    rotateZ: -9,
    translateZ: 32,
  },
];

/**
 * Large 3D Pokemon cards orbiting a clean brand wordmark.
 */
export function HeroCardStage({ className }: { className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const tilt = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const raf = useRef(0);

  useEffect(() => {
    if (reducedMotion) return;
    const stage = stageRef.current;
    if (!stage) return;

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      target.current.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      target.current.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };

    const tick = () => {
      tilt.current.x += (target.current.x - tilt.current.x) * 0.08;
      tilt.current.y += (target.current.y - tilt.current.y) * 0.08;
      stage.style.setProperty('--tx', tilt.current.x.toFixed(3));
      stage.style.setProperty('--ty', tilt.current.y.toFixed(3));
      raf.current = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    raf.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf.current);
    };
  }, [reducedMotion]);

  return (
    <div
      ref={stageRef}
      className={cn(
        'relative mx-auto flex h-[min(78vw,520px)] w-full max-w-6xl items-center justify-center sm:h-[560px]',
        className
      )}
      style={
        {
          '--tx': 0,
          '--ty': 0,
          perspective: '1400px',
          perspectiveOrigin: '50% 45%',
        } as CSSProperties
      }
      aria-hidden
    >
      <div className="absolute inset-[6%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(20,27,38,0.9)_0%,transparent_70%)]" />

      <div
        className="absolute inset-0"
        style={{
          transformStyle: 'preserve-3d',
          transform: 'rotateY(calc(var(--tx) * 6deg)) rotateX(calc(var(--ty) * -4deg))',
        }}
      >
        {SCATTER.map((card) => (
          <Card3D key={card.id} card={card} />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-0 z-[5] bg-[radial-gradient(ellipse_at_center,rgba(12,17,24,0.05)_0%,rgba(12,17,24,0.55)_68%)]" />

      <div className="relative z-[6] px-4 text-center">
        <p className="font-display text-[clamp(2.75rem,11vw,5.5rem)] font-bold tracking-tight text-ink-primary drop-shadow-[0_8px_32px_rgba(0,0,0,0.65)]">
          TCG<span className="text-accent">Tracker</span>
        </p>
        <div className="mx-auto mt-3 h-px w-24 bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      </div>

      <div className="pointer-events-none absolute bottom-[4%] left-1/2 h-16 w-[60%] -translate-x-1/2 rounded-[100%] bg-black/50 blur-3xl" />
    </div>
  );
}

function Card3D({ card }: { card: ScatterCard }) {
  const pos: CSSProperties = {
    top: card.top,
    width: card.width,
    ...(card.left !== undefined ? { left: card.left } : {}),
    ...(card.right !== undefined ? { right: card.right } : {}),
  };

  return (
    <div
      className="absolute z-[2]"
      style={{
        ...pos,
        transformStyle: 'preserve-3d',
        transform: `rotateY(${card.rotateY}deg) rotateZ(${card.rotateZ}deg) translateZ(${card.translateZ}px)`,
        willChange: 'transform',
      }}
    >
      {/* Card thickness (edge) */}
      <div
        className="absolute inset-y-[2%] left-0 w-[10px] rounded-l-md bg-gradient-to-b from-zinc-300 via-zinc-500 to-zinc-700"
        style={{
          transform: 'translateX(-5px) rotateY(-90deg)',
          transformOrigin: 'right center',
          backfaceVisibility: 'hidden',
        }}
      />

      {/* Face */}
      <div
        className="relative overflow-hidden rounded-xl bg-zinc-950"
        style={{
          transform: 'translateZ(5px)',
          boxShadow:
            '0 24px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12), inset 0 0 0 1px rgba(0,0,0,0.25)',
          backfaceVisibility: 'hidden',
        }}
      >
        <img
          src={card.src}
          alt=""
          className="aspect-[63/88] w-full select-none object-cover"
          draggable={false}
          loading="eager"
          decoding="async"
        />
        {/* Specular sheen */}
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'linear-gradient(125deg, transparent 35%, rgba(255,255,255,0.35) 48%, transparent 60%)',
          }}
        />
      </div>
    </div>
  );
}
