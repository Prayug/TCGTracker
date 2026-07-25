import { useEffect, useState } from 'react';

interface GlitchOverlayProps {
  density?: 'low' | 'medium' | 'high';
}

export const GlitchOverlay: React.FC<GlitchOverlayProps> = ({
  density = 'low',
}) => {
  const [glitching, setGlitching] = useState(false);

  const intervalMap = {
    low: 8000,
    medium: 4000,
    high: 2000,
  };

  useEffect(() => {
    let mounted = true;

    const triggerGlitch = () => {
      if (!mounted) return;
      setGlitching(true);
      setTimeout(() => {
        if (mounted) setGlitching(false);
      }, 80);
    };

    const interval = setInterval(triggerGlitch, intervalMap[density]);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [density]);

  return (
    <>
      {glitching && (
        <div
          className="pointer-events-none fixed inset-0 z-[9997] opacity-[0.03]"
          style={{
            background: 'linear-gradient(180deg, var(--neon-gold), var(--neon-pink), var(--neon-green))',
            animation: 'glitch1 0.15s ease-in-out',
          }}
          aria-hidden="true"
        />
      )}
    </>
  );
};
