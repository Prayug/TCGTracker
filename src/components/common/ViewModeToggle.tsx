import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewMode = 'grid' | 'list';

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Icon-only compact control (vault toolbar). */
  compact?: boolean;
  className?: string;
}

export function ViewModeToggle({
  viewMode,
  onChange,
  compact = false,
  className,
}: ViewModeToggleProps) {
  return (
    <div
      className={cn(
        'inline-flex rounded-lg border border-border-default bg-surface-inset p-0.5',
        className
      )}
    >
      <button
        type="button"
        onClick={() => onChange('grid')}
        className={cn(
          'inline-flex cursor-pointer items-center justify-center rounded-md text-xs font-medium transition-colors',
          compact ? 'p-1.5' : 'gap-1.5 px-2.5 py-1.5',
          viewMode === 'grid' ? 'bg-white/12 text-white' : 'text-ink-muted hover:text-ink-secondary'
        )}
        aria-pressed={viewMode === 'grid'}
        aria-label="Grid view"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        {compact ? null : 'Grid'}
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        className={cn(
          'inline-flex cursor-pointer items-center justify-center rounded-md text-xs font-medium transition-colors',
          compact ? 'p-1.5' : 'gap-1.5 px-2.5 py-1.5',
          viewMode === 'list' ? 'bg-white/12 text-white' : 'text-ink-muted hover:text-ink-secondary'
        )}
        aria-pressed={viewMode === 'list'}
        aria-label="List view"
      >
        <List className="h-3.5 w-3.5" />
        {compact ? null : 'List'}
      </button>
    </div>
  );
}
