import type { VaultActivityItem, VaultCard } from '../../../types/pokemon';
import { Delta, Price, Unavailable } from '../../../components/exchange/Price';
import { type SetRollup, rollupBySet } from '../ledger';

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
