import React from 'react';
import { PokemonCard } from '../../../types/pokemon';

interface PackPullCardDisplayProps {
  card: PokemonCard;
  isSlab: boolean;
  rarityClassName?: string;
  imageClassName?: string;
  size?: 'reveal' | 'results' | 'detail';
  hero?: boolean;
  showSlabEffects?: boolean;
}

const SPARKLE_POSITIONS = [
  { top: '12%', left: '8%', delay: '0s' },
  { top: '22%', left: '92%', delay: '0.4s' },
  { top: '68%', left: '6%', delay: '0.8s' },
  { top: '78%', left: '88%', delay: '1.2s' },
  { top: '45%', left: '4%', delay: '0.6s' },
  { top: '38%', left: '94%', delay: '1s' },
];

/** Realistic graded slab — clear acrylic with proper label/card separation */
function RealisticPsaSlab({
  card,
  image,
  sizeClass,
  hero,
  showEffects,
}: {
  card: PokemonCard;
  image?: string;
  sizeClass: string;
  hero: boolean;
  showEffects: boolean;
}) {
  const setName = (card.set?.name || 'Pokémon TCG').toUpperCase();
  const cardTitle = card.name.toUpperCase();
  const cardNum = card.number ? `#${card.number}` : '';

  return (
    <div className={`relative ${hero ? 'h-full w-full' : 'mx-auto w-fit'}`}>
      {showEffects && (
        <>
          <div
            className="pointer-events-none absolute left-1/2 bottom-2 z-0 h-6 w-[78%] -translate-x-1/2 rounded-full bg-black/45 blur-xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 z-0 rounded-2xl bg-[radial-gradient(circle_at_50%_40%,rgba(251,191,36,0.22),transparent_62%)]"
            aria-hidden
          />
          {SPARKLE_POSITIONS.map((pos, i) => (
            <span
              key={i}
              className="pointer-events-none absolute z-0 h-1 w-1 rounded-full bg-amber-200/70 motion-safe:animate-pulse"
              style={{ top: pos.top, left: pos.left, animationDelay: pos.delay }}
              aria-hidden
            />
          ))}
        </>
      )}

      <div
        className={`relative z-10 mx-auto flex min-h-0 flex-col ${hero ? 'h-full w-full' : sizeClass}`}
      >
        {/* Clear acrylic shell — rigid edges, realistic plastic */}
        <div
          className="relative flex min-h-0 h-full w-full flex-col overflow-hidden rounded-[3px] border border-white/25"
          style={{
            background:
              'linear-gradient(155deg, rgba(255,255,255,0.42) 0%, rgba(248,250,252,0.1) 30%, rgba(190,200,214,0.14) 60%, rgba(255,255,255,0.3) 100%)',
            backdropFilter: 'blur(1px)',
            boxShadow:
              '0 24px 48px rgba(0,0,0,0.55), 0 5px 14px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.75), inset 1px 0 0 rgba(255,255,255,0.22), inset -1px -1px 2px rgba(0,0,0,0.16)',
          }}
        >
          {/* Acrylic glass layers — surface light, glare, and edge thickness */}
          <div className="pointer-events-none absolute inset-0 z-[8]" aria-hidden>
            {/* Top edge light */}
            <div className="absolute inset-x-[4%] top-[1.5%] h-[2px] rounded-full bg-white/70" />
            {/* Diagonal glare */}
            <div className="absolute -top-[12%] left-[6%] h-[24%] w-[40%] rotate-[24deg] bg-gradient-to-r from-white/0 via-white/30 to-white/0" />
            {/* Left / right refraction streaks */}
            <div className="absolute bottom-[14%] left-[1.5%] top-[14%] w-[2px] bg-gradient-to-b from-white/0 via-white/40 to-white/0" />
            <div className="absolute bottom-[30%] right-[1.5%] top-[30%] w-px bg-gradient-to-b from-white/0 via-white/25 to-white/0" />
            {/* Bottom reflection */}
            <div className="absolute inset-x-[6%] bottom-[1%] h-[2px] rounded-full bg-white/25" />
            {/* Corner glints */}
            <div className="absolute left-[5px] top-[4px] h-[9%] w-[6%] rounded-tl-[4px] bg-gradient-to-br from-white/60 to-transparent" />
            <div className="absolute bottom-[4px] right-[5px] h-[7%] w-[5%] rounded-br-[4px] bg-gradient-to-tl from-white/40 to-transparent" />
            {/* Inner rim */}
            <div className="absolute inset-0 rounded-[3px] ring-1 ring-inset ring-white/25" />
          </div>

          {/* Grading label — sealed section at the top of the case */}
          <div className="relative z-[5] mx-[2.5%] mt-[2.5%] flex h-[11%] shrink-0 flex-col overflow-hidden rounded-[2px] border border-slate-300/90 bg-white shadow-[0_2px_6px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.95)]">
            <div className="flex h-full items-center justify-between gap-2 px-[4%]">
              <div className="min-w-0 leading-none">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[9px] font-black italic tracking-tight text-[#c41e3a] sm:text-[11px]">
                    PSA
                  </span>
                  <span className="text-[5px] font-bold tracking-[0.18em] text-slate-500 sm:text-[7px]">
                    CERTIFIED
                  </span>
                </div>
                <p className="mt-[3px] truncate text-[7px] font-semibold tracking-wide text-slate-700 sm:text-[8px]">
                  {setName}
                </p>
                <p className="mt-[2px] truncate text-[8px] font-black text-slate-900 sm:text-[10px]">
                  {cardTitle}
                </p>
              </div>
              <div className="shrink-0 text-right leading-none">
                <p className="text-[7px] font-bold tracking-[0.08em] text-slate-600 sm:text-[8px]">
                  GEM MT
                </p>
                <p className="mt-px text-lg font-black leading-none text-slate-900 sm:text-2xl">
                  10
                </p>
                {cardNum && (
                  <p className="mt-[2px] text-[6px] font-semibold text-slate-500 sm:text-[7px]">
                    {cardNum}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Card area — takes the rest of the slab below the fixed label */}
          <div className="relative z-[5] mx-[2.5%] mb-[2.5%] min-h-0 flex-1 p-[2.5%] pt-[1.5%]">
            {image ? (
              <img
                src={image}
                alt={card.name}
                className="h-full w-full object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.45)]"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center rounded-sm bg-slate-900 p-3 text-white">
                <p className="text-center text-sm font-bold">{card.name}</p>
              </div>
            )}
            {/* Glass sheen over the card */}
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent"
              aria-hidden
            />
            {/* Soft vignette so the card sits inside the case */}
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/15"
              aria-hidden
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const PackPullCardDisplay: React.FC<PackPullCardDisplayProps> = ({
  card,
  isSlab,
  rarityClassName = 'from-gray-400 to-gray-500',
  imageClassName = '',
  size = 'results',
  hero = false,
  showSlabEffects = false,
}) => {
  const image = card.images?.large || card.images?.small;
  if (isSlab) {
    const sizeClass =
      hero
        ? 'h-full w-full'
        : size === 'reveal'
          ? 'h-[min(62vh,32rem)] w-auto max-w-[min(75vw,22rem)]'
          : size === 'detail'
            ? 'h-[min(60dvh,32rem)] w-auto max-w-[min(72vw,22rem)]'
            : 'h-[min(45vh,22rem)] w-auto max-w-[min(72vw,18rem)]';
    return (
      <RealisticPsaSlab
        card={card}
        image={image}
        sizeClass={sizeClass}
        hero={hero}
        showEffects={showSlabEffects}
      />
    );
  }

  const rawShell = hero
    ? 'h-full max-h-full w-auto max-w-full'
    : size === 'reveal'
      ? 'max-h-[min(60vh,500px)] w-auto max-w-[min(75vw,22rem)]'
      : 'max-h-[min(46vh,380px)] w-auto max-w-[min(72vw,20rem)]';

  return (
    <div className={`relative ${hero ? 'flex h-full w-full items-center justify-center' : ''}`}>
      <div
        className={`overflow-hidden rounded-2xl border-4 bg-gradient-to-br p-1 shadow-2xl ${rarityClassName} ${rawShell}`}
      >
        {image ? (
          <img
            src={image}
            alt={card.name}
            className={`mx-auto block rounded-xl object-contain ${hero ? 'h-full max-h-full w-auto' : imageClassName}`}
          />
        ) : (
          <div
            className={`flex flex-col items-center justify-center rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 p-6 text-white ${imageClassName}`}
          >
            <p className="text-lg font-bold">{card.name}</p>
            <p className="mt-1 text-sm text-gray-400">{card.set?.name}</p>
          </div>
        )}
      </div>
      <span className="absolute -right-2 -top-2 rounded-full border border-border-strong bg-surface-overlay px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ink-secondary shadow-md">
        Raw
      </span>
    </div>
  );
};

interface PackPullKindBadgeProps {
  isSlab: boolean;
  className?: string;
}

export const PackPullKindBadge: React.FC<PackPullKindBadgeProps> = ({ isSlab, className = '' }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
      isSlab
        ? 'border border-amber-400/45 bg-amber-500/12 text-amber-300'
        : 'border border-border-subtle bg-surface-hover text-ink-secondary'
    } ${className}`}
  >
    {isSlab ? 'PSA 10' : 'Raw card'}
  </span>
);
