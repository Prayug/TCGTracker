import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  /** Right-aligned mono figures. */
  numeric?: boolean;
  /** Hide below this breakpoint. */
  hideBelow?: 'sm' | 'md' | 'lg';
  className?: string;
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

/**
 * Ledger table: hairline rows, sticky-free, mono numbers right-aligned.
 * Built on the `.ledger` styles so it matches the vault and set tables.
 * Columns can drop out on small screens instead of scrolling sideways.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  caption,
  onRowClick,
  empty,
  className,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  caption?: string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  className?: string;
}) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className={cn('min-w-0', className)}>
      <table className="ledger ledger-tight">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  c.numeric && 'text-right',
                  c.hideBelow && HIDE[c.hideBelow],
                  c.className
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={rowKey(r, i)}
              className={onRowClick ? 'cursor-pointer' : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(c.numeric && 'num', c.hideBelow && HIDE[c.hideBelow], c.className)}
                >
                  {c.cell(r, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
