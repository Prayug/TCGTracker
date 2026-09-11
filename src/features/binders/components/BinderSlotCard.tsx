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
  const sizeClasses =
    size === 'sm' ? 'w-24 h-32' : size === 'lg' ? 'w-40 h-56' : 'w-full aspect-[5/7]';

  if (empty) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${sizeClasses} sleeve-slot-empty flex cursor-pointer items-center justify-center transition-colors hover:border-sticker/40`}
        aria-label="Add card to empty slot"
      >
        <span className="text-2xl text-ink-muted">+</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group ${sizeClasses} sleeve-window relative cursor-pointer transition-shadow duration-200 hover:shadow-md`}
      aria-label={cardName ? `Open ${cardName}` : 'Open binder slot'}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={cardName || ''}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-sleeve">
          <span className="text-xs text-ink-muted">No image</span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-2 text-left">
        <p className="truncate text-xs font-semibold text-white">{cardName}</p>
        <div className="mt-0.5 flex items-center justify-between">
          {rarity && <span className="text-[10px] font-medium text-white/80">{rarity}</span>}
          {price != null && (
            <span className="font-mono text-[10px] font-semibold text-white">
              ${(price / 100).toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};
