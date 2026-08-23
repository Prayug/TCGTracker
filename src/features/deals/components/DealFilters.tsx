import { FilterBar, FilterChip } from '../../../components/layout/PageShell';
import type { DealFiltersState, DealSort } from '../types';

const SORTS: { id: DealSort; label: string }[] = [
  { id: 'best', label: 'Best Deal' },
  { id: 'discount_pct', label: 'Largest %' },
  { id: 'savings', label: 'Largest $' },
  { id: 'price', label: 'Lowest Price' },
  { id: 'market', label: 'Highest Market' },
  { id: 'ending', label: 'Ending Soon' },
];

export function DealFilters({
  filters,
  onChange,
}: {
  filters: DealFiltersState;
  onChange: (next: DealFiltersState) => void;
}) {
  return (
    <div className="space-y-3">
      <FilterBar>
        {SORTS.map((sort) => (
          <FilterChip
            key={sort.id}
            active={filters.sort === sort.id}
            onClick={() => onChange({ ...filters, sort: sort.id })}
            className="text-xs"
          >
            {sort.label}
          </FilterChip>
        ))}
      </FilterBar>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border-subtle bg-surface-raised/60 p-3">
        <label className="text-xs text-ink-muted">
          Min discount %
          <input
            type="number"
            min={0}
            max={90}
            value={filters.minDiscount}
            onChange={(e) => onChange({ ...filters, minDiscount: Number(e.target.value) || 0 })}
            className="input mt-1 h-9 w-24"
          />
        </label>
        <label className="text-xs text-ink-muted">
          Min savings $
          <input
            type="number"
            min={0}
            value={filters.minSavings}
            onChange={(e) => onChange({ ...filters, minSavings: Number(e.target.value) || 0 })}
            className="input mt-1 h-9 w-24"
          />
        </label>
        <label className="text-xs text-ink-muted">
          Min market $
          <input
            type="number"
            min={0}
            value={filters.minMarketValue}
            onChange={(e) => onChange({ ...filters, minMarketValue: Number(e.target.value) || 0 })}
            className="input mt-1 h-9 w-28"
          />
        </label>
        <label className="text-xs text-ink-muted">
          Auction margin %
          <input
            type="number"
            min={0}
            max={90}
            value={filters.desiredAuctionMargin}
            onChange={(e) =>
              onChange({ ...filters, desiredAuctionMargin: Number(e.target.value) || 0 })
            }
            className="input mt-1 h-9 w-24"
          />
        </label>
        <label className="text-xs text-ink-muted">
          Set
          <input
            type="text"
            value={filters.set}
            onChange={(e) => onChange({ ...filters, set: e.target.value })}
            placeholder="Any set"
            className="input mt-1 h-9 w-40"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={filters.freeShipping}
            onChange={(e) => onChange({ ...filters, freeShipping: e.target.checked })}
          />
          Free shipping
        </label>
        <FilterChip
          active={filters.listingType === 'bin'}
          onClick={() =>
            onChange({
              ...filters,
              listingType: filters.listingType === 'bin' ? 'all' : 'bin',
            })
          }
          className="text-xs"
        >
          Buy It Now
        </FilterChip>
        <FilterChip
          active={filters.listingType === 'auction'}
          onClick={() =>
            onChange({
              ...filters,
              listingType: filters.listingType === 'auction' ? 'all' : 'auction',
            })
          }
          className="text-xs"
        >
          Auction only
        </FilterChip>
        <FilterChip
          active={filters.gradingCompany === 'psa'}
          onClick={() =>
            onChange({
              ...filters,
              gradingCompany: filters.gradingCompany === 'psa' ? '' : 'psa',
            })
          }
          className="text-xs"
        >
          PSA
        </FilterChip>
        <FilterChip
          active={filters.gradingCompany === 'bgs'}
          onClick={() =>
            onChange({
              ...filters,
              gradingCompany: filters.gradingCompany === 'bgs' ? '' : 'bgs',
            })
          }
          className="text-xs"
        >
          BGS
        </FilterChip>
        <FilterChip
          active={filters.gradingCompany === 'cgc'}
          onClick={() =>
            onChange({
              ...filters,
              gradingCompany: filters.gradingCompany === 'cgc' ? '' : 'cgc',
            })
          }
          className="text-xs"
        >
          CGC
        </FilterChip>
        {(
          [
            ['nm', 'NM'],
            ['lp', 'LP'],
            ['mp', 'MP'],
            ['hp', 'HP'],
            ['damaged', 'Damaged'],
          ] as const
        ).map(([id, label]) => (
          <FilterChip
            key={id}
            active={filters.cardCondition === id}
            onClick={() =>
              onChange({
                ...filters,
                cardCondition: filters.cardCondition === id ? '' : id,
              })
            }
            className="text-xs"
          >
            {label}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}
