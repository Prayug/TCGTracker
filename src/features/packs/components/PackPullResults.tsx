import React from 'react';
import { PackPull, PokemonCard } from '../../../types/pokemon';
import { PackPullCardDisplay, PackPullKindBadge } from './PackPullCardDisplay';

interface PackPullResultsProps {
  packPull: PackPull;
  rarityClassName: string;
  rawPriceFallback?: (card: PokemonCard) => number;
}

function StatChip({
  label,
  value,
  valueClass = 'text-ink-primary',
  tinted = false,
  tintPositive = false,
}: {
  label: string;
  value: string;
  valueClass?: string;
  tinted?: boolean;
  tintPositive?: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-3.5 py-2 text-center sm:px-4 sm:py-2.5 ${
        tinted ? (tintPositive ? 'bg-emerald-500/10' : 'bg-red-500/10') : 'bg-surface-inset/80'
      }`}
    >
      <p className="text-[9px] font-medium uppercase tracking-wider text-ink-muted sm:text-[10px]">
        {label}
      </p>
      <p
        className={`mt-0.5 text-base font-bold tabular-nums leading-none sm:text-lg ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}

export const PackPullResults: React.FC<PackPullResultsProps> = ({ packPull, rarityClassName }) => {
  const card = packPull.cards[0];
  if (!card) return null;

  const isSlab = packPull.pullKind === 'slab';
  const gradedPrice = packPull.totalValue;
  const rawPrice = packPull.rawPrice ?? card.marketPrice ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Stats row — full modal width, evenly spaced */}
      <div className="grid shrink-0 grid-cols-3 gap-2.5 sm:gap-4">
        <StatChip label="Total" value={`$${gradedPrice.toFixed(2)}`} />
        <StatChip label="Cost" value={`$${packPull.pack.price.toFixed(2)}`} />
        <StatChip
          label="P/L"
          value={`${packPull.profit >= 0 ? '+' : ''}$${packPull.profit.toFixed(2)}`}
          valueClass={packPull.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}
          tinted
          tintPositive={packPull.profit >= 0}
        />
      </div>

      {/* Middle content — sized between stats and modal footer */}
      <div className="min-h-0 flex-1">
        <div className="grid h-full min-h-0 grid-cols-1 items-center gap-6 sm:grid-cols-2 sm:gap-8">
          {/* Slab / card */}
          <div className="flex h-full min-h-0 items-center justify-center py-4">
            {isSlab ? (
              <div className="h-full max-h-full w-auto aspect-[0.68]">
                <PackPullCardDisplay
                  card={card}
                  isSlab={isSlab}
                  rarityClassName={rarityClassName}
                  size="detail"
                  hero
                  showSlabEffects
                />
              </div>
            ) : (
              <div className="h-full max-h-full w-auto">
                <PackPullCardDisplay
                  card={card}
                  isSlab={false}
                  rarityClassName={rarityClassName}
                  size="detail"
                  hero
                />
              </div>
            )}
          </div>

          {/* Card info */}
          <div className="flex min-h-0 flex-col justify-center gap-3 sm:gap-3.5">
            {isSlab ? (
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/90 sm:text-sm">
                PSA 10 Pull
              </p>
            ) : (
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-muted sm:text-sm">
                Pack Pull
              </p>
            )}

            <div>
              <h3 className="text-4xl font-black leading-tight text-ink-primary sm:text-5xl">
                {card.name}
              </h3>
              <p className="mt-1.5 text-base text-ink-secondary sm:text-lg">
                {card.set?.name || 'Unknown set'}
                {card.number ? ` · #${card.number}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <PackPullKindBadge isSlab={isSlab} />
              {card.rarity ? (
                <span className="text-base text-ink-muted sm:text-lg">{card.rarity}</span>
              ) : null}
            </div>

            {/* Keep secondary info muted/compact; raw value hidden for slab pulls */}
          </div>
        </div>
      </div>
    </div>
  );
};
