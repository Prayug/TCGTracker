import React from 'react';
import { PokemonCard } from '../../../types/pokemon';
import { cn } from '../../../lib/utils';
import { PullTheme } from '../packPresentation';

interface PackPullCardDisplayProps {
  card: PokemonCard;
  isSlab: boolean;
  theme?: PullTheme;
  rarityClassName?: string;
  imageClassName?: string;
  size?: 'reveal' | 'results' | 'detail';
  hero?: boolean;
  showSlabEffects?: boolean;
  blurred?: boolean;
  grader?: string;
  grade?: string;
}

const SPARKLE_POSITIONS = [
  { top: '12%', left: '8%', delay: '0s' },
  { top: '22%', left: '92%', delay: '0.4s' },
  { top: '68%', left: '6%', delay: '0.8s' },
  { top: '78%', left: '88%', delay: '1.2s' },
  { top: '45%', left: '4%', delay: '0.6s' },
  { top: '38%', left: '94%', delay: '1s' },
];

function RealisticGradedSlab({
  card,
  image,
  sizeClass,
  hero,
  showEffects,
  theme,
  blurred,
  grader,
  grade,
}: {
  card: PokemonCard;
  image?: string;
  sizeClass: string;
  hero: boolean;
  showEffects: boolean;
  theme?: PullTheme;
  blurred: boolean;
  grader: string;
  grade: string;
}) {
  const setName = (card.set?.name || 'Pokémon TCG').toUpperCase();
  const cardTitle = card.name.toUpperCase();
  const cardNum = card.number ? `#${card.number}` : '';
  const glowRgb = theme?.glowRgb ?? '251,191,36';

  return (
    <div className={`relative ${hero ? 'h-full w-full' : 'mx-auto w-fit'}`}>
      {showEffects && (
        <>
          <div
            className="pointer-events-none absolute left-1/2 bottom-2 z-0 h-6 w-[78%] -translate-x-1/2 rounded-full bg-black/45 blur-xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 z-0 rounded-2xl"
            style={{
              background: `radial-gradient(circle at 50% 40%, rgba(${glowRgb},0.22), transparent 62%)`,
            }}
            aria-hidden
          />
          {SPARKLE_POSITIONS.map((pos, i) => (
            <span
              key={i}
              className="pointer-events-none absolute z-0 h-1 w-1 rounded-full motion-safe:animate-pulse"
              style={{
                top: pos.top,
                left: pos.left,
                animationDelay: pos.delay,
                backgroundColor: `rgba(${glowRgb},0.7)`,
              }}
              aria-hidden
            />
          ))}
        </>
      )}

      <div
        className={`relative z-10 mx-auto flex min-h-0 flex-col ${hero ? 'h-full w-full' : sizeClass}`}
      >
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
          <div className="pointer-events-none absolute inset-0 z-[8]" aria-hidden>
            <div className="absolute inset-x-[4%] top-[1.5%] h-[2px] rounded-full bg-white/70" />
            <div className="absolute -top-[12%] left-[6%] h-[24%] w-[40%] rotate-[24deg] bg-gradient-to-r from-white/0 via-white/30 to-white/0" />
            <div className="absolute bottom-[14%] left-[1.5%] top-[14%] w-[2px] bg-gradient-to-b from-white/0 via-white/40 to-white/0" />
            <div className="absolute bottom-[30%] right-[1.5%] top-[30%] w-px bg-gradient-to-b from-white/0 via-white/25 to-white/0" />
            <div className="absolute inset-x-[6%] bottom-[1%] h-[2px] rounded-full bg-white/25" />
            <div className="absolute left-[5px] top-[4px] h-[9%] w-[6%] rounded-tl-[4px] bg-gradient-to-br from-white/60 to-transparent" />
            <div className="absolute bottom-[4px] right-[5px] h-[7%] w-[5%] rounded-br-[4px] bg-gradient-to-tl from-white/40 to-transparent" />
            <div className="absolute inset-0 rounded-[3px] ring-1 ring-inset ring-white/25" />
          </div>

          <div className="relative z-[5] mx-[2.5%] mt-[2.5%] flex h-[11%] shrink-0 flex-col overflow-hidden rounded-[2px] border border-slate-300/90 bg-white shadow-[0_2px_6px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.95)]">
            <div className="flex h-full items-center justify-between gap-2 px-[4%]">
              <div className="min-w-0 leading-none">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[9px] font-black italic tracking-tight text-[#c41e3a] sm:text-[11px]">
                    {grader}
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
                  {grade}
                </p>
                {cardNum && (
                  <p className="mt-[2px] text-[6px] font-semibold text-slate-500 sm:text-[7px]">
                    {cardNum}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="relative z-[5] mx-[2.5%] mb-[2.5%] min-h-0 flex-1 p-[2.5%] pt-[1.5%]">
            {image ? (
              <img
                src={image}
                alt={blurred ? '' : card.name}
                className={cn(
                  'h-full w-full object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,0.45)]',
                  blurred && 'scale-105 blur-[10px] brightness-75 contrast-75'
                )}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center rounded-sm bg-slate-900 p-3 text-white">
                <p className="text-center text-sm font-bold">{blurred ? ' ' : card.name}</p>
              </div>
            )}
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent"
              aria-hidden
            />
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
  theme,
  rarityClassName = 'from-gray-400 to-gray-500',
  imageClassName = '',
  size = 'results',
  hero = false,
  showSlabEffects = false,
  blurred = false,
  grader = 'PSA',
  grade = '10',
}) => {
  const image = card.images?.large || card.images?.small;
  if (isSlab) {
    const sizeClass = hero
      ? 'h-full w-full'
      : size === 'reveal'
        ? 'h-[min(68vh,36rem)] w-auto max-w-[min(82vw,24rem)]'
        : size === 'detail'
          ? 'h-[min(60dvh,32rem)] w-auto max-w-[min(72vw,22rem)]'
          : 'h-[min(45vh,22rem)] w-auto max-w-[min(72vw,18rem)]';
    return (
      <RealisticGradedSlab
        card={card}
        image={image}
        sizeClass={sizeClass}
        hero={hero}
        showEffects={showSlabEffects && !blurred}
        theme={theme}
        blurred={blurred}
        grader={(grader || 'PSA').toUpperCase()}
        grade={grade || '10'}
      />
    );
  }

  const rawShell = hero
    ? 'h-full max-h-full w-auto max-w-full'
    : size === 'reveal'
      ? 'max-h-[min(68vh,36rem)] w-auto max-w-[min(78vw,22rem)]'
      : 'max-h-[min(46vh,380px)] w-auto max-w-[min(72vw,20rem)]';

  if (hero) {
    return (
      <div className="relative flex h-full w-full items-center justify-center">
        <div
          className={cn(
            'pointer-events-none absolute inset-[-12%] rounded-[2rem]',
            theme?.glow ?? `bg-gradient-to-br opacity-30 blur-3xl ${rarityClassName}`
          )}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-[8%] left-1/2 h-8 w-[70%] -translate-x-1/2 rounded-full bg-black/40 blur-2xl"
          aria-hidden
        />
        {image ? (
          <img
            src={image}
            alt={blurred ? '' : card.name}
            className={cn(
              'relative z-10 max-h-full w-auto max-w-full object-contain drop-shadow-[0_24px_48px_rgba(0,0,0,0.55)]',
              blurred && 'scale-105 blur-[12px] brightness-50'
            )}
          />
        ) : (
          <div className="relative z-10 flex flex-col items-center justify-center rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 p-6 text-white">
            <p className="text-lg font-bold">{card.name}</p>
            <p className="mt-1 text-sm text-gray-400">{card.set?.name}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${hero ? 'flex h-full w-full items-center justify-center' : ''}`}>
      <div
        className={cn(
          'overflow-hidden rounded-2xl border-2 p-[3px] shadow-2xl',
          theme ? theme.border : 'border-transparent',
          theme ? 'bg-surface-inset' : `bg-gradient-to-br ${rarityClassName}`,
          rawShell
        )}
      >
        {image ? (
          <img
            src={image}
            alt={blurred ? '' : card.name}
            className={cn(
              'mx-auto block rounded-[0.85rem] object-contain',
              hero ? 'h-full max-h-full w-auto' : imageClassName,
              blurred && 'scale-105 blur-[12px] brightness-50'
            )}
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
    </div>
  );
};

interface PackPullKindBadgeProps {
  isSlab?: boolean;
  theme?: PullTheme;
  className?: string;
}

export const PackPullKindBadge: React.FC<PackPullKindBadgeProps> = ({
  isSlab = false,
  theme,
  className = '',
}) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
      theme
        ? theme.badge
        : isSlab
          ? 'border border-amber-400/45 bg-amber-500/12 text-amber-300'
          : 'border border-foil/35 bg-foil/10 text-foil',
      className
    )}
  >
    {theme?.label ?? (isSlab ? 'PSA 10' : 'Raw')}
  </span>
);
