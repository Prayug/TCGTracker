import type { VaultActivityItem, VaultCard } from '../../../types/pokemon';
import { CardArt } from '../../../components/exchange/CardArt';
import { Delta, Price, Unavailable } from '../../../components/exchange/Price';
import { AllocationBars } from '../../../components/exchange/AllocationBars';
import { formatCurrency } from '../../../utils/cardDisplay';
import { allocateBy, byEra, bySet, concentration, topHoldings } from '../../../utils/portfolio';
import { holdingMarketValue, knownHoldingProfit } from '../../../utils/vaultCost';
import { type SetRollup, rollupBySet } from '../ledger';

/** Showcase: the collection as objects, most valuable first. */
export function VaultGallery({
  rows,
  onOpen,
}: {
  rows: VaultCard[];
  onOpen: (vc: VaultCard) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:gap-x-6 lg:grid-cols-4 xl:grid-cols-6">
      {rows.map((vc) => {
        const pl = knownHoldingProfit(vc);
        return (
          <li key={vc.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(vc)}
              className="group block w-full text-left"
            >
              <span className="relative block">
                <CardArt
                  card={vc.card}
                  className="transition-transform duration-150 motion-safe:group-hover:-translate-y-1"
                />
                {vc.quantity > 1 ? (
                  <span className="absolute right-2 top-2 rounded bg-surface-overlay/95 px-1.5 font-mono text-[11.5px] shadow-sm">
                    ×{vc.quantity}
                  </span>
                ) : null}
              </span>
              <span className="mt-2.5 block truncate text-[13.5px] font-medium group-hover:underline">
                {vc.card.name}
              </span>
              <span className="block truncate text-meta text-ink-muted">
                {vc.card.set?.name}
                {vc.card.number ? ` · No. ${vc.card.number}` : ''}
              </span>
              <span className="mt-1 flex items-baseline gap-2">
                <Price value={holdingMarketValue(vc)} size="sm" />
                {pl?.profitPct != null ? <Delta pct={pl.profitPct} /> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SetRow({ row, onOpenSet }: { row: SetRollup; onOpenSet?: (key: string) => void }) {
  const pl = row.knownCost > 0 || row.knownMarket > 0 ? row.knownMarket - row.knownCost : null;
  const pct = pl != null && row.knownCost > 0 ? (pl / row.knownCost) * 100 : null;
  return (
    <tr>
      <th scope="row" className="text-left font-normal">
        {onOpenSet && row.key !== 'unknown' ? (
          <button
            type="button"
            onClick={() => onOpenSet(row.key)}
            className="max-w-[46vw] truncate text-left font-medium hover:underline sm:max-w-none"
          >
            {row.name}
          </button>
        ) : (
          <span className="font-medium">{row.name}</span>
        )}
        <span className="block text-meta text-ink-muted">
          {row.releaseDate ? new Date(row.releaseDate).getFullYear() : 'Release date unknown'}
        </span>
      </th>
      <td className="num">{row.entries}</td>
      <td className="num hidden sm:table-cell">{row.copies}</td>
      <td className="num">
        <Price value={row.value} size="sm" />
      </td>
      <td className="num hidden md:table-cell">
        {pl != null ? <Delta pct={pct} amount={pl} /> : <span className="text-ink-muted">—</span>}
      </td>
      <td className="num hidden md:table-cell">
        {row.missingCost > 0 ? (
          <span className="text-warn">{row.missingCost}</span>
        ) : (
          <span className="text-ink-muted">0</span>
        )}
      </td>
    </tr>
  );
}

/** By set: where the collection sits and how much of each set has a cost record. */
export function VaultSets({
  cards,
  onOpenSet,
}: {
  cards: VaultCard[];
  onOpenSet?: (key: string) => void;
}) {
  const rows = rollupBySet(cards);
  return (
    <div className="overflow-x-auto">
      <table className="ledger ledger-tight">
        <caption className="sr-only">Holdings grouped by set</caption>
        <thead>
          <tr>
            <th scope="col">Set</th>
            <th scope="col" className="num">
              Cards
            </th>
            <th scope="col" className="num hidden sm:table-cell">
              Copies
            </th>
            <th scope="col" className="num">
              Market value
            </th>
            <th scope="col" className="num hidden md:table-cell">
              Unrealized (known cost)
            </th>
            <th scope="col" className="num hidden md:table-cell">
              Missing cost
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <SetRow key={r.key} row={r} onOpenSet={onOpenSet} />
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] text-ink-muted">
        Set completion lives on each set’s page, where the full checklist is loaded.
      </p>
    </div>
  );
}

/**
 * What the collection is made of. There is no stored value history, so
 * this shows composition and concentration instead of a fabricated line.
 */
export function VaultAnalysis({
  cards,
  onFilterSet,
}: {
  cards: VaultCard[];
  onFilterSet: (setKey: string) => void;
}) {
  const sets = allocateBy(cards, bySet, 6);
  const eras = allocateBy(cards, byEra, 4);
  const top = topHoldings(cards, 5);
  const total = cards.reduce((s, vc) => s + Math.max(0, holdingMarketValue(vc)), 0);
  const conc = concentration(cards, 5);
  if (total <= 0) {
    return (
      <Unavailable title="Nothing to analyse yet">
        None of your holdings has a market price, so there is no value to break down.
      </Unavailable>
    );
  }
  return (
    <div className="grid gap-x-10 gap-y-10 lg:grid-cols-2">
      <section aria-labelledby="alloc-set">
        <h2 id="alloc-set" className="text-h2">
          By set
        </h2>
        <p className="mb-3 text-meta text-ink-muted">Share of priced market value</p>
        <AllocationBars
          slices={sets}
          title="Market value by set"
          onSelect={(s) => onFilterSet(s.key)}
        />
      </section>
      <section aria-labelledby="alloc-era">
        <h2 id="alloc-era" className="text-h2">
          By era
        </h2>
        <p className="mb-3 text-meta text-ink-muted">
          Vintage to 2003 · Mid-era 2004–2016 · Modern 2017 on
        </p>
        <AllocationBars slices={eras} title="Market value by era" />
      </section>
      <section aria-labelledby="alloc-top" className="lg:col-span-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="alloc-top" className="text-h2">
            Concentration
          </h2>
          <p className="text-meta text-ink-muted">
            Your five largest holdings are{' '}
            <span className="font-mono text-ink-primary">{Math.round(conc * 100)}%</span> of value
          </p>
        </div>
        <table className="ledger ledger-tight mt-2">
          <caption className="sr-only">Largest holdings and their share of value</caption>
          <thead>
            <tr>
              <th scope="col">Holding</th>
              <th scope="col" className="num">
                Value
              </th>
              <th scope="col" className="num">
                Share
              </th>
              <th scope="col" className="hidden w-1/3 sm:table-cell">
                <span className="sr-only">Share bar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {top.map((vc) => {
              const v = holdingMarketValue(vc);
              const share = v / total;
              return (
                <tr key={vc.id}>
                  <th scope="row" className="text-left font-normal">
                    <span className="block max-w-[42vw] truncate font-medium sm:max-w-none">
                      {vc.card.name}
                    </span>
                    <span className="block text-meta text-ink-muted">{vc.card.set?.name}</span>
                  </th>
                  <td className="num">{formatCurrency(v)}</td>
                  <td className="num">{Math.round(share * 100)}%</td>
                  <td className="hidden sm:table-cell">
                    <span className="block h-2 rounded-sm bg-surface-hover" aria-hidden>
                      <span
                        className="block h-full rounded-sm bg-ink-primary"
                        style={{ width: `${share * 100}%` }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 max-w-[68ch] text-[12px] text-ink-muted">
          TCGTracker does not keep a daily record of your collection’s value, so there is no value
          chart. Movement for individual cards is on each card’s research page.
        </p>
      </section>
    </div>
  );
}

const ACTION_LABEL: Record<VaultActivityItem['action'], string> = {
  add: 'Added',
  update: 'Edited',
  remove: 'Removed',
  clear: 'Cleared the collection',
  import: 'Imported',
};

export function VaultActivity({ items }: { items: VaultActivityItem[] }) {
  if (items.length === 0) {
    return (
      <Unavailable title="No activity yet">
        Additions, edits, imports and removals are recorded here.
      </Unavailable>
    );
  }
  return (
    <ol className="max-w-3xl">
      {items.map((item) => (
        <li
          key={item.id}
          className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 border-b border-rule py-2.5 text-[13.5px]"
        >
          <time dateTime={item.at} className="font-mono text-[12px] tabular-nums text-ink-muted">
            {new Date(item.at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </time>
          <p className="min-w-0">
            <span className="font-medium">{ACTION_LABEL[item.action]}</span>
            {item.cardName ? <span className="text-ink-secondary"> {item.cardName}</span> : null}
            {item.detail ? (
              <span className="block text-meta text-ink-muted">{item.detail}</span>
            ) : null}
          </p>
        </li>
      ))}
    </ol>
  );
}
