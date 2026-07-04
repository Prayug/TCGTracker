import React, { useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { SortOption } from '../../../types/pokemon';
import { OnePieceSortOption } from '../../../types/onepiece';
import { getSortOptions } from '../../../utils/sorting';
import { SectionLabel } from '../../../components/common/SectionLabel';

export interface MarketplaceFilters {
  setName: string;
  rarity: string;
  priceRange: string;
  cardType: string;
}

interface FilterSidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  filters: MarketplaceFilters;
  onFiltersChange: (filters: MarketplaceFilters) => void;
  sortBy: SortOption | OnePieceSortOption;
  onSortChange: (sort: SortOption | OnePieceSortOption) => void;
  setOptions: string[];
  rarityOptions: string[];
  typeOptions: string[];
  onReset: () => void;
  isOnePiece?: boolean;
}

const priceRanges = [
  { value: 'all', label: 'All Prices' },
  { value: '0-10', label: 'Under $10' },
  { value: '10-50', label: '$10 - $50' },
  { value: '50-150', label: '$50 - $150' },
  { value: '150+', label: '$150+' },
];

function FilterGroup({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border-subtle last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="text-xs font-medium text-ink-secondary">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-ink-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${
          open ? 'grid-rows-[1fr] pb-3 opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

function SidebarPanel({
  filters,
  onFiltersChange,
  sortBy,
  onSortChange,
  setOptions,
  rarityOptions,
  typeOptions,
  onReset,
  isOnePiece = false,
}: Omit<FilterSidebarProps, 'isMobileOpen' | 'onCloseMobile'>) {
  const sortOptions = getSortOptions(isOnePiece ? 'onepiece' : 'pokemon');

  const setFilter = (key: keyof MarketplaceFilters, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const selectClass =
    'h-10 w-full rounded-lg border border-border-default bg-surface-inset px-3 text-sm text-ink-primary focus:border-accent focus:outline-none';

  return (
    <div className="h-full rounded-xl border border-border-default bg-surface-raised p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel className="!flex items-center gap-2 !text-ink-secondary">
          <SlidersHorizontal className="h-3.5 w-3.5 text-violet-300" />
          Filters
        </SectionLabel>
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-medium text-ink-muted transition-colors hover:text-ink-secondary"
        >
          Reset
        </button>
      </div>

      <FilterGroup title="Sort" defaultOpen>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption | OnePieceSortOption)}
          className={selectClass}
          aria-label="Sort cards"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup title="Set">
        <select value={filters.setName} onChange={(e) => setFilter('setName', e.target.value)} className={selectClass} aria-label="Filter by set">
          <option value="all">All Sets</option>
          {setOptions.map((setName) => (
            <option key={setName} value={setName}>
              {setName}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup title="Rarity">
        <select value={filters.rarity} onChange={(e) => setFilter('rarity', e.target.value)} className={selectClass} aria-label="Filter by rarity">
          <option value="all">All Rarities</option>
          {rarityOptions.map((rarity) => (
            <option key={rarity} value={rarity}>
              {rarity}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup title="Price range">
        <select
          value={filters.priceRange}
          onChange={(e) => setFilter('priceRange', e.target.value)}
          className={selectClass}
          aria-label="Filter by price range"
        >
          {priceRanges.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup title={isOnePiece ? 'Color' : 'Type'} defaultOpen={true}>
        <select value={filters.cardType} onChange={(e) => setFilter('cardType', e.target.value)} className={selectClass} aria-label={`Filter by ${isOnePiece ? 'color' : 'type'}`}>
          <option value="all">All Types</option>
          {typeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </FilterGroup>
    </div>
  );
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  isMobileOpen = false,
  onCloseMobile,
  ...props
}) => (
  <>
    <div className="hidden lg:block">
      <SidebarPanel {...props} />
    </div>

    {isMobileOpen && (
      <div className="fixed inset-0 z-40 bg-black/55 lg:hidden" role="dialog" aria-modal="true">
        <div className="absolute right-0 top-0 h-full w-[88%] max-w-sm border-l border-border-subtle bg-[#0b111d] p-4">
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={onCloseMobile}
              className="rounded-lg border border-border-default p-2 text-ink-secondary"
              aria-label="Close filters"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <SidebarPanel {...props} />
        </div>
      </div>
    )}
  </>
);
