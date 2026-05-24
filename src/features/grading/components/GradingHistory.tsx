import React from 'react';
import { GradingResult } from '../../../types/grading';
import { GradeBadge } from './GradeBadge';

interface GradingHistoryProps {
  history: GradingResult[];
  onSelect?: (result: GradingResult) => void;
  selectedId?: string;
}

export const GradingHistory: React.FC<GradingHistoryProps> = ({
  history,
  onSelect,
  selectedId,
}) => {
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-inset/40 px-4 py-8 text-center text-sm text-ink-muted">
        No graded cards yet. Capture or upload a card to start.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {history.map((item) => {
        const active = item.id === selectedId;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect?.(item)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                active
                  ? 'border-accent/40 bg-accent/10'
                  : 'border-border-subtle bg-surface-inset/50 hover:border-border-default'
              }`}
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-14 w-10 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-white/5 text-[10px] text-ink-muted">
                  N/A
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-primary">
                  {item.cardName || 'Unknown Card'}
                </p>
                <p className="text-xs text-ink-muted">
                  {item.grade}/10 · {item.gradeLabel}
                </p>
                <p className="text-[10px] text-ink-muted">
                  {new Date(item.timestamp).toLocaleString()}
                </p>
              </div>
              <GradeBadge grade={item.grade} size="sm" />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
