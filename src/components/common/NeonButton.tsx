import React from 'react';

interface NeonButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  color?: 'cyan' | 'pink' | 'green' | 'gold';
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const colorMap = {
  cyan: 'var(--neon-cyan)',
  pink: 'var(--neon-pink)',
  green: 'var(--neon-green)',
  gold: 'var(--neon-gold)',
};

const sizeMap = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-6 py-3 text-sm',
  lg: 'px-10 py-4 text-base',
};

export const NeonButton: React.FC<NeonButtonProps> = ({
  children,
  onClick,
  href,
  color = 'cyan',
  variant = 'primary',
  className = '',
  type = 'button',
  disabled = false,
  size = 'md',
}) => {
  const accentColor = colorMap[color];
  const ringAccent = `${accentColor}33`;

  const baseClasses = `inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wider transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${sizeMap[size]} ${className}`;

  const variantClasses = {
    primary: `border-0 text-black`,
    secondary: `border text-ink-primary bg-transparent`,
    ghost: `border-0 text-ink-secondary bg-transparent hover:text-ink-primary hover:bg-surface-hover`,
  };

  const style: React.CSSProperties =
    variant === 'primary'
      ? {
          background: accentColor,
          boxShadow: `0 0 20px ${ringAccent}`,
          '--hover-shadow': `0 0 30px ${ringAccent}, 0 0 60px ${ringAccent}`,
        }
      : variant === 'secondary'
        ? {
            borderColor: accentColor,
            '--hover-bg': `${accentColor}14`,
            '--hover-shadow': `0 0 20px ${ringAccent}`,
          }
        : undefined;

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (variant === 'primary') {
      e.currentTarget.style.boxShadow = (style as any)?.['--hover-shadow'] || '';
      e.currentTarget.style.filter = 'brightness(1.1)';
    } else if (variant === 'secondary') {
      e.currentTarget.style.background = (style as any)?.['--hover-bg'] || '';
      e.currentTarget.style.boxShadow = (style as any)?.['--hover-shadow'] || '';
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (variant === 'primary') {
      e.currentTarget.style.boxShadow = `0 0 20px ${ringAccent}`;
      e.currentTarget.style.filter = 'none';
    } else if (variant === 'secondary') {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.boxShadow = 'none';
    }
  };

  if (href) {
    return (
      <a
        href={href}
        className={`${baseClasses} ${variantClasses[variant]}`}
        style={style as React.CSSProperties}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]}`}
      style={style as React.CSSProperties}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </button>
  );
};
