import React from 'react';
import { VaultActivityItem } from '../../../types/pokemon';
import { cn } from '@/lib/utils';

interface VaultActivityFeedProps {
  items: VaultActivityItem[];
}

const ACTION_LABEL: Record<VaultActivityItem['action'], string> = {
  add: 'Added',
  update: 'Updated',
  remove: 'Removed',
  clear: 'Cleared',
  import: 'Imported',
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const VaultActivityFeed: React.FC<VaultActivityFeedProps> = ({ items }) => {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-default px-6 py-12 text-center">
        <p className="text-sm text-ink-secondary">No activity yet.</p>
        <p className="mt-1 text-xs text-ink-muted">
          Additions, edits, imports, and removals will show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised">
      {items.map((item, i) => (
        <li
          key={item.id}
          className={cn(
            'flex items-start justify-between gap-4 px-4 py-3',
            i < items.length - 1 && 'border-b border-border-subtle'
          )}
        >
          <div className="min-w-0">
            <p className="text-sm text-ink-primary">
              <span className="font-medium">{ACTION_LABEL[item.action]}</span>
              {item.cardName ? (
                <>
                  {' '}
                  <span className="text-ink-secondary">{item.cardName}</span>
                </>
              ) : null}
            </p>
            {item.detail ? (
              <p className="mt-0.5 text-xs text-ink-muted">{item.detail}</p>
            ) : null}
          </div>
          <time
            dateTime={item.at}
            className="shrink-0 font-mono text-[11px] tabular-nums text-ink-muted"
          >
            {relativeTime(item.at)}
          </time>
        </li>
      ))}
    </ul>
  );
};
