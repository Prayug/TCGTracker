import React, { useCallback, useRef } from 'react';

interface FoilCardProps {
  children: React.ReactNode;
  className?: string;
  as?: 'button' | 'div';
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const FoilCard: React.FC<FoilCardProps> = ({
  children,
  className = '',
  as: Tag = 'div',
  onClick,
  style,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const rect = cardRef.current!.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const tiltX = (y - 0.5) * -16;
      const tiltY = (x - 0.5) * 16;
      cardRef.current!.style.transform =
        `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.03,1.03,1.03)`;
      cardRef.current!.style.boxShadow =
        `0 0 20px var(--ring-accent), ${(x - 0.5) * 20}px ${(y - 0.5) * 20}px 30px rgba(0,0,0,0.3)`;
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!cardRef.current) return;
    cancelAnimationFrame(rafRef.current);
    cardRef.current.style.transform =
      'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
    cardRef.current.style.boxShadow = '';
  }, []);

  const Comp = Tag as React.ElementType;

  return (
    <Comp
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative cursor-pointer overflow-hidden border transition-shadow duration-300 ${className}`}
      style={{
        borderColor: 'var(--border-default)',
        background: 'var(--gradient-surface)',
        transition: 'transform 0.12s ease-out, box-shadow 0.12s ease-out',
        transformStyle: 'preserve-3d',
        ...style,
      }}
    >
      {children}
      <div className="holo-sweep" />
      <div className="holo-texture" />
    </Comp>
  );
};
