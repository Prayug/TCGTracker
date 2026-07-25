import { useEffect, useRef } from 'react';

interface AuroraBackgroundProps {
  colors?: string[];
  className?: string;
}

export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({
  colors = ['rgba(0,240,255,0.04)', 'rgba(255,48,112,0.03)', 'rgba(57,255,20,0.02)'],
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * 0.5;
      canvas.height = height * 0.5;
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = (t: number) => {
      timeRef.current = t * 0.0003;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      colors.forEach((color, i) => {
        const offset = i * 2.5;
        const xOff = Math.sin(timeRef.current * 0.3 + offset) * canvas.width * 0.15;
        const yOff = Math.cos(timeRef.current * 0.4 + offset) * canvas.height * 0.1;
        const radius = canvas.width * (0.35 + Math.sin(timeRef.current * 0.2 + i) * 0.1);

        const gradient = ctx.createRadialGradient(
          cx + xOff, cy + yOff, 0,
          cx + xOff, cy + yOff, radius
        );
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [colors]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none fixed inset-0 z-0 ${className}`}
      aria-hidden="true"
    />
  );
};
