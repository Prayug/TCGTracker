import { useMemo } from 'react';

interface ParticleFieldProps {
  count?: number;
  className?: string;
}

export const ParticleField: React.FC<ParticleFieldProps> = ({
  count = 16,
  className = '',
}) => {
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      size: 6 + (i % 5) * 3,
      left: ((i * 6.3 + 17) % 100),
      delay: i * 1.6,
      duration: 20 + (i % 6) * 3,
      opacity: 0.25 + (i % 5) * 0.08,
      blur: i % 3 === 0 ? 'blur-sm' : '',
    }));
  }, [count]);

  return (
    <div
      className={`pointer-events-none fixed inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {particles.map((p) => (
        <div
          key={p.id}
          className={`absolute animate-particle-drift rounded-full ${p.blur}`}
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            bottom: '-20px',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            opacity: p.opacity,
            background: 'var(--accent)',
            boxShadow: `0 0 ${p.size * 3}px color-mix(in srgb, var(--accent) 60%, transparent), 0 0 ${p.size * 6}px color-mix(in srgb, var(--accent) 30%, transparent)`,
          }}
        />
      ))}
    </div>
  );
};
