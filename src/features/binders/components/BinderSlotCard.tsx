import React from 'react';

interface BinderSlotCardProps {
  imageUrl?: string | null;
  cardName?: string;
  rarity?: string;
  price?: number | null;
  empty?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export const BinderSlotCard: React.FC<BinderSlotCardProps> = ({
  imageUrl,
  cardName,
  rarity,
  price,
  empty,
  onClick,
  size = 'md',
}) => {
  const sizeClasses = size === 'sm' ? 'w-24 h-32' : size === 'lg' ? 'w-40 h-56' : 'w-32 h-44';

  if (empty) {
    return (
      <div
        onClick={onClick}
        className={`${sizeClasses} flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border-subtle bg-surface-inset transition-colors hover:border-accent/50 hover:bg-surface-hover`}
      >
        <span className="text-3xl text-ink-muted">+</span>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`group ${sizeClasses} relative cursor-pointer overflow-hidden rounded-lg border border-border-default bg-surface-raised transition-all duration-200 hover:border-accent/50 hover:shadow-lg`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={cardName || ''}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-inset">
          <span className="text-xs text-ink-muted">No image</span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2">
        <p className="truncate text-xs font-semibold text-white drop-shadow-md">
          {cardName}
        </p>
        <div className="mt-0.5 flex items-center justify-between">
          {rarity && (
            <span className="text-[10px] font-medium text-gray-300 drop-shadow-md">
              {rarity}
            </span>
          )}
          {price != null && (
            <span className="text-[10px] font-bold text-accent drop-shadow-md">
              ${(price / 100).toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
