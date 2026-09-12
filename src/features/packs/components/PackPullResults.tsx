import React from 'react';
import { PackPull } from '../../../types/pokemon';
import { PackPullCardDisplay, PackPullKindBadge } from './PackPullCardDisplay';
import { getPullTheme } from '../packPresentation';
import { formatCurrency, formatPercent } from '../../../utils/cardDisplay';
import { getCardDeltaPct } from '../../../utils/cardPrice';
import { cn } from '../../../lib/utils';

interface PackPullResultsProps {
  packPull: PackPull;
  rarityClassName: string;
}

function SummaryBand({
  value,
  cost,
  profit,
  accentClass,
}: {
  value: number;
  cost: number;
  profit: number;
  accentClass: string;
}) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-xl border border-border-subtle bg-surface-inset/60 backdrop-blur-sm">
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-60',
          accentClass
        )}
        aria-hidden
      />
      <div className="grid grid-cols-3 divide-x divide-border-subtle/80">
        <div className="px-3 py-2.5 sm:px-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
            Pull value
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums leading-none text-ink-primary sm:text-xl">
            {formatCurrency(value)}
          </p>
        </div>
        <div className="px-3 py-2.5 sm:px-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
            Pack cost
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums leading-none text-ink-secondary sm:text-xl">
            {formatCurrency(cost)}
          </p>
        </div>
        <div className="px-3 py-2.5 sm:px-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">P/L</p>
          <p
            className={cn(
              'mt-0.5 text-lg font-bold tabular-nums leading-none sm:text-xl',
              profit >= 0 ? 'text-gain' : 'text-loss'
            )}
          >
            {formatCurrency(profit, { signed: true })}
          </p>
        </div>
      </div>
    </div>
  );
}

export const PackPullResults: React.FC<PackPullResultsProps> = ({ packPull, rarityClassName }) => {
  const card = packPull.cards[0];
  if (!card) return null;

  const isSlab = packPull.pullKind === 'slab';
  const theme = getPullTheme(packPull);
  const pullValue = packPull.totalValue;
  const move30 = getCardDeltaPct(card, '30d');
  const isWin = packPull.profit >= 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <SummaryBand
        value={pullValue}
        cost={packPull.pack.price}
        profit={packPull.profit}
        accentClass={theme.accent}
      />

      <div className="relative min-h-0 flex-1">
        <div
          className={cn('pointer-events-none absolute inset-0 opacity-70', theme.glow)}
          aria-hidden
        />

        <div
          className={cn(
            'relative grid h-full min-h-0 grid-cols-1 items-center gap-6 rounded-2xl border border-border-subtle/60 bg-surface-inset/30 p-4 sm:p-6',
            isSlab
              ? 'sm:grid-cols-2 sm:gap-8'
              : 'mx-auto max-w-3xl sm:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] sm:gap-8'
          )}
        >
          <div className="flex h-full min-h-[14rem] items-center justify-center sm:min-h-0">
            {isSlab ? (
              <div className="aspect-[0.68] h-full max-h-full w-auto">
                <PackPullCardDisplay
                  card={card}
                  isSlab
                  theme={theme}
                  rarityClassName={rarityClassName}
                  size="detail"
                  hero
                  showSlabEffects
                  grader={packPull.grader}
                  grade={packPull.grade}
                />
              </div>
            ) : (
              <div className="h-full max-h-[min(52vh,22rem)] w-full sm:max-h-full">
                <PackPullCardDisplay
                  card={card}
                  isSlab={false}
                  theme={theme}
                  rarityClassName={rarityClassName}
                  size="detail"
                  hero
                />
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col justify-center gap-4">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'h-px flex-1 bg-gradient-to-r from-current/40 to-transparent',
                  theme.accent
                )}
              />
              <p className={cn('text-[11px] font-bold uppercase tracking-[0.24em]', theme.accent)}>
                {theme.resultEyebrow}
              </p>
              <span
                className={cn(
                  'h-px flex-1 bg-gradient-to-l from-current/40 to-transparent',
                  theme.accent
                )}
              />
            </div>

            <div>
              <h3 className="font-display text-3xl font-semibold leading-tight text-ink-primary sm:text-[2.35rem]">
                {card.name}
              </h3>
              <p className="mt-1.5 text-sm text-ink-secondary sm:text-base">
                {card.set?.name || 'Unknown set'}
                {card.number ? ` · #${card.number}` : ''}
              </p>
            </div>

            {!isSlab && (
              <div
                className={cn(
                  'rounded-xl border px-4 py-3 backdrop-blur-sm',
                  isWin ? 'border-gain/25 bg-gain/5' : 'border-border-subtle bg-surface-overlay/40'
                )}
              >
                <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                  Market value
                </p>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-2xl font-bold tabular-nums text-ink-primary sm:text-3xl">
                    {formatCurrency(pullValue)}
                  </p>
                  {move30 != null ? (
                    <p
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        move30 >= 0 ? 'text-gain' : 'text-loss'
                      )}
                    >
                      {formatPercent(move30, { signed: true })} 30D
                    </p>
                  ) : null}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <PackPullKindBadge theme={theme} />
              {card.rarity ? (
                <span className="rounded-md border border-border-subtle bg-surface-overlay/50 px-2 py-0.5 text-xs font-medium text-ink-secondary sm:text-sm">
                  {card.rarity}
                </span>
              ) : null}
              {!isSlab ? (
                <span className="text-xs text-ink-muted sm:text-sm">NM equivalent</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
