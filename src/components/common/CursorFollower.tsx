import { useCallback, useEffect, useRef } from 'react';

export const CursorFollower: React.FC = () => {
  const cursorRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const mouseRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);

  const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  useEffect(() => {
    if (isTouchDevice) return;

    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onLeave = () => {
      if (cursorRef.current) cursorRef.current.style.opacity = '0';
    };

    const onEnter = () => {
      if (cursorRef.current) cursorRef.current.style.opacity = '1';
    };

    const tick = () => {
      const dx = mouseRef.current.x - posRef.current.x;
      const dy = mouseRef.current.y - posRef.current.y;
      posRef.current.x += dx * 0.15;
      posRef.current.y += dy * 0.15;

      if (cursorRef.current) {
        cursorRef.current.style.transform =
          `translate3d(${posRef.current.x - 16}px, ${posRef.current.y - 16}px, 0)`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMouse, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMouse);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      cancelAnimationFrame(rafRef.current);
    };
  }, [isTouchDevice]);

  if (isTouchDevice) return null;

  return (
    <div
      ref={cursorRef}
      className="pointer-events-none fixed left-0 top-0 z-[9998] h-8 w-8 opacity-0 mix-blend-difference transition-opacity duration-300"
      aria-hidden="true"
    >
      <div className="h-full w-full border-2 border-white" />
    </div>
  );
};
