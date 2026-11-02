import { useId, useState } from 'react';
import type { CatalogState, FacetOption, PriceBand } from './catalogFilters';
import { PRICE_BANDS } from './catalogFilters';
import { cn } from '@/lib/utils';

interface FilterRailProps {
  state: CatalogState;
  facets: { sets: FacetOption[]; rarities: FacetOption[]; types: FacetOption[] };
  typeLabel: string;
  onChange: (patch: Partial<CatalogState>) => void;
  onReset: () => void;
  activeCount: number;
}

const COLLAPSED = 8;

function FacetGroup({
  legend,
  name,
  options,
  value,
  onSelect,
}: {
  legend: string;
  name: string;
  options: FacetOption[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  if (options.length === 0) return null;
  // Keep the selected option visible even when the list is collapsed.
  const shown = expanded ? options : options.slice(0, COLLAPSED);
  if (value && !shown.some((o) => o.value === value)) {
    const sel = options.find((o) => o.value === value);
    if (sel) shown.push(sel);
  }
  return (
    <fieldset className="border-t border-rule py-3">
      <legend className="float-left mb-1.5 w-full text-h3">{legend}</legend>
      <div className="clear-both space-y-px">
        <Radio
          id={`${id}-any`}
          name={name}
          checked={!value}
          onChange={() => onSelect('')}
          label="Any"
        />
        {shown.map((o) => (
          <Radio
            key={o.value}
            id={`${id}-${o.value}`}
            name={name}
            checked={value === o.value}
            onChange={() => onSelect(o.value)}
            label={o.value}
            count={o.count}
          />
        ))}
      </div>
      {options.length > COLLAPSED ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1.5 text-[12.5px] text-accent hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? 'Show fewer' : `Show all ${options.length}`}
        </button>
      ) : null}
    </fieldset>
  );
}

function Radio({
  id,
  name,
  checked,
  onChange,
  label,
  count,
}: {
  id: string;
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  count?: number;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-[32px] cursor-pointer items-center gap-2 rounded-md px-1.5 text-[13px] hover:bg-surface-hover',
        checked ? 'text-ink-primary' : 'text-ink-secondary'
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
      />
      <span className={cn('min-w-0 flex-1 truncate', checked && 'font-medium')} title={label}>
        {label}
      </span>
      {count != null ? (
        <span className="font-mono text-[11.5px] tabular-nums text-ink-muted">{count}</span>
      ) : null}
    </label>
  );
}

/**
 * Facets computed from the current result set, with counts, so a filter
 * never leads to an empty page you could not have predicted.
 */
export function FilterRail({
  state,
  facets,
  typeLabel,
  onChange,
  onReset,
  activeCount,
}: FilterRailProps) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="text-h2">Filters</h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onReset}
            className="text-[12.5px] text-accent hover:underline"
          >
            Clear {activeCount}
          </button>
        ) : null}
      </div>
      <fieldset className="border-t border-rule py-3">
        <legend className="float-left mb-1.5 w-full text-h3">Market price</legend>
        <div className="clear-both space-y-px">
          <Radio
            id={`${id}-p-all`}
            name={`${id}-price`}
            checked={state.price === 'all'}
            onChange={() => onChange({ price: 'all' })}
            label="Any, including unpriced"
          />
          {PRICE_BANDS.map((b) => (
            <Radio
              key={b.value}
              id={`${id}-p-${b.value}`}
              name={`${id}-price`}
              checked={state.price === b.value}
              onChange={() => onChange({ price: b.value as PriceBand })}
              label={b.label}
            />
          ))}
        </div>
      </fieldset>
      <FacetGroup
        legend="Set"
        name={`${id}-set`}
        options={facets.sets}
        value={state.set}
        onSelect={(set) => onChange({ set })}
      />
      <FacetGroup
        legend="Rarity"
        name={`${id}-rarity`}
        options={facets.rarities}
        value={state.rarity}
        onSelect={(rarity) => onChange({ rarity })}
      />
      <FacetGroup
        legend={typeLabel}
        name={`${id}-type`}
        options={facets.types}
        value={state.type}
        onSelect={(type) => onChange({ type })}
      />
      <p className="border-t border-rule pt-3 text-[11.5px] leading-relaxed text-ink-muted">
        Counts reflect the current search. Price bands use the TCGplayer Near Mint market estimate
        and leave out cards with no price.
      </p>
    </div>
  );
}
