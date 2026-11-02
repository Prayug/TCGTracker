import { useMemo, useState } from 'react';
import type { VaultCard } from '../../../types/pokemon';
import { vaultService } from '../../../services/vaultService';
import { CardArt } from '../../../components/exchange/CardArt';
import { Price } from '../../../components/exchange/Price';
import { costStatus, holdingMarketValue } from '../../../utils/vaultCost';
import { costUpdate, parseCostInput } from '../ledger';
import { cn } from '@/lib/utils';

/**
 * Review of costs the app cannot vouch for: prices an older import stored
 * (often the market price of that day) and holdings with no cost at all.
 * Nothing changes until the user confirms, corrects or clears a row.
 */
export function CostReview({
  cards,
  game,
  onShowAll,
}: {
  cards: VaultCard[];
  game: 'pokemon' | 'onepiece';
  onShowAll: () => void;
}) {
  const unverified = useMemo(
    () =>
      cards
        .filter((vc) => costStatus(vc) === 'unverified')
        .sort((a, b) => holdingMarketValue(b) - holdingMarketValue(a)),
    [cards]
  );
  const unknown = useMemo(() => cards.filter((vc) => costStatus(vc) === 'unknown').length, [cards]);
  const [confirmAll, setConfirmAll] = useState(false);

  if (unverified.length === 0 && unknown === 0) return null;
  const shown = unverified.slice(0, 5);

  return (
    <section
      aria-labelledby="cost-review-h"
      className="rounded-3xl border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-warn-muted p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[62ch]">
          <h3 id="cost-review-h" className="font-display text-[19px] font-semibold">
            Review your costs
          </h3>
          <p className="mt-1 text-[13px] text-ink-secondary">
            {unverified.length > 0 ? (
              <>
                <span className="font-medium">{unverified.length}</span> holding
                {unverified.length === 1 ? ' has' : 's have'} a price an older import stored,
                possibly the market price that day. Those are kept as they are and left out of P/L
                until you confirm or correct them.{' '}
              </>
            ) : null}
            {unknown > 0 ? (
              <>
                <span className="font-medium">{unknown}</span> holding
                {unknown === 1 ? ' has' : 's have'} no cost recorded.
              </>
            ) : null}
          </p>
        </div>
        <button type="button" onClick={onShowAll} className="btn-ghost h-9 text-[13px]">
          Open in holdings
        </button>
      </div>

      {shown.length > 0 ? (
        <ul className="mt-4 divide-y divide-rule">
          {shown.map((vc) => (
            <CostRow key={vc.id} vc={vc} game={game} />
          ))}
        </ul>
      ) : null}

      {unverified.length > 1 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
          {confirmAll ? (
            <>
              <span className="text-ink-secondary">
                Confirm all {unverified.length} stored prices as what you paid?
              </span>
              <button
                type="button"
                className="btn-primary h-8 px-3"
                onClick={() => {
                  vaultService.confirmCosts(
                    unverified.map((v) => v.id),
                    game
                  );
                  setConfirmAll(false);
                }}
              >
                Yes, confirm all
              </button>
              <button type="button" className="btn-ghost h-8" onClick={() => setConfirmAll(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => setConfirmAll(true)}
            >
              These prices are all what I paid
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function CostRow({ vc, game }: { vc: VaultCard; game: 'pokemon' | 'onepiece' }) {
  const [draft, setDraft] = useState(vc.purchasePrice.toFixed(2));
  const [invalid, setInvalid] = useState(false);
  const market = holdingMarketValue(vc) / Math.max(1, vc.quantity);
  const id = `cr-${vc.id}`;
  const save = () => {
    const parsed = parseCostInput(draft);
    if (parsed === undefined) return setInvalid(true);
    vaultService.updateVaultCard(vc.id, costUpdate(parsed), game);
  };
  return (
    <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]">
      <CardArt card={vc.card} flat />
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium">{vc.card.name}</p>
        <p className="truncate text-[12px] text-ink-muted">
          {vc.card.set?.name}
          {vc.quantity > 1 ? ` · ${vc.quantity} copies` : ''} · market{' '}
          {market > 0 ? <Price value={market} size="sm" className="inline" /> : 'unpriced'}
        </p>
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1">
        <label htmlFor={id} className="sr-only">
          Paid per card for {vc.card.name}
        </label>
        <span className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[12px] text-ink-muted">
            $
          </span>
          <input
            id={id}
            inputMode="decimal"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setInvalid(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            aria-invalid={invalid}
            className={cn(
              'input h-8 w-24 pl-5 text-right font-mono text-[13px] tabular-nums',
              invalid && 'border-loss'
            )}
          />
        </span>
        {parseCostInput(draft) === vc.purchasePrice ? (
          <button
            type="button"
            className="btn-ghost h-8 text-[12.5px]"
            onClick={() => vaultService.confirmCosts([vc.id], game)}
          >
            Confirm
          </button>
        ) : (
          <button type="button" className="btn-primary h-8 px-3 text-[12.5px]" onClick={save}>
            Save
          </button>
        )}
        <button
          type="button"
          className="text-[12.5px] text-ink-muted hover:text-ink-primary"
          onClick={() => vaultService.updateVaultCard(vc.id, costUpdate(null), game)}
          title="Clear the stored price and mark the cost as unknown"
        >
          Don’t know
        </button>
      </div>
    </li>
  );
}
