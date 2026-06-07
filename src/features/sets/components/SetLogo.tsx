import React, { useState } from 'react';
import { Layers } from 'lucide-react';

interface SetLogoProps {
  set: { name: string; images?: { logo?: string; symbol?: string } };
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-10 w-10 p-1',
  md: 'h-14 w-14 p-1.5',
  lg: 'h-20 w-20 p-2',
};

export const SetLogo: React.FC<SetLogoProps> = ({ set, size = 'md', className = '' }) => {
  const [failedLogo, setFailedLogo] = useState(false);
  const [failedSymbol, setFailedSymbol] = useState(false);

  const logo = set.images?.logo;
  const symbol = set.images?.symbol;
  const src = !failedLogo && logo ? logo : !failedSymbol && symbol ? symbol : null;

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-surface-hover ${sizeClasses[size]} ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={`${set.name} logo`}
          className="h-full w-full object-contain"
          loading="lazy"
          onError={() => {
            if (!failedLogo && logo) setFailedLogo(true);
            else setFailedSymbol(true);
          }}
        />
      ) : (
        <Layers className="h-5 w-5 text-ink-muted" aria-hidden="true" />
      )}
    </div>
  );
};
